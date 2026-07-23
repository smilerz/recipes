import json
from datetime import timedelta

import pytest
from django.contrib import auth
from django.urls import reverse
from django.utils import timezone
from django_scopes import scopes_disabled

from cookbook.helper.permission_helper import invalidate_household_cache
from cookbook.models import InventoryEntry, ShoppingListEntry, Household, UserSpace
from cookbook.tests.factories import FoodFactory, ShoppingListEntryFactory

LIST_URL = 'api:shoppinglistentry-list'
DETAIL_URL = 'api:shoppinglistentry-detail'


@pytest.fixture
def sle(space_1, u1_s1):
    user = auth.get_user(u1_s1)
    return ShoppingListEntryFactory.create_batch(10,
                                                 space=space_1,
                                                 created_by=user)


@pytest.fixture
def sle_2(request):
    try:
        params = request.param  # request.param is a magic variable
    except AttributeError:
        params = {}
    u = request.getfixturevalue(params.get('user', 'u1_s1'))
    user = auth.get_user(u)
    count = params.get('count', 10)
    return ShoppingListEntryFactory.create_batch(
        count,
        space=user.userspace_set.filter(active=1).first().space,
        created_by=user)


@pytest.mark.parametrize("arg", [
    ['a_u', 403],
    ['g1_s1', 200],
    ['u1_s1', 200],
    ['a1_s1', 200],
])
def test_list_permission(arg, request):
    c = request.getfixturevalue(arg[0])
    assert c.get(reverse(LIST_URL)).status_code == arg[1]


def test_list_space(sle, u1_s1, u1_s2, space_2):
    assert json.loads(u1_s1.get(reverse(LIST_URL)).content)['count'] == 10
    assert json.loads(u1_s2.get(reverse(LIST_URL)).content)['count'] == 0

    with scopes_disabled():
        e = ShoppingListEntry.objects.first()
        e.space = space_2
        e.save()

    assert json.loads(u1_s1.get(reverse(LIST_URL)).content)['count'] == 9
    assert json.loads(u1_s2.get(reverse(LIST_URL)).content)['count'] == 0


def test_get_detail(u1_s1, sle):
    r = u1_s1.get(reverse(DETAIL_URL, args={sle[0].id}))
    assert json.loads(r.content)['id'] == sle[0].id


@pytest.mark.parametrize("arg", [
    ['a_u', 403],
    ['g1_s1', 404],
    ['u1_s1', 200],
    ['a1_s1', 404],
    ['g1_s2', 404],
    ['u1_s2', 404],
    ['a1_s2', 404],
])
def test_update(arg, request, sle):
    c = request.getfixturevalue(arg[0])
    new_val = float(sle[0].amount + 1)
    r = c.patch(reverse(DETAIL_URL, args={sle[0].id}), {'amount': new_val},
                content_type='application/json')
    assert r.status_code == arg[1]
    if r.status_code == 200:
        response = json.loads(r.content)
        assert response['amount'] == new_val


@pytest.mark.parametrize("arg", [
    ['a_u', 403],
    ['g1_s1', 201],
    ['u1_s1', 201],
    ['a1_s1', 201],
])
def test_add(arg, request, sle):
    c = request.getfixturevalue(arg[0])
    r = c.post(reverse(LIST_URL), {
        'food': {
            'id': sle[0].food.__dict__['id'],
            'name': sle[0].food.__dict__['name'],
        },
        'amount': 1
    },
               content_type='application/json')
    response = json.loads(r.content)
    print(r.content)
    assert r.status_code == arg[1]
    if r.status_code == 201:
        assert response['food']['id'] == sle[0].food.pk


def test_checkoff_does_not_set_onhand(u1_s1, sle):
    """FR-L1: check-off no longer marks the food on-hand, even with shopping_add_onhand on."""
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        pref = user.userpreference
        pref.shopping_add_onhand = True
        pref.save()

    entry = sle[0]
    r = u1_s1.patch(reverse(DETAIL_URL, args={entry.id}), {'checked': True}, content_type='application/json')
    assert r.status_code == 200
    with scopes_disabled():
        assert entry.food.onhand_users.count() == 0
        # check-off must not touch the pantry either
        assert not InventoryEntry.objects.filter(food=entry.food).exists()


