import json

import pytest
from django.contrib import auth
from django.core.cache import caches
from django.urls import reverse
from django_scopes import scope, scopes_disabled
from pytest_factoryboy import LazyFixture, register

from cookbook.models import Food, Ingredient, ShoppingListEntry
from cookbook.tests.factories import (FoodFactory, IngredientFactory, RecipeFactory,
                                      ShoppingListEntryFactory, SupermarketCategoryFactory)

#    ------------------ IMPORTANT -------------------
#
#  if changing any capabilities associated with food
#  you will need to ensure that it is tested against both
#  SqlLite and PostgresSQL
#  adding load_env() to settings.py will enable Postgress access
#
#    ------------------ IMPORTANT -------------------

LIST_URL = 'api:food-list'
DETAIL_URL = 'api:food-detail'
MOVE_URL = 'api:food-move'
MERGE_URL = 'api:food-merge'
if (Food.node_order_by):
    node_location = 'sorted-child'
else:
    node_location = 'last-child'

register(FoodFactory, 'obj_1', space=LazyFixture('space_1'))
register(FoodFactory, 'obj_2', space=LazyFixture('space_1'))
register(FoodFactory, 'obj_3', space=LazyFixture('space_2'))
register(SupermarketCategoryFactory, 'cat_1', space=LazyFixture('space_1'))
register(SupermarketCategoryFactory, 'cat_2', space=LazyFixture('space_1'))


@pytest.fixture
def false():
    return False


@pytest.fixture
def non_exist():
    return {}


@pytest.fixture()
def obj_tree_1(request, space_1):
    try:
        params = request.param  # request.param is a magic variable
    except AttributeError:
        params = {}
    inherit = params.pop('inherit', False)
    FoodFactory.create_batch(3, space=space_1, **params)
    objs = Food.objects.values_list('id', flat=True)
    obj_id = objs[1]
    child_id = objs[0]
    parent_id = objs[2]

    # set all foods to inherit everything
    if inherit:
        inherit = Food.inheritable_fields
        Through = Food.objects.filter(
            space=space_1).first().inherit_fields.through
        for i in inherit:
            Through.objects.bulk_create([
                Through(food_id=x, foodinheritfield_id=i.id)
                for x in Food.objects.filter(space=space_1).values_list('id', flat=True)
            ])

    Food.objects.get(id=child_id).move(
        Food.objects.get(id=obj_id), node_location)

    Food.objects.get(id=obj_id).move(
        Food.objects.get(id=parent_id), node_location)

    # whenever you move/merge a tree it's safest to re-get the object
    return Food.objects.get(id=obj_id)


@pytest.mark.parametrize("arg", [
    ['a_u', 403],
    ['g1_s1', 200],
    ['u1_s1', 200],
    ['a1_s1', 200],
])
def test_list_permission(arg, request):
    c = request.getfixturevalue(arg[0])
    assert c.get(reverse(LIST_URL)).status_code == arg[1]


def test_list_space(obj_1, obj_2, u1_s1, u1_s2, space_2):
    assert json.loads(u1_s1.get(reverse(LIST_URL)).content)['count'] == 2
    assert json.loads(u1_s2.get(reverse(LIST_URL)).content)['count'] == 0

    with scopes_disabled():
        # for some reason the 'path' attribute changes between the factory and the test
        obj_1 = Food.objects.get(id=obj_1.id)
        obj_2 = Food.objects.get(id=obj_2.id)
        obj_1.space = space_2
        obj_1.save()

    assert json.loads(u1_s1.get(reverse(LIST_URL)).content)['count'] == 1
    assert json.loads(u1_s2.get(reverse(LIST_URL)).content)['count'] == 1


