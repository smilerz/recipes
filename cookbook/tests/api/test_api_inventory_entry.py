import json
from datetime import date, timedelta

import pytest
from django.contrib import auth
from django.urls import reverse
from django_scopes import scopes_disabled

from cookbook.models import Household, InventoryEntry, InventoryLog, UserSpace
from cookbook.tests.factories import FoodFactory, InventoryEntryFactory, InventoryLocationFactory, UnitFactory

LIST_URL = 'api:inventoryentry-list'
STOCK_UP_URL = 'api:inventoryentry-stock-up'
DRAW_DOWN_URL = 'api:inventoryentry-draw-down'


def get_result_ids(response):
    return [e['id'] for e in json.loads(response.content)['results']]


@pytest.mark.django_db
def test_list_household_scoped(u1_s1, u2_s1, space_1):
    """The pantry list is household-scoped (FR-B4): a user sees only their household's lots,
    not other households' lots in the same space."""
    user1 = auth.get_user(u1_s1)
    user2 = auth.get_user(u2_s1)
    with scopes_disabled():
        hh1 = Household.objects.create(name='h1', space=space_1)
        hh2 = Household.objects.create(name='h2', space=space_1)
        UserSpace.objects.filter(user=user1, space=space_1).update(household=hh1)
        UserSpace.objects.filter(user=user2, space=space_1).update(household=hh2)

        loc1 = InventoryLocationFactory(space=space_1, household=hh1)
        loc2 = InventoryLocationFactory(space=space_1, household=hh2)
        mine = InventoryEntryFactory(space=space_1, food=FoodFactory(space=space_1), inventory_location=loc1, amount=1)
        theirs = InventoryEntryFactory(space=space_1, food=FoodFactory(space=space_1), inventory_location=loc2, amount=1)

    ids = get_result_ids(u1_s1.get(reverse(LIST_URL)))
    assert mine.id in ids
    assert theirs.id not in ids


@pytest.mark.django_db
def test_stock_up_creates_lots_with_logs(u1_s1, space_1):
    """Stock up bulk-creates one on-hand lot per item (amount/location/expiry) with a B_ADD log."""
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        hh = Household.objects.create(name='h', space=space_1)
        UserSpace.objects.filter(user=user, space=space_1).update(household=hh)
        loc = InventoryLocationFactory(space=space_1, household=hh)
        f1 = FoodFactory(space=space_1)
        f2 = FoodFactory(space=space_1)

    r = u1_s1.post(reverse(STOCK_UP_URL), {
        'items': [
            {'food': f1.id, 'amount': 3, 'inventory_location': loc.id, 'expires': '2026-08-01'},
            {'food': f2.id, 'amount': 1},
        ],
    }, content_type='application/json')

    assert r.status_code == 200
    assert r.json()['created'] == 2
    with scopes_disabled():
        e1 = InventoryEntry.objects.get(food=f1, amount__gt=0)
        assert e1.amount == 3
        assert str(e1.expires) == '2026-08-01'
        assert e1.inventory_location_id == loc.id
        assert InventoryLog.objects.filter(entry=e1, booking_type=InventoryLog.B_ADD).exists()
        # f2 with no location falls back to the household default location
        assert InventoryEntry.objects.filter(food=f2, amount__gt=0, inventory_location__household=hh).exists()


@pytest.mark.django_db
def test_stock_up_requires_household(u1_s1, space_1):
    with scopes_disabled():
        f1 = FoodFactory(space=space_1)
    r = u1_s1.post(reverse(STOCK_UP_URL), {'items': [{'food': f1.id, 'amount': 1}]}, content_type='application/json')
    assert r.status_code == 400
    with scopes_disabled():
        assert not InventoryEntry.objects.filter(food=f1).exists()


