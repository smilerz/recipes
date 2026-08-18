from django.db.models import BooleanField, Case, Exists, OuterRef, Q, Subquery, Value, When
from django.db.models.functions import Substr

from cookbook.models import Food, InventoryEntry


def request_household(request):
    """The requesting user's household (or None) — the single scope for all pantry/inventory reads.

    None for anonymous share-link requests and users who skipped household setup; callers treat
    that as 'no inventory' (see :func:`annotate_food_inventory` / :func:`_is_available`). Shared by
    every viewset that scopes inventory so the resolution can never drift between them.
    """
    return getattr(getattr(request, 'user_space', None), 'household', None)


def _household_lots(household, *, expired_before=None):
    """Correlated on-hand-lot subquery (``amount>0``) for a food, scoped to ``household``.

    ``InventoryLocation.household`` is a required FK, so ``household=None`` compiles to an
    ``IS NULL`` match — i.e. no lots — which is the correct empty inventory read for a user
    without a household (and, unlike an empty ``__in``, never raises ``EmptyResultSet``).
    ``expired_before`` narrows to lots already past that date.
    """
    qs = InventoryEntry.objects.filter(food=OuterRef('id'), amount__gt=0, inventory_location__household=household)
    if expired_before is not None:
        qs = qs.filter(expires__lt=expired_before)
    return qs


def annotate_food_inventory(qs, household, today, *, with_expiry=False):
    """Annotate a Food queryset with household-scoped inventory state (FR-B4).

    Adds ``has_inventory_status`` and ``has_expired_status`` (booleans). With ``with_expiry`` also
    adds ``earliest_expiry`` — ``MIN(expires)`` over dated on-hand lots — which tints the pantry
    jar amber/red on recipe and shopping rows. It is deliberately left off the flat food list for
    performance (FR-I6: food-DB list shows the plain in-stock jar, no expiry tint).
    """
    qs = qs.annotate(
        has_inventory_status=Exists(_household_lots(household)),
        has_expired_status=Exists(_household_lots(household, expired_before=today)),
    )
    if with_expiry:
        earliest = _household_lots(household).filter(expires__isnull=False).order_by('expires').values('expires')[:1]
        qs = qs.annotate(earliest_expiry=Subquery(earliest))
    return qs


def _is_available(household, shopping_users, prefix=''):
    """Availability Q: the food has a household inventory lot (``amount>0``).

    ``prefix`` relocates the lookups for querysets not rooted on Food (e.g. ``'food__'`` for an
    Ingredient queryset). Legacy ``onhand_users`` is retired (P1.7) — nothing is available without a
    household. ``shopping_users`` is kept for signature stability but no longer used.
    """
    if household is None:
        # always-false, but NOT an empty __in — that raises EmptyResultSet and zeroes the
        # whole conditional aggregate it sits in (the food stats Count filters)
        return Q(**{f'{prefix}pk__lt': 0})
    return Q(**{
        f'{prefix}inventoryentry__amount__gt': 0,
        f'{prefix}inventoryentry__inventory_location__household': household,
    })


def _substitute_available(household, shopping_users):
    if household is None:
        return Q(substitute__pk__lt=0)
    return Q(
        substitute__inventoryentry__amount__gt=0,
        substitute__inventoryentry__inventory_location__household=household,
    )


def _tree_substitute_filter(household, shopping_users, *, tree_field, tree_q):
    available = _is_available(household, shopping_users)
    ignorable = Q(ignore_shopping=True, recipe__isnull=True)
    related_available = Food.objects.filter(tree_q).filter(available)
    return (
        Food.objects.exclude(
            available | _substitute_available(household, shopping_users) | ignorable
        )
        .exclude(depth=1, numchild=0)
        .filter(**{tree_field: True})
        .annotate(has_available_relative=Exists(related_available))
        .filter(has_available_relative=True)
    )


def children_substitute_filter(household, shopping_users):
    return _tree_substitute_filter(
        household, shopping_users,
        tree_field='substitute_children',
        tree_q=Q(path__startswith=OuterRef('path'), depth__gt=OuterRef('depth')),
    )


def sibling_substitute_filter(household, shopping_users):
    return _tree_substitute_filter(
        household, shopping_users,
        tree_field='substitute_siblings',
        tree_q=Q(
            path__startswith=Substr(OuterRef('path'), 1, Food.steplen * (OuterRef('depth') - 1)),
            depth=OuterRef('depth'),
        ),
    )