def test_list_filter(obj_1, obj_2, u1_s1):
    r = u1_s1.get(reverse(LIST_URL))
    assert r.status_code == 200
    response = json.loads(r.content)
    assert response['count'] == 2

    assert obj_1.name in [x['name'] for x in response['results']]
    assert obj_2.name in [x['name'] for x in response['results']]
    assert response['results'][0]['name'] < response['results'][1]['name']

    response = json.loads(
        u1_s1.get(f'{reverse(LIST_URL)}?page_size=1').content)
    assert len(response['results']) == 1

    response = json.loads(u1_s1.get(f'{reverse(LIST_URL)}?limit=1').content)
    assert len(response['results']) == 1

    response = json.loads(
        u1_s1.get(f'{reverse(LIST_URL)}?query=''&limit=1').content)
    assert len(response['results']) == 1

    response = json.loads(
        u1_s1.get(f'{reverse(LIST_URL)}?query=chicken').content)
    assert response['count'] == 0

    response = json.loads(
        u1_s1.get(f'{reverse(LIST_URL)}?query={obj_1.name[:-4]}').content)
    assert response['count'] == 1


@pytest.mark.parametrize("arg", [
    ['a_u', 403],
    ['g1_s1', 403],
    ['u1_s1', 200],
    ['a1_s1', 200],
    ['g1_s2', 403],
    ['u1_s2', 404],
    ['a1_s2', 404],
])
def test_update(arg, request, obj_1):
    c = request.getfixturevalue(arg[0])
    r = c.patch(
        reverse(
            DETAIL_URL,
            args={obj_1.id}
        ),
        {'name': 'new'},
        content_type='application/json'
    )
    response = json.loads(r.content)
    assert r.status_code == arg[1]
    if r.status_code == 200:
        assert response['name'] == 'new'


@pytest.mark.parametrize("arg", [
    ['a_u', 403],
    ['g1_s1', 403],
    ['u1_s1', 201],
    ['a1_s1', 201],
])
def test_add(arg, request, u1_s2):
    c = request.getfixturevalue(arg[0])
    r = c.post(
        reverse(LIST_URL),
        {'name': 'test'},
        content_type='application/json'
    )
    response = json.loads(r.content)
    assert r.status_code == arg[1]
    if r.status_code == 201:
        assert response['name'] == 'test'
        r = c.get(reverse(DETAIL_URL, args={response['id']}))
        assert r.status_code == 200
        r = u1_s2.get(reverse(DETAIL_URL, args={response['id']}))
        assert r.status_code == 404


def test_add_duplicate(u1_s1, u1_s2, obj_1, obj_3):
    assert json.loads(u1_s1.get(reverse(LIST_URL)).content)['count'] == 1
    assert json.loads(u1_s2.get(reverse(LIST_URL)).content)['count'] == 1
    r = u1_s1.post(
        reverse(LIST_URL),
        {'name': obj_1.name},
        content_type='application/json'
    )
    response = json.loads(r.content)
    assert r.status_code == 201
    assert response['id'] == obj_1.id
    assert response['name'] == obj_1.name
    assert json.loads(u1_s1.get(reverse(LIST_URL)).content)['count'] == 1

    r = u1_s2.post(
        reverse(LIST_URL),
        {'name': obj_1.name},
        content_type='application/json'
    )
    response = json.loads(r.content)
    assert r.status_code == 201
    assert response['id'] != obj_1.id
    assert json.loads(u1_s2.get(reverse(LIST_URL)).content)['count'] == 2


def test_delete(u1_s1, u1_s2, obj_1, obj_tree_1):
    with scopes_disabled():
        assert Food.objects.count() == 4

    r = u1_s2.delete(
        reverse(
            DETAIL_URL,
            args={obj_1.id}
        )
    )
    assert r.status_code == 404
    with scopes_disabled():
        assert Food.objects.count() == 4

    # should delete self and child, leaving parent
    r = u1_s1.delete(
        reverse(
            DETAIL_URL,
            args={obj_tree_1.id}
        )
    )

    assert r.status_code == 204
    with scopes_disabled():
        assert Food.objects.count() == 2
        assert Food.find_problems() == ([], [], [], [], [])