@pytest.mark.django_db
def test_draw_down_reduces_lots_earliest_expiry_first(u1_s1, space_1):
    """Use up draws the household total down to the target, spending the earliest-expiry lot first,
    logging a B_REMOVE per touched lot."""
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        hh = Household.objects.create(name='h', space=space_1)
        UserSpace.objects.filter(user=user, space=space_1).update(household=hh)
        loc = InventoryLocationFactory(space=space_1, household=hh)
        food = FoodFactory(space=space_1)
        early = InventoryEntryFactory(space=space_1, food=food, inventory_location=loc, amount=3, expires=date(2026, 8, 1))
        later = InventoryEntryFactory(space=space_1, food=food, inventory_location=loc, amount=2, expires=date(2026, 9, 1))

    r = u1_s1.post(reverse(DRAW_DOWN_URL), {'items': [{'food': food.id, 'amount': 1}]}, content_type='application/json')
    assert r.status_code == 200

    with scopes_disabled():
        early.refresh_from_db()
        later.refresh_from_db()
        assert early.amount == 0  # earliest-expiry lot spent first
        assert later.amount == 1  # then the later lot, down to the target total of 1
        assert InventoryLog.objects.filter(entry=early, booking_type=InventoryLog.B_REMOVE).exists()


@pytest.mark.django_db
def test_draw_down_never_increases(u1_s1, space_1):
    """Use up only reduces — a target above the current total is a no-op."""
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        hh = Household.objects.create(name='h', space=space_1)
        UserSpace.objects.filter(user=user, space=space_1).update(household=hh)
        loc = InventoryLocationFactory(space=space_1, household=hh)
        food = FoodFactory(space=space_1)
        lot = InventoryEntryFactory(space=space_1, food=food, inventory_location=loc, amount=2)

    r = u1_s1.post(reverse(DRAW_DOWN_URL), {'items': [{'food': food.id, 'amount': 99}]}, content_type='application/json')
    assert r.status_code == 200
    with scopes_disabled():
        lot.refresh_from_db()
        assert lot.amount == 2


@pytest.mark.django_db
def test_draw_down_requires_household(u1_s1, space_1):
    with scopes_disabled():
        food = FoodFactory(space=space_1)
    r = u1_s1.post(reverse(DRAW_DOWN_URL), {'items': [{'food': food.id, 'amount': 0}]}, content_type='application/json')
    assert r.status_code == 400


def _create_body(food, loc, hh, **extra):
    return {
        'food': {'id': food.id, 'name': food.name},
        'inventory_location': {'id': loc.id, 'name': loc.name, 'household': {'id': hh.id, 'name': hh.name}},
        'unit': None, 'amount': 1, **extra,
    }


@pytest.mark.django_db
def test_create_autofills_expiry_from_shelf_life(u1_s1, space_1):
    """FR-D1: creating a lot with no expiry auto-fills expires = today + food.shelf_life_days."""
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        hh = Household.objects.create(name='h', space=space_1)
        UserSpace.objects.filter(user=user, space=space_1).update(household=hh)
        loc = InventoryLocationFactory(space=space_1, household=hh)
        food = FoodFactory(space=space_1, shelf_life_days=7)

    r = u1_s1.post(reverse(LIST_URL), _create_body(food, loc, hh), content_type='application/json')
    assert r.status_code == 201
    assert r.json()['expires'] == (date.today() + timedelta(days=7)).isoformat()


@pytest.mark.django_db
def test_create_no_shelf_life_stays_undated(u1_s1, space_1):
    """A food with no shelf life gets no auto-expiry (FR-D2)."""
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        hh = Household.objects.create(name='h', space=space_1)
        UserSpace.objects.filter(user=user, space=space_1).update(household=hh)
        loc = InventoryLocationFactory(space=space_1, household=hh)
        food = FoodFactory(space=space_1)

    r = u1_s1.post(reverse(LIST_URL), _create_body(food, loc, hh), content_type='application/json')
    assert r.status_code == 201
    assert r.json()['expires'] is None


@pytest.mark.django_db
def test_create_explicit_expiry_not_overwritten(u1_s1, space_1):
    """An explicit expiry is never overwritten by the shelf-life suggestion (FR-D1)."""
    user = auth.get_user(u1_s1)
    explicit = (date.today() + timedelta(days=2)).isoformat()
    with scopes_disabled():
        hh = Household.objects.create(name='h', space=space_1)
        UserSpace.objects.filter(user=user, space=space_1).update(household=hh)
        loc = InventoryLocationFactory(space=space_1, household=hh)
        food = FoodFactory(space=space_1, shelf_life_days=7)

    r = u1_s1.post(reverse(LIST_URL), _create_body(food, loc, hh, expires=explicit), content_type='application/json')
    assert r.status_code == 201
    assert r.json()['expires'] == explicit


