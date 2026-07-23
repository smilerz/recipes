import datetime
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from cookbook.models import InventoryEntry, InventoryLocation, InventoryLog

DEFAULT_LOCATION_NAME = 'Pantry'


def apply_shelf_life_expiry(food, expires, location):
    """FR-D1: default a lot's expiry to today + ``food.shelf_life_days`` when the caller gave none.

    An editable suggestion — returns the caller's ``expires`` untouched when it is already set, and
    ``None`` for a food with no shelf life (FR-D2). A freezer ``location`` mutes the suggestion
    entirely (DEC-4 B): pantry shelf life wildly understates freezer life, so a suggested date would
    be wrong data; an explicit ``expires`` still passes through. ``location`` is deliberately
    required — a caller that omits it would silently reintroduce autofill on freezer lots. Shared by
    every add-to-pantry path
    (the ``add_food_to_pantry`` helper and ``InventoryEntrySerializer.create``) so auto-expiry is
    applied consistently regardless of how the lot is created.
    """
    if location is not None and location.is_freezer:
        return expires
    if expires is None and food is not None and food.shelf_life_days:
        return timezone.localdate() + datetime.timedelta(days=food.shelf_life_days)
    return expires


def get_or_create_default_inventory_location(household, user, space):
    """Return the household's default InventoryLocation, creating a 'Pantry' one if none exists.

    Shared by every runtime add-to-pantry write (shopping check-off, the food_onhand /
    IngredientContextMenu in-pantry toggle, quick add, Stock up) and the onhand backfill — all of
    which need a non-null location for a new InventoryEntry
    (``InventoryEntry.inventory_location`` is a required FK). Scoping to the household matches the
    household-scoped inventory model (``InventoryLocation.household``).
    """
    location = InventoryLocation.objects.filter(household=household).order_by('id').first()
    if location is None:
        location = InventoryLocation.objects.create(
            name=DEFAULT_LOCATION_NAME,
            household=household,
            created_by=user,
            space=space,
        )
    return location


def finalize_new_inventory_entry(entry):
    """Assign a code (if unset) and write the B_ADD InventoryLog for a newly-created entry.

    Single source of truth shared by ``InventoryEntrySerializer.create()`` (the API path) and
    ``add_food_to_pantry()`` (the server-side path), so the two never drift.
    """
    with transaction.atomic():
        if not entry.code:
            entry.code = hex(entry.id)[2:].upper()
            entry.save()
        InventoryLog.objects.create(
            space=entry.space,
            entry=entry,
            booking_type=InventoryLog.B_ADD,
            old_amount=0,
            new_amount=entry.amount,
            old_inventory_location=entry.inventory_location,
            new_inventory_location=entry.inventory_location,
        )
    return entry


def add_food_to_pantry(food, user, space, household, amount=1, unit=None, expires=None, location=None):
    """Create one InventoryEntry for ``food`` at the household's default location (+ a B_ADD log).

    The explicit, server-side "add to pantry" write behind the shopping ＋pantry chip, the
    food_onhand / IngredientContextMenu in-pantry toggle, and Stock up. Mirrors
    ``InventoryEntrySerializer.create()`` (code assignment + B_ADD ``InventoryLog``) without needing
    the request/nested-food serializer, per FR-F5. Pass ``location`` to reuse an already-resolved
    default location (e.g. a batch loop) instead of re-querying it per call. The entry + log write
    atomically.
    """
    if location is None:
        location = get_or_create_default_inventory_location(household, user, space)
    expires = apply_shelf_life_expiry(food, expires, location)  # FR-D1 auto-expiry when none given; muted in freezers
    with transaction.atomic():
        entry = InventoryEntry.objects.create(
            food=food,
            inventory_location=location,
            amount=amount,
            unit=unit,
            expires=expires,
            created_by=user,
            space=space,
        )
        return finalize_new_inventory_entry(entry)