def test_move(u1_s1, obj_tree_1, obj_2, obj_3, space_1):
    with scope(space=space_1):
        # for some reason the 'path' attribute changes between the factory and the test when using both obj_tree and obj
        obj_tree_1 = Food.objects.get(id=obj_tree_1.id)
        parent = obj_tree_1.get_parent()
        assert parent.get_num_children() == 1
        assert parent.get_descendant_count() == 2
        assert Food.get_root_nodes().filter(space=space_1).count() == 2

    url = reverse(MOVE_URL, args=[obj_tree_1.id, obj_2.id])

    # move child to new parent, only HTTP put method should work
    r = u1_s1.get(url)
    assert r.status_code == 405
    r = u1_s1.post(url)
    assert r.status_code == 405
    r = u1_s1.delete(url)
    assert r.status_code == 405
    r = u1_s1.put(url)
    assert r.status_code == 200
    with scopes_disabled():
        # django-treebeard bypasses django ORM so object needs retrieved again
        parent = Food.objects.get(pk=parent.id)
        obj_2 = Food.objects.get(pk=obj_2.id)
        assert parent.get_num_children() == 0
        assert parent.get_descendant_count() == 0
        assert obj_2.get_num_children() == 1
        assert obj_2.get_descendant_count() == 2

    # run diagnostic to find problems - none should be found
    with scopes_disabled():
        assert Food.find_problems() == ([], [], [], [], [])


def test_move_errors(u1_s1, obj_tree_1, obj_3, space_1):
    with scope(space=space_1):
        # for some reason the 'path' attribute changes between the factory and the test when using both obj_tree and obj
        obj_tree_1 = Food.objects.get(id=obj_tree_1.id)
        parent = obj_tree_1.get_parent()
    # move child to root
    r = u1_s1.put(reverse(MOVE_URL, args=[obj_tree_1.id, 0]))
    assert r.status_code == 200
    with scopes_disabled():
        assert Food.get_root_nodes().filter(space=space_1).count() == 2

    # attempt to move to non-existent parent
    r = u1_s1.put(
        reverse(MOVE_URL, args=[parent.id, 9999])
    )
    assert r.status_code == 404

    # attempt to move non-existent mode to parent
    r = u1_s1.put(
        reverse(MOVE_URL, args=[9999, parent.id])
    )
    assert r.status_code == 404

    # attempt to move to wrong space
    r = u1_s1.put(
        reverse(MOVE_URL, args=[obj_tree_1.id, obj_3.id])
    )
    assert r.status_code == 404


# TODO: figure out how to generalize this to be all related objects
def test_merge_ingredients(obj_tree_1, u1_s1, space_1):
    with scope(space=space_1):
        parent = obj_tree_1.get_parent()
        child = obj_tree_1.get_descendants()[0]
        IngredientFactory.create(food=parent, space=space_1)
        IngredientFactory.create(food=child, space=space_1)
        assert parent.get_num_children() == 1
        assert parent.get_descendant_count() == 2
        assert Ingredient.objects.count() == 2
        assert parent.ingredient_set.count() == 1
        assert obj_tree_1.ingredient_set.count() == 0
        assert child.ingredient_set.count() == 1

    # merge food (with connected ingredient) with children to another food
    r = u1_s1.put(reverse(MERGE_URL, args=[child.id, obj_tree_1.id]))
    assert r.status_code == 200
    with scope(space=space_1):
        # django-treebeard bypasses django ORM so object needs retrieved again
        with pytest.raises(Food.DoesNotExist):
            Food.objects.get(pk=child.id)
        obj_tree_1 = Food.objects.get(pk=obj_tree_1.id)
        assert obj_tree_1.ingredient_set.count() == 1  # now has child's ingredient


def test_merge_shopping_entries(obj_tree_1, u1_s1, space_1):
    with scope(space=space_1):
        parent = obj_tree_1.get_parent()
        child = obj_tree_1.get_descendants()[0]
        ShoppingListEntryFactory.create(food=parent, space=space_1)
        ShoppingListEntryFactory.create(food=child, space=space_1)
        assert parent.get_num_children() == 1
        assert parent.get_descendant_count() == 2
        assert ShoppingListEntry.objects.count() == 2
        assert parent.shopping_entries.count() == 1
        assert obj_tree_1.shopping_entries.count() == 0
        assert child.shopping_entries.count() == 1

    # merge food (with connected shoppinglistentry) with children to another food
    r = u1_s1.put(reverse(MERGE_URL, args=[child.id, obj_tree_1.id]))
    assert r.status_code == 200
    with scope(space=space_1):
        # django-treebeard bypasses django ORM so object needs retrieved again
        with pytest.raises(Food.DoesNotExist):
            Food.objects.get(pk=child.id)
        obj_tree_1 = Food.objects.get(pk=obj_tree_1.id)
        assert obj_tree_1.shopping_entries.count() == 1  # now has child's ingredient