@pytest.mark.django_db
def test_create_freezer_location_skips_shelf_life_autofill(u1_s1, space_1):
    """DEC-4 B: a freezer location must NOT get the pantry shelf-life auto-expiry — frozen milk
    stamped 'expires in 7 days' is wrong data that pollutes Expiring-soon. Date stays empty."""
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        hh = Household.objects.create(name='h', space=space_1)
        UserSpace.objects.filter(user=user, space=space_1).update(household=hh)
        loc = InventoryLocationFactory(space=space_1, household=hh, is_freezer=True)
        food = FoodFactory(space=space_1, shelf_life_days=7)

    r = u1_s1.post(reverse(LIST_URL), _create_body(food, loc, hh), content_type='application/json')
    assert r.status_code == 201
    assert r.json()['expires'] is None


@pytest.mark.django_db
def test_create_freezer_explicit_expiry_kept(u1_s1, space_1):
    """An explicit expiry on a freezer lot passes through untouched (freezer only mutes the
    auto-suggestion, never the user's own date)."""
    user = auth.get_user(u1_s1)
    explicit = (date.today() + timedelta(days=180)).isoformat()
    with scopes_disabled():
        hh = Household.objects.create(name='h', space=space_1)
        UserSpace.objects.filter(user=user, space=space_1).update(household=hh)
        loc = InventoryLocationFactory(space=space_1, household=hh, is_freezer=True)
        food = FoodFactory(space=space_1, shelf_life_days=7)

    r = u1_s1.post(reverse(LIST_URL), _create_body(food, loc, hh, expires=explicit), content_type='application/json')
    assert r.status_code == 201
    assert r.json()['expires'] == explicit


@pytest.mark.django_db
def test_stock_up_freezer_location_skips_shelf_life_autofill(u1_s1, space_1):
    """The stock-up path honors the same freezer rule as direct create (shared helper)."""
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        hh = Household.objects.create(name='h', space=space_1)
        UserSpace.objects.filter(user=user, space=space_1).update(household=hh)
        freezer = InventoryLocationFactory(space=space_1, household=hh, is_freezer=True)
        pantry = InventoryLocationFactory(space=space_1, household=hh)
        frozen = FoodFactory(space=space_1, shelf_life_days=7)
        fresh = FoodFactory(space=space_1, shelf_life_days=7)

    r = u1_s1.post(reverse(STOCK_UP_URL), {
        'items': [
            {'food': frozen.id, 'amount': 1, 'inventory_location': freezer.id},
            {'food': fresh.id, 'amount': 1, 'inventory_location': pantry.id},
        ],
    }, content_type='application/json')

    assert r.status_code == 200
    with scopes_disabled():
        assert InventoryEntry.objects.get(food=frozen).expires is None
        assert InventoryEntry.objects.get(food=fresh).expires == date.today() + timedelta(days=7)


def _household_with_location(u1_s1, space_1):
    """One household + one (empty) location; returns (hh, loc)."""
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        hh = Household.objects.create(name='h', space=space_1)
        UserSpace.objects.filter(user=user, space=space_1).update(household=hh)
        loc = InventoryLocationFactory(space=space_1, household=hh)
    return hh, loc