def test_delete(u1_s1, u1_s2, sle):
    r = u1_s2.delete(reverse(DETAIL_URL, args={sle[0].id}))
    assert r.status_code == 404

    r = u1_s1.delete(reverse(DETAIL_URL, args={sle[0].id}))

    assert r.status_code == 204


@pytest.mark.parametrize("shared, count, sle_2", [
    ('g1_s1', 20, {
        'user': 'g1_s1'
    }),
    ('g1_s2', 10, {
        'user': 'g1_s2'
    }),
    ('u2_s1', 20, {
        'user': 'u2_s1'
    }),
    ('u1_s2', 10, {
        'user': 'u1_s2'
    }),
    ('a1_s1', 20, {
        'user': 'a1_s1'
    }),
    ('a1_s2', 10, {
        'user': 'a1_s2'
    }),
],
                         indirect=['sle_2'])
def test_sharing(request, shared, count, sle_2, sle, u1_s1, space_1):
    user = auth.get_user(u1_s1)
    shared_client = request.getfixturevalue(shared)
    shared_user = auth.get_user(shared_client)

    # confirm shared user can't access shopping list items created by u1_s1
    assert json.loads(u1_s1.get(reverse(LIST_URL)).content)['count'] == 10
    assert json.loads(shared_client.get(
        reverse(LIST_URL)).content)['count'] == 10

    with scopes_disabled():
        household = Household.objects.create(name='test', space=space_1)
        UserSpace.objects.filter(user=user).update(household=household)
        UserSpace.objects.filter(user=shared_user).update(household=household)
        # .update() bypasses signals — manually invalidate household cache
        for us in UserSpace.objects.filter(space=space_1, household=household):
            invalidate_household_cache(us)

    # confirm sharing user only sees their shopping list
    assert json.loads(u1_s1.get(reverse(LIST_URL)).content)['count'] == count
    r = shared_client.get(reverse(LIST_URL))
    # confirm shared user sees their list and the list that's shared with them
    assert json.loads(r.content)['count'] == count

    # test shared user can mark complete
    x = shared_client.patch(reverse(DETAIL_URL, args={sle[0].id}),
                            {'checked': True},
                            content_type='application/json')
    r = json.loads(shared_client.get(reverse(LIST_URL)).content)
    assert r['count'] == count
    # count unchecked entries
    if not x.status_code == 404:
        count = count - 1
    assert [x['checked'] for x in r['results']].count(False) == count
    # test shared user can delete
    x = shared_client.delete(reverse(DETAIL_URL, args={sle[1].id}))
    r = json.loads(shared_client.get(reverse(LIST_URL)).content)
    assert r['count'] == count
    # count unchecked entries
    if not x.status_code == 404:
        count = count - 1
    assert [x['checked'] for x in r['results']].count(False) == count


def test_recent(sle, u1_s1):
    user = auth.get_user(u1_s1)
    user.userpreference.shopping_recent_days = 7  # hardcoded API limit 14 days
    user.userpreference.save()

    today_start = timezone.now().replace(hour=0, minute=0, second=0)

    # past_date within recent_days threshold
    past_date = today_start - timedelta(
        days=user.userpreference.shopping_recent_days - 1)
    sle[0].checked = True
    sle[0].completed_at = past_date
    sle[0].save()

    r = json.loads(u1_s1.get(f'{reverse(LIST_URL)}?recent=1').content)
    assert r['count'] == 10
    assert [x['checked'] for x in r['results']].count(False) == 9

    # past_date outside recent_days threshold
    past_date = today_start - timedelta(
        days=user.userpreference.shopping_recent_days + 2)
    sle[0].completed_at = past_date
    sle[0].save()

    r = json.loads(u1_s1.get(f'{reverse(LIST_URL)}?recent=1').content)
    assert r['count'] == 9
    assert [x['checked'] for x in r['results']].count(False) == 9

    # user preference moved to include entry again
    user.userpreference.shopping_recent_days = user.userpreference.shopping_recent_days + 4
    user.userpreference.save()

    r = json.loads(u1_s1.get(f'{reverse(LIST_URL)}?recent=1').content)
    assert r['count'] == 10
    assert [x['checked'] for x in r['results']].count(False) == 9