def test_merge(u1_s1, obj_tree_1, obj_1, obj_3, space_1):
    with scope(space=space_1):
        # for some reason the 'path' attribute changes between the factory and the test when using both obj_tree and obj
        obj_tree_1 = Food.objects.get(id=obj_tree_1.id)
        parent = obj_tree_1.get_parent()
        child = obj_tree_1.get_descendants()[0]
        assert parent.get_num_children() == 1
        assert parent.get_descendant_count() == 2
        assert Food.get_root_nodes().filter(space=space_1).count() == 2
        assert Food.objects.count() == 4

    # merge food with no children with another food, only HTTP put method should work
    url = reverse(MERGE_URL, args=[child.id, obj_tree_1.id])
    r = u1_s1.get(url)
    assert r.status_code == 405
    r = u1_s1.post(url)
    assert r.status_code == 405
    r = u1_s1.delete(url)
    assert r.status_code == 405
    r = u1_s1.put(url)
    assert r.status_code == 200
    with scope(space=space_1):
        # django-treebeard bypasses django ORM so object needs retrieved again
        with pytest.raises(Food.DoesNotExist):
            Food.objects.get(pk=child.id)
        obj_tree_1 = Food.objects.get(pk=obj_tree_1.id)
        assert parent.get_num_children() == 1
        assert parent.get_descendant_count() == 1

    # merge food with children with another food
    r = u1_s1.put(reverse(MERGE_URL, args=[parent.id, obj_1.id]))
    assert r.status_code == 200
    with scope(space=space_1):
        # django-treebeard bypasses django ORM so object needs retrieved again
        with pytest.raises(Food.DoesNotExist):
            Food.objects.get(pk=parent.id)
        obj_1 = Food.objects.get(pk=obj_1.id)
        assert obj_1.get_num_children() == 1
        assert obj_1.get_descendant_count() == 1

    # run diagnostic to find problems - none should be found
    with scopes_disabled():
        assert Food.find_problems() == ([], [], [], [], [])


def test_merge_errors(u1_s1, obj_tree_1, obj_3, space_1):
    with scope(space=space_1):
        # for some reason the 'path' attribute changes between the factory and the test when using both obj_tree and obj
        obj_tree_1 = Food.objects.get(id=obj_tree_1.id)
        parent = obj_tree_1.get_parent()

    # attempt to merge with non-existent parent
    r = u1_s1.put(
        reverse(MERGE_URL, args=[obj_tree_1.id, 9999])
    )
    assert r.status_code == 404

    # attempt to merge non-existent node to parent
    r = u1_s1.put(
        reverse(MERGE_URL, args=[9999, obj_tree_1.id])
    )
    assert r.status_code == 404
    # attempt to move to wrong space
    r = u1_s1.put(
        reverse(MERGE_URL, args=[obj_tree_1.id, obj_3.id])
    )
    assert r.status_code == 404

    # attempt to merge with child
    r = u1_s1.put(
        reverse(MERGE_URL, args=[parent.id, obj_tree_1.id])
    )
    assert r.status_code == 403

    # attempt to merge with self
    r = u1_s1.put(
        reverse(MERGE_URL, args=[obj_tree_1.id, obj_tree_1.id])
    )
    assert r.status_code == 403


def test_root_filter(obj_tree_1, obj_2, obj_3, u1_s1):
    with scope(space=obj_tree_1.space):
        # for some reason the 'path' attribute changes between the factory and the test when using both obj_tree and obj
        obj_tree_1 = Food.objects.get(id=obj_tree_1.id)
        obj_2 = Food.objects.get(id=obj_2.id)
        parent = obj_tree_1.get_parent()

    # should return root objects in the space (obj_1, obj_2), ignoring query filters
    response = json.loads(u1_s1.get(f'{reverse(LIST_URL)}?root=0').content)
    assert len(response['results']) == 2

    # django_tree bypasses ORM - best to retrieve all changed objects
    with scopes_disabled():
        obj_2.move(parent, node_location)
        obj_2 = Food.objects.get(id=obj_2.id)
        parent = Food.objects.get(id=parent.id)
    # should return direct children of parent (obj_tree_1, obj_2), ignoring query filters
    response = json.loads(
        u1_s1.get(f'{reverse(LIST_URL)}?root={parent.id}').content)
    assert response['count'] == 2
    response = json.loads(u1_s1.get(
        f'{reverse(LIST_URL)}?root={parent.id}&query={obj_2.name[4:]}').content)
    assert response['count'] == 2