@pytest.mark.django_db
def test_draw_down_unit_scope_only_reduces_matching_lots(u1_s1, space_1):
    """DEC-2: a unit-scoped draw-down touches only lots in that unit (FIFO within the scope);
    the other unit's lot is untouched — no cross-unit summing."""
    hh, loc = _household_with_location(u1_s1, space_1)
    with scopes_disabled():
        food = FoodFactory(space=space_1)
        gallon = UnitFactory(space=space_1)
        cup = UnitFactory(space=space_1)
        gallon_lot = InventoryEntryFactory(space=space_1, food=food, inventory_location=loc, amount=1, unit=gallon)
        cup_lot = InventoryEntryFactory(space=space_1, food=food, inventory_location=loc, amount=2, unit=cup)

    r = u1_s1.post(reverse(DRAW_DOWN_URL), {'items': [{'food': food.id, 'amount': 1, 'unit': cup.id}]},
                   content_type='application/json')
    assert r.status_code == 200
    with scopes_disabled():
        gallon_lot.refresh_from_db()
        cup_lot.refresh_from_db()
        assert gallon_lot.amount == 1  # out of scope, untouched
        assert cup_lot.amount == 1     # 2 cups -> 1 cup


@pytest.mark.django_db
def test_draw_down_null_unit_scopes_to_unitless_lots(u1_s1, space_1):
    """unit: null scopes to unit-less lots only (explicit null != omitted)."""
    hh, loc = _household_with_location(u1_s1, space_1)
    with scopes_disabled():
        food = FoodFactory(space=space_1)
        cup = UnitFactory(space=space_1)
        bare_lot = InventoryEntryFactory(space=space_1, food=food, inventory_location=loc, amount=3, unit=None)
        cup_lot = InventoryEntryFactory(space=space_1, food=food, inventory_location=loc, amount=2, unit=cup)

    r = u1_s1.post(reverse(DRAW_DOWN_URL), {'items': [{'food': food.id, 'amount': 0, 'unit': None}]},
                   content_type='application/json')
    assert r.status_code == 200
    with scopes_disabled():
        bare_lot.refresh_from_db()
        cup_lot.refresh_from_db()
        assert bare_lot.amount == 0
        assert cup_lot.amount == 2


@pytest.mark.django_db
def test_draw_down_omitted_unit_keeps_legacy_all_lots_behavior(u1_s1, space_1):
    """No unit key at all = the original all-lots reduction across mixed units."""
    hh, loc = _household_with_location(u1_s1, space_1)
    with scopes_disabled():
        food = FoodFactory(space=space_1)
        cup = UnitFactory(space=space_1)
        early = InventoryEntryFactory(space=space_1, food=food, inventory_location=loc, amount=2, unit=cup,
                                      expires=date(2026, 8, 1))
        late = InventoryEntryFactory(space=space_1, food=food, inventory_location=loc, amount=3, unit=None,
                                     expires=date(2026, 9, 1))

    r = u1_s1.post(reverse(DRAW_DOWN_URL), {'items': [{'food': food.id, 'amount': 1}]},
                   content_type='application/json')
    assert r.status_code == 200
    with scopes_disabled():
        early.refresh_from_db()
        late.refresh_from_db()
        assert early.amount == 0  # earliest first, across units
        assert late.amount == 1


@pytest.mark.django_db
def test_draw_down_new_unit_writes_survivor_to_earliest_expiry_lot(u1_s1, space_1):
    """DEC-3 A: 'started with 1 gallon, now have 1 cup' — the earliest-expiry scoped lot survives
    with the new amount + new unit; other scoped lots are zeroed; every touched lot logs."""
    hh, loc = _household_with_location(u1_s1, space_1)
    with scopes_disabled():
        food = FoodFactory(space=space_1)
        gallon = UnitFactory(space=space_1)
        cup = UnitFactory(space=space_1)
        early = InventoryEntryFactory(space=space_1, food=food, inventory_location=loc, amount=1, unit=gallon,
                                      expires=date(2026, 8, 1))
        late = InventoryEntryFactory(space=space_1, food=food, inventory_location=loc, amount=1, unit=gallon,
                                     expires=date(2026, 9, 1))

    r = u1_s1.post(reverse(DRAW_DOWN_URL),
                   {'items': [{'food': food.id, 'amount': 1, 'unit': gallon.id, 'new_unit': cup.id}]},
                   content_type='application/json')
    assert r.status_code == 200
    with scopes_disabled():
        early.refresh_from_db()
        late.refresh_from_db()
        assert early.amount == 1 and early.unit_id == cup.id  # survivor re-declared as 1 cup
        assert late.amount == 0                               # other scoped lot zeroed
        assert InventoryLog.objects.filter(entry=late, booking_type=InventoryLog.B_REMOVE).exists()