def set_food_onhand(food, onhand, *, user, space, household, shared_users, location=None):
    """Set one food's on-hand state through household inventory (FR-L1).

    Shared by the ``food_onhand`` serializer toggle and ``batch_update`` on_hand so the two never
    drift: clears the caller's legacy ``onhand_users``, then ``onhand=True`` ensures a single on-hand
    lot exists (idempotent — skipped if one already does) and ``onhand=False`` zeroes the household's
    lots. ``household`` must be non-null. Pass ``location`` to reuse an already-resolved default
    location across a batch (avoids re-querying it per food).
    """
    food.onhand_users.remove(*shared_users)
    if onhand:
        already_on_hand = InventoryEntry.objects.filter(
            food=food, amount__gt=0, inventory_location__household=household,
        ).exists()
        if not already_on_hand:
            add_food_to_pantry(food, user, space, household, location=location)
    else:
        zero_food_in_pantry(food, household)


def zero_food_in_pantry(food, household):
    """Zero every on-hand lot of ``food`` in ``household`` and write a B_REMOVE log for each.

    The "remove from pantry" counterpart to :func:`add_food_to_pantry`, shared by the
    food_onhand / IngredientContextMenu off-toggle and ``batch_update`` on_hand=False. Zeroing
    (not deleting) keeps the InventoryLog audit trail intact; availability reads treat
    ``amount>0`` as on-hand, so a zeroed lot is off-hand.
    """
    entries = InventoryEntry.objects.filter(
        food=food, amount__gt=0, inventory_location__household=household,
    )
    with transaction.atomic():
        for entry in entries:
            old_amount = entry.amount
            entry.amount = 0
            entry.save()
            _log_lot_change(entry, old_amount)


# Sentinel distinguishing "no unit scope given" (all lots) from an explicit None (unit-less lots).
UNSCOPED = object()


def _log_lot_change(lot, old_amount):
    InventoryLog.objects.create(
        space=lot.space,
        entry=lot,
        booking_type=InventoryLog.B_REMOVE,
        old_amount=old_amount,
        new_amount=lot.amount,
        old_inventory_location=lot.inventory_location,
        new_inventory_location=lot.inventory_location,
    )


def reduce_food_to_amount(food, household, target, *, unit=UNSCOPED, new_unit=None):
    """Reduce a food's on-hand lots in ``household`` so the total equals ``target`` (Use up, FR-G).

    Spends the earliest-expiry lot first (undated lots last) and writes a B_REMOVE log per touched
    lot. ``unit`` scopes the operation (DEC-2): ``UNSCOPED`` (default) sums across all lots — the
    legacy behavior — while a Unit instance or ``None`` touches only lots in exactly that unit,
    because amounts in different units must never be summed (no conversion, FR-J3).

    ``new_unit`` re-declares the remainder (DEC-3: "started with 1 gallon, now have 1 cup"): the
    earliest-expiry scoped lot survives with ``amount=target, unit=new_unit`` and every other
    scoped lot is zeroed. Re-declaration is exempt from the reduce-only rule — the old and new
    amounts are in different units, so they are not comparable. Audit-trail caveat: InventoryLog
    has no unit columns, so a relabel logs a B_REMOVE whose amounts may be equal; recording the
    unit change itself needs a schema addition (deferred).
    """
    target = Decimal(str(target))
    lot_filter = InventoryEntry.objects.filter(
        food=food, amount__gt=0, inventory_location__household=household,
    )
    if unit is not UNSCOPED:
        lot_filter = lot_filter.filter(unit=unit) if unit is not None else lot_filter.filter(unit__isnull=True)
    lots = list(lot_filter.order_by('expires', 'id'))

    if new_unit is not None:
        with transaction.atomic():
            survivor = lots[0] if lots and target > 0 else None
            for lot in lots:
                old_amount = lot.amount
                if lot is survivor:
                    lot.amount = target
                    lot.unit = new_unit
                    lot.save()
                else:
                    lot.amount = Decimal(0)
                    lot.save()
                _log_lot_change(lot, old_amount)
        return

    reduction = sum((lot.amount for lot in lots), Decimal(0)) - target
    if reduction <= 0:
        return

    with transaction.atomic():
        for lot in lots:
            if reduction <= 0:
                break
            take = min(lot.amount, reduction)
            old_amount = lot.amount
            lot.amount = old_amount - take
            lot.save()
            _log_lot_change(lot, old_amount)
            reduction -= take