def test_tree_filter(obj_tree_1, obj_2, obj_3, u1_s1):
    with scope(space=obj_tree_1.space):
        # for some reason the 'path' attribute changes between the factory and the test when using both obj_tree and obj
        obj_tree_1 = Food.objects.get(id=obj_tree_1.id)
        obj_2 = Food.objects.get(id=obj_2.id)
        parent = obj_tree_1.get_parent()
        obj_2.move(parent, node_location)
        obj_2 = Food.objects.get(id=obj_2.id)

    # should return full tree starting at, but excluding parent (obj_tree_1, obj_2), ignoring query filters
    response = json.loads(u1_s1.get(f'{reverse(LIST_URL)}?tree={parent.id}').content)
    assert response['count'] == 4
    # filtering is ignored - should return identical results as ?tree=x
    response = json.loads(u1_s1.get(f'{reverse(LIST_URL)}?tree={parent.id}&query={obj_2.name[4:]}').content)
    assert response['count'] == 4


# This is more about the model than the API - should this be moved to a different test?
@pytest.mark.parametrize("obj_tree_1, field, inherit, new_val", [
    ({'has_category': True, 'inherit': True},
     'supermarket_category', True, 'cat_1'),
    ({'has_category': True, 'inherit': False},
     'supermarket_category', False, 'cat_1'),
    ({'ignore_shopping': True, 'inherit': True}, 'ignore_shopping', True, 'false'),
    ({'ignore_shopping': True, 'inherit': False},
     'ignore_shopping', False, 'false'),
    ({'substitute_children': True, 'inherit': True},
     'substitute_children', True, 'false'),
    ({'substitute_children': True, 'inherit': False},
     'substitute_children', False, 'false'),
    ({'substitute_siblings': True, 'inherit': True},
     'substitute_siblings', True, 'false'),
    ({'substitute_siblings': True, 'inherit': False},
     'substitute_siblings', False, 'false'),
], indirect=['obj_tree_1'])  # indirect=True populates magic variable request.param of obj_tree_1 with the parameter
def test_inherit(request, obj_tree_1, field, inherit, new_val, u1_s1):
    with scope(space=obj_tree_1.space):
        parent = obj_tree_1.get_parent()
        child = obj_tree_1.get_descendants()[0]

    new_val = request.getfixturevalue(new_val)
    # if this test passes it demonstrates that inheritance works
    #  when moving to a parent as each food is created with a different category
    assert (getattr(parent, field) == getattr(
        obj_tree_1, field)) in [inherit, True]
    assert (getattr(obj_tree_1, field) == getattr(
        child, field)) in [inherit, True]
    # change parent to a new value
    setattr(parent, field, new_val)
    with scope(space=parent.space):
        parent.save()  # trigger post-save signal
        # get the objects again because values are cached
        obj_tree_1 = Food.objects.get(id=obj_tree_1.id)
        child = Food.objects.get(id=child.id)
    # when changing parent value the obj value should be same if inherited
    assert (getattr(obj_tree_1, field) == new_val) == inherit
    assert (getattr(child, field) == new_val) == inherit


# TODO add test_inherit with child_inherit