def compute_substitute_flags(foods, household, shared_users):
    """
    Batch-compute substitute_onhand and substitute_inventory for a page of foods.
    Replaces per-food N+1 queries in the serializer (FoodSerializer.get_substitute_onhand /
    get_substitute_inventory) with 2-4 batch queries. Shared by every viewset whose serializer
    nests FoodSerializer over a page of foods — populate serializer.context['_substitute_onhand']
    / ['_substitute_inventory'] with the two dicts this returns.
    """
    # Build each food's full substitute ID set (direct + siblings + children)
    food_sub_ids = {f.id: set(s.id for s in f.substitute.all()) for f in foods}

    # Batch-fetch sibling IDs (1 query for all foods with substitute_siblings). Root-depth
    # foods (no real parent category) have no true siblings — sibling_path_prefix returns
    # None for them, so they're excluded here rather than matching every root-level Food.
    sibling_foods = [f for f in foods if f.substitute_siblings and Food.sibling_path_prefix(f.path, f.depth) is not None]
    if sibling_foods:
        sibling_q = Q()
        for f in sibling_foods:
            parent_path = Food.sibling_path_prefix(f.path, f.depth)
            sibling_q |= Q(path__startswith=parent_path, depth=f.depth)
        candidates = list(Food.objects.filter(sibling_q).values_list('id', 'path', 'depth'))
        for f in sibling_foods:
            parent_path = Food.sibling_path_prefix(f.path, f.depth)
            for cid, cpath, cdepth in candidates:
                if cdepth == f.depth and cpath.startswith(parent_path) and cid != f.id:
                    food_sub_ids[f.id].add(cid)

    # Batch-fetch child IDs (1 query for all foods with substitute_children)
    children_foods = [f for f in foods if f.substitute_children]
    if children_foods:
        children_q = Q()
        for f in children_foods:
            children_q |= Q(path__startswith=f.path, depth__gt=f.depth)
        candidates = list(Food.objects.filter(children_q).values_list('id', 'path', 'depth'))
        for f in children_foods:
            for cid, cpath, cdepth in candidates:
                if cpath.startswith(f.path) and cdepth > f.depth:
                    food_sub_ids[f.id].add(cid)

    all_sub_ids = set()
    for sids in food_sub_ids.values():
        all_sub_ids |= sids

    if not all_sub_ids:
        empty = {f.id: False for f in foods}
        return empty, empty.copy()

    # 1 query: which substitutes are available (household inventory, amount>0)?
    available_ids = set(
        Food.objects.filter(id__in=all_sub_ids).filter(_is_available(household, shared_users))
        .values_list('id', flat=True)
    )

    # 1 query: which substitutes have inventory only? (drives substitute_inventory)
    # Strictly household-scoped (FR-B4): household=None -> IS NULL -> no inventory (no space-wide fallback).
    inventory_q = Q(inventoryentry__amount__gt=0, inventoryentry__inventory_location__household=household)
    inventory_ids = set(
        Food.objects.filter(id__in=all_sub_ids).filter(inventory_q)
        .values_list('id', flat=True)
    )

    sub_onhand = {f.id: bool(food_sub_ids[f.id] & available_ids) for f in foods}
    sub_inventory = {f.id: bool(food_sub_ids[f.id] & inventory_ids) for f in foods}
    return sub_onhand, sub_inventory


def annotate_food_substitute_availability(qs, household):
    """Annotate a Food queryset with ``has_substitute_available``: True when a direct substitute,
    or an available one via substitute_children/substitute_siblings, has household stock - the
    same resolution Food.objects.cookable() uses for the makenow badge (FR-G, Stock Up).

    Plain membership checks (pk__in=<queryset>), not correlated Exists()/OuterRef subqueries:
    children_substitute_filter/sibling_substitute_filter already resolve their own OuterRef
    correlations internally and return a closed, self-contained set of satisfied food ids.
    """
    substitute_ids = Food.objects.filter(_substitute_available(household, [])).values('pk')
    children_ids = children_substitute_filter(household, []).values('pk')
    sibling_ids = sibling_substitute_filter(household, []).values('pk')
    return qs.annotate(
        has_substitute_available=Case(
            When(Q(pk__in=substitute_ids) | Q(pk__in=children_ids) | Q(pk__in=sibling_ids), then=Value(True)),
            default=Value(False), output_field=BooleanField(),
        )
    )