def test_filter_by_food(sle, u1_s1, space_1):
    """Filter shopping list entries by food id."""
    with scopes_disabled():
        target_food = sle[0].food
        # count how many entries have this food
        expected = ShoppingListEntry.objects.filter(food=target_food).count()

    r = json.loads(u1_s1.get(f'{reverse(LIST_URL)}?food={target_food.id}').content)
    assert r['count'] == expected
    assert all(e['food']['id'] == target_food.id for e in r['results'])


def test_filter_by_checked(u1_s1, space_1):
    """Filter shopping list entries by checked status."""
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        food = FoodFactory(space=space_1)
        ShoppingListEntryFactory(food=food, space=space_1, created_by=user, checked=False)
        ShoppingListEntryFactory(food=food, space=space_1, created_by=user, checked=True)

    r = json.loads(u1_s1.get(f'{reverse(LIST_URL)}?food={food.id}&checked=false').content)
    assert r['count'] == 1
    assert r['results'][0]['checked'] is False

    r = json.loads(u1_s1.get(f'{reverse(LIST_URL)}?food={food.id}&checked=true').content)
    assert r['count'] == 1
    assert r['results'][0]['checked'] is True


def test_entry_food_carries_household_inventory(u1_s1, space_1):
    """Shopping-entry nested food carries in_inventory + household earliest_expiry so the row can
    render the read-only pantry jar (FR-H2). Another household's earlier lot is ignored (FR-B4)."""
    from cookbook.models import InventoryLocation
    from cookbook.tests.factories import HouseholdFactory, InventoryEntryFactory, InventoryLocationFactory

    user = auth.get_user(u1_s1)
    today = timezone.localdate()
    with scopes_disabled():
        household = Household.objects.create(name='hh', space=space_1)
        UserSpace.objects.filter(user=user, space=space_1).update(household=household)
        invalidate_household_cache(UserSpace.objects.get(user=user, space=space_1))

        food = FoodFactory(space=space_1)
        ShoppingListEntryFactory(food=food, space=space_1, created_by=user, checked=False)

        loc = InventoryLocationFactory(space=space_1, household=household)
        InventoryEntryFactory(space=space_1, food=food, inventory_location=loc, amount=1,
                              expires=today + timedelta(days=5))
        # earlier lot in a different household — must be ignored
        other_loc = InventoryLocationFactory(space=space_1, household=HouseholdFactory(space=space_1))
        InventoryEntryFactory(space=space_1, food=food, inventory_location=other_loc, amount=1,
                              expires=today + timedelta(days=1))

    results = json.loads(u1_s1.get(reverse(LIST_URL)).content)['results']
    row = next(r for r in results if r['food']['id'] == food.id)
    assert row['food']['in_inventory'] == 'True'
    assert row['food']['earliest_expiry'] == (today + timedelta(days=5)).isoformat()


def test_entry_food_carries_pack_and_shelf_life(u1_s1, space_1):
    """Shopping-entry nested food carries the pack (shopping_amount + preferred_shopping_unit) and
    shelf_life_days so the stock-up dialog can seed rows from the list response — no per-food refetch."""
    from cookbook.models import Unit

    user = auth.get_user(u1_s1)
    with scopes_disabled():
        unit = Unit.objects.create(name='bag', space=space_1)
        food = FoodFactory(space=space_1, shopping_amount=5, shelf_life_days=7, preferred_shopping_unit=unit)
        ShoppingListEntryFactory(food=food, space=space_1, created_by=user, checked=False)

    results = json.loads(u1_s1.get(reverse(LIST_URL)).content)['results']
    row = next(r for r in results if r['food']['id'] == food.id)
    assert float(row['food']['shopping_amount']) == 5
    assert row['food']['shelf_life_days'] == 7
    assert row['food']['preferred_shopping_unit']['id'] == unit.id


# TODO test auto onhand