@pytest.mark.parametrize("obj_tree_1", [
    ({
        'has_category': True,
        'inherit': False,
        'ignore_shopping': True,
        'substitute_children': True,
        'substitute_siblings': True,
    }),
], indirect=['obj_tree_1'])
@pytest.mark.parametrize("global_reset", [True, False])
@pytest.mark.parametrize("field", ['ignore_shopping', 'substitute_children', 'substitute_siblings', 'supermarket_category'])
def test_reset_inherit_space_fields(obj_tree_1, space_1, global_reset, field):
    with scope(space=space_1):
        parent = obj_tree_1.get_parent()
        child = obj_tree_1.get_descendants()[0]

        if field == 'supermarket_category':
            assert parent.supermarket_category != child.supermarket_category
            assert parent.supermarket_category != obj_tree_1.supermarket_category
        else:
            setattr(obj_tree_1, field, False)
            obj_tree_1.save()
            assert getattr(parent, field) == getattr(child, field)
            assert getattr(parent, field) != getattr(obj_tree_1, field)

        if global_reset:
            # set default inherit fields
            space_1.food_inherit.add(*Food.inheritable_fields.values_list('id', flat=True))
            parent.reset_inheritance(space=space_1)
        else:
            obj_tree_1.child_inherit_fields.set(Food.inheritable_fields.values_list('id', flat=True))
            obj_tree_1.save()
            parent.reset_inheritance(space=space_1, food=obj_tree_1)
        # djangotree bypasses ORM and need to be retrieved again
        obj_tree_1 = Food.objects.get(id=obj_tree_1.id)
        parent = Food.objects.get(id=parent.id)
        child = Food.objects.get(id=child.id)

        assert (getattr(parent, field) == getattr(obj_tree_1, field)) == global_reset
        assert getattr(obj_tree_1, field) == getattr(child, field)


@pytest.mark.parametrize("obj_tree_1", [
    ({
        'has_category': True,
        'inherit': False,
        'ignore_shopping': True,
        'substitute_children': True,
        'substitute_siblings': True,
    }),
], indirect=['obj_tree_1'])
@pytest.mark.parametrize("field", ['ignore_shopping', 'substitute_children', 'substitute_siblings', 'supermarket_category'])
def test_reset_inherit_no_food_instances(obj_tree_1, space_1, field):
    with scope(space=space_1):
        parent = obj_tree_1.get_parent()
        Food.objects.all().delete()

        # set default inherit fields
        space_1.food_inherit.add(*Food.inheritable_fields.values_list('id', flat=True))
        parent.reset_inheritance(space=space_1)


def test_onhand(obj_1, u1_s1, u2_s1, space_1):
    assert json.loads(u1_s1.get(reverse(DETAIL_URL, args={obj_1.id})).content)['food_onhand'] is False
    assert json.loads(u2_s1.get(reverse(DETAIL_URL, args={obj_1.id})).content)['food_onhand'] is False

    u1_s1.patch(
        reverse(
            DETAIL_URL,
            args={obj_1.id}
        ),
        {'food_onhand': True},
        content_type='application/json'
    )
    assert json.loads(u1_s1.get(reverse(DETAIL_URL, args={obj_1.id})).content)['food_onhand'] is True
    assert json.loads(u2_s1.get(reverse(DETAIL_URL, args={obj_1.id})).content)['food_onhand'] is False

    user1 = auth.get_user(u1_s1)
    user2 = auth.get_user(u2_s1)
    user1.userpreference.shopping_share.add(user2)
    caches['default'].set(f'shopping_shared_users_{space_1.id}_{user2.id}', None)

    assert json.loads(u2_s1.get(reverse(DETAIL_URL, args={obj_1.id})).content)['food_onhand'] is True


# ==================== list filter helpers ====================

def get_filter_results(client, params=''):
    """Helper to GET the food list and return parsed results."""
    r = client.get(f'{reverse(LIST_URL)}{params}')
    assert r.status_code == 200
    return json.loads(r.content)


# ==================== onhand filter ====================

@pytest.mark.parametrize("filter_value,expected_count", [
    ('true', 1),
    ('false', 1),
])
def test_filter_onhand(filter_value, expected_count, u1_s1, space_1):
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        food_onhand = FoodFactory(space=space_1, users_onhand=[user])
        food_not_onhand = FoodFactory(space=space_1)

    response = get_filter_results(u1_s1, f'?onhand={filter_value}')
    assert response['count'] == expected_count

    if filter_value == 'true':
        assert food_onhand.id in [x['id'] for x in response['results']]
    else:
        assert food_not_onhand.id in [x['id'] for x in response['results']]