@pytest.mark.django_db
def test_draw_down_new_unit_to_zero_zeroes_all_scoped_lots(u1_s1, space_1):
    """new_unit with target 0 zeroes every scoped lot (nothing survives to relabel)."""
    hh, loc = _household_with_location(u1_s1, space_1)
    with scopes_disabled():
        food = FoodFactory(space=space_1)
        gallon = UnitFactory(space=space_1)
        cup = UnitFactory(space=space_1)
        a = InventoryEntryFactory(space=space_1, food=food, inventory_location=loc, amount=1, unit=gallon)
        b = InventoryEntryFactory(space=space_1, food=food, inventory_location=loc, amount=2, unit=gallon)

    r = u1_s1.post(reverse(DRAW_DOWN_URL),
                   {'items': [{'food': food.id, 'amount': 0, 'unit': gallon.id, 'new_unit': cup.id}]},
                   content_type='application/json')
    assert r.status_code == 200
    with scopes_disabled():
        a.refresh_from_db()
        b.refresh_from_db()
        assert a.amount == 0 and b.amount == 0


@pytest.mark.django_db
def test_stock_up_unresolvable_location_400(u1_s1, space_1):
    """A stock-up item naming a location id that doesn't resolve in the household must 400, not
    silently fall back to the default (which would re-apply shelf-life autofill the user meant to
    avoid by choosing a freezer)."""
    hh, loc = _household_with_location(u1_s1, space_1)
    with scopes_disabled():
        food = FoodFactory(space=space_1, shelf_life_days=7)

    with scopes_disabled():
        good_food = FoodFactory(space=space_1)

    r = u1_s1.post(reverse(STOCK_UP_URL),
                   {'items': [
                       {'food': good_food.id, 'amount': 1},  # created first, must roll back
                       {'food': food.id, 'amount': 1, 'inventory_location': 999999},
                   ]},
                   content_type='application/json')
    assert r.status_code == 400
    with scopes_disabled():
        assert not InventoryEntry.objects.filter(food__in=[food, good_food]).exists()


@pytest.mark.django_db
def test_draw_down_unresolvable_new_unit_400(u1_s1, space_1):
    """A new_unit id that doesn't resolve must 400 — a silent skip would drop the user's
    reduce+relabel while the endpoint reports ok (same intent-inversion class as stock-up
    locations). Nothing may change."""
    hh, loc = _household_with_location(u1_s1, space_1)
    with scopes_disabled():
        food = FoodFactory(space=space_1)
        gallon = UnitFactory(space=space_1)
        lot = InventoryEntryFactory(space=space_1, food=food, inventory_location=loc, amount=2, unit=gallon)

    r = u1_s1.post(reverse(DRAW_DOWN_URL),
                   {'items': [{'food': food.id, 'amount': 1, 'unit': gallon.id, 'new_unit': 999999}]},
                   content_type='application/json')
    assert r.status_code == 400
    with scopes_disabled():
        lot.refresh_from_db()
        assert lot.amount == 2


@pytest.mark.django_db
def test_draw_down_new_unit_requires_unit_scope_400(u1_s1, space_1):
    """new_unit without a unit scope would re-declare across ALL units (earliest lot of any unit
    survives, everything else zeroed) — reachable by a client merely dropping a key. Reject."""
    hh, loc = _household_with_location(u1_s1, space_1)
    with scopes_disabled():
        food = FoodFactory(space=space_1)
        gallon = UnitFactory(space=space_1)
        cup = UnitFactory(space=space_1)
        lot = InventoryEntryFactory(space=space_1, food=food, inventory_location=loc, amount=2, unit=gallon)

    r = u1_s1.post(reverse(DRAW_DOWN_URL),
                   {'items': [{'food': food.id, 'amount': 1, 'new_unit': cup.id}]},
                   content_type='application/json')
    assert r.status_code == 400
    with scopes_disabled():
        lot.refresh_from_db()
        assert lot.amount == 2 and lot.unit_id == gallon.id