def test_filter_onhand_shared_user(u1_s1, u2_s1, space_1):
    """Onhand filter should respect shopping sharing — shared user's onhand foods should be visible."""
    user1 = auth.get_user(u1_s1)
    user2 = auth.get_user(u2_s1)
    # user2 shares shopping with user1, so user1 can see user2's onhand foods
    user2.userpreference.shopping_share.add(user1)
    caches['default'].delete(f'shopping_shared_users_{space_1.id}_{user1.id}')

    with scopes_disabled():
        food_onhand_user2 = FoodFactory(space=space_1, users_onhand=[user2])
        FoodFactory(space=space_1)

    response = get_filter_results(u1_s1, '?onhand=true')
    assert food_onhand_user2.id in [x['id'] for x in response['results']]


def test_filter_onhand_no_duplicates(u1_s1, u2_s1, space_1):
    """Onhand filter should not return duplicate rows when food is onhand for multiple shared users."""
    user1 = auth.get_user(u1_s1)
    user2 = auth.get_user(u2_s1)
    user2.userpreference.shopping_share.add(user1)
    caches['default'].delete(f'shopping_shared_users_{space_1.id}_{user1.id}')

    with scopes_disabled():
        # food is onhand for both user1 AND user2 (both in shared_users)
        food = FoodFactory(space=space_1, users_onhand=[user1, user2])

    response = get_filter_results(u1_s1, '?onhand=true')
    result_ids = [x['id'] for x in response['results']]
    assert result_ids.count(food.id) == 1, f"Food {food.id} appears {result_ids.count(food.id)} times, expected 1"


# ==================== has_substitute filter ====================

def test_filter_has_substitute_true(u1_s1, space_1):
    with scopes_disabled():
        food_with_sub = FoodFactory(space=space_1)
        food_substitute = FoodFactory(space=space_1)
        food_without_sub = FoodFactory(space=space_1)
        food_with_sub.substitute.add(food_substitute)

    response = get_filter_results(u1_s1, '?has_substitute=true')
    result_ids = [x['id'] for x in response['results']]
    assert food_with_sub.id in result_ids
    assert food_without_sub.id not in result_ids


def test_filter_has_substitute_false(u1_s1, space_1):
    with scopes_disabled():
        food_with_sub = FoodFactory(space=space_1)
        food_substitute = FoodFactory(space=space_1)
        food_without_sub = FoodFactory(space=space_1)
        food_with_sub.substitute.add(food_substitute)

    response = get_filter_results(u1_s1, '?has_substitute=false')
    result_ids = [x['id'] for x in response['results']]
    assert food_with_sub.id not in result_ids
    # food_substitute and food_without_sub should be in results (neither has substitutes assigned TO them)
    assert food_without_sub.id in result_ids


# ==================== in_shopping_list filter ====================

def test_filter_in_shopping_list_true(u1_s1, space_1):
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        food_in_list = FoodFactory(space=space_1)
        food_not_in_list = FoodFactory(space=space_1)
        ShoppingListEntryFactory(food=food_in_list, space=space_1, created_by=user, checked=False)

    response = get_filter_results(u1_s1, '?in_shopping_list=true')
    result_ids = [x['id'] for x in response['results']]
    assert food_in_list.id in result_ids
    assert food_not_in_list.id not in result_ids


def test_filter_in_shopping_list_false(u1_s1, space_1):
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        food_in_list = FoodFactory(space=space_1)
        food_not_in_list = FoodFactory(space=space_1)
        ShoppingListEntryFactory(food=food_in_list, space=space_1, created_by=user, checked=False)

    response = get_filter_results(u1_s1, '?in_shopping_list=false')
    result_ids = [x['id'] for x in response['results']]
    assert food_in_list.id not in result_ids
    assert food_not_in_list.id in result_ids


def test_filter_in_shopping_list_checked_excluded(u1_s1, space_1):
    """Checked-off shopping list entries should NOT count as 'in shopping list'."""
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        food = FoodFactory(space=space_1)
        ShoppingListEntryFactory(food=food, space=space_1, created_by=user, checked=True)

    response = get_filter_results(u1_s1, '?in_shopping_list=true')
    result_ids = [x['id'] for x in response['results']]
    assert food.id not in result_ids


# ==================== ignore_shopping filter ====================

def test_filter_ignore_shopping(u1_s1, space_1):
    with scopes_disabled():
        food_ignored = FoodFactory(space=space_1)
        food_not_ignored = FoodFactory(space=space_1)
        food_ignored.ignore_shopping = True
        food_ignored.save()

    response = get_filter_results(u1_s1, '?ignore_shopping=true')
    result_ids = [x['id'] for x in response['results']]
    assert food_ignored.id in result_ids
    assert food_not_ignored.id not in result_ids

    response = get_filter_results(u1_s1, '?ignore_shopping=false')
    result_ids = [x['id'] for x in response['results']]
    assert food_ignored.id not in result_ids
    assert food_not_ignored.id in result_ids


# ==================== has_children filter ====================

def test_filter_has_children(u1_s1, space_1):
    with scopes_disabled():
        parent = FoodFactory(space=space_1)
        child = FoodFactory(space=space_1)
        leaf = FoodFactory(space=space_1)
        child.move(parent, node_location)
        # Re-fetch to get updated numchild
        parent = Food.objects.get(id=parent.id)
        child = Food.objects.get(id=child.id)

    response = get_filter_results(u1_s1, '?has_children=true')
    result_ids = [x['id'] for x in response['results']]
    assert parent.id in result_ids
    assert child.id not in result_ids
    assert leaf.id not in result_ids

    response = get_filter_results(u1_s1, '?has_children=false')
    result_ids = [x['id'] for x in response['results']]
    assert parent.id not in result_ids
    assert child.id in result_ids
    assert leaf.id in result_ids


# ==================== has_recipe filter ====================

def test_filter_has_recipe(u1_s1, space_1):
    with scopes_disabled():
        recipe = RecipeFactory(space=space_1)
        food_with_recipe = FoodFactory(space=space_1)
        food_without_recipe = FoodFactory(space=space_1)
        food_with_recipe.recipe = recipe
        food_with_recipe.save()

    response = get_filter_results(u1_s1, '?has_recipe=true')
    result_ids = [x['id'] for x in response['results']]
    assert food_with_recipe.id in result_ids
    assert food_without_recipe.id not in result_ids

    response = get_filter_results(u1_s1, '?has_recipe=false')
    result_ids = [x['id'] for x in response['results']]
    assert food_with_recipe.id not in result_ids
    assert food_without_recipe.id in result_ids


# ==================== supermarket_category filter ====================

def test_filter_supermarket_category(u1_s1, space_1, cat_1, cat_2):
    with scopes_disabled():
        food_cat1 = FoodFactory(space=space_1)
        food_cat2 = FoodFactory(space=space_1)
        food_no_cat = FoodFactory(space=space_1)
        food_cat1.supermarket_category = cat_1
        food_cat1.save()
        food_cat2.supermarket_category = cat_2
        food_cat2.save()

    response = get_filter_results(u1_s1, f'?supermarket_category={cat_1.id}')
    result_ids = [x['id'] for x in response['results']]
    assert food_cat1.id in result_ids
    assert food_cat2.id not in result_ids
    assert food_no_cat.id not in result_ids


# ==================== combined filters ====================

def test_filter_combined(u1_s1, space_1, cat_1):
    """Multiple filters should be AND-combined."""
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        food_both = FoodFactory(space=space_1, users_onhand=[user])
        food_onhand_only = FoodFactory(space=space_1, users_onhand=[user])
        food_cat_only = FoodFactory(space=space_1)
        food_both.supermarket_category = cat_1
        food_both.save()
        food_cat_only.supermarket_category = cat_1
        food_cat_only.save()

    response = get_filter_results(u1_s1, f'?onhand=true&supermarket_category={cat_1.id}')
    result_ids = [x['id'] for x in response['results']]
    assert food_both.id in result_ids
    assert food_onhand_only.id not in result_ids
    assert food_cat_only.id not in result_ids


# ==================== filter with no match ====================

def test_filter_no_results(u1_s1, space_1):
    with scopes_disabled():
        FoodFactory(space=space_1)

    response = get_filter_results(u1_s1, '?onhand=true')
    assert response['count'] == 0


# ==================== filter values are case-insensitive ====================

def test_filter_case_insensitive(u1_s1, space_1):
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        FoodFactory(space=space_1, users_onhand=[user])
        FoodFactory(space=space_1)

    for val in ['True', 'TRUE', 'true', '1']:
        response = get_filter_results(u1_s1, f'?onhand={val}')
        assert response['count'] == 1, f"onhand={val} should return 1 result"
