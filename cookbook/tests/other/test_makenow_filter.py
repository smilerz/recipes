import time

import pytest
from django.contrib import auth
from django_scopes import scope

from cookbook.helper.recipe_search import RecipeSearch
from cookbook.models import Food, InventoryEntry, InventoryLocation, Recipe, UserSpace
from cookbook.tests.factories import (FoodFactory, HouseholdFactory, InventoryEntryFactory,
                                      InventoryLocationFactory, RecipeFactory)

# TODO returns recipes with all ingredients via child substitute
# TODO returns recipes with all ingredients via sibling substitute

if (Food.node_order_by):
    node_location = 'sorted-child'
else:
    node_location = 'last-child'


def _location(household, space):
    """The household's default inventory location, created once per test."""
    return InventoryLocation.objects.filter(household=household).first() \
        or InventoryLocationFactory(space=space, household=household)


def _stock(food, household, space, user):
    """Put a food on hand by adding a household inventory lot (replaces onhand_users)."""
    InventoryEntryFactory(space=space, food=food, inventory_location=_location(household, space),
                          amount=1, created_by=user)


def _unstock(food, household):
    """Take a food off hand by removing its household inventory lots."""
    InventoryEntry.objects.filter(food=food, inventory_location__household=household).delete()


@pytest.fixture
def recipes(space_1):
    return RecipeFactory.create_batch(10, space=space_1)


@pytest.fixture
def household(u1_s1, u2_s1, space_1):
    user1 = auth.get_user(u1_s1)
    user2 = auth.get_user(u2_s1)
    hh = HouseholdFactory(space=space_1)
    UserSpace.objects.filter(space=space_1, user__in=[user1, user2]).update(household=hh)
    return hh


@pytest.fixture
def user1(u1_s1, household):
    return auth.get_user(u1_s1)


@pytest.fixture
def makenow_recipe(request, space_1, household):
    """A recipe whose every ingredient food is on hand in the household pantry."""
    onhand_user = auth.get_user(request.getfixturevalue(request.param.get('onhand_users', 'u1_s1')))

    recipe = RecipeFactory.create(space=space_1)
    for food in Food.objects.filter(ingredient__step__recipe=recipe.id):
        _stock(food, household, space_1, onhand_user)
    return recipe


def _onhand_food_count(recipe, household):
    return Food.objects.filter(
        ingredient__step__recipe=recipe.id,
        inventoryentry__amount__gt=0,
        inventoryentry__inventory_location__household=household,
    ).distinct().count()


@pytest.mark.parametrize("makenow_recipe", [({'onhand_users': 'u1_s1'}), ({'onhand_users': 'u2_s1'})], indirect=['makenow_recipe'])
def test_makenow_onhand(recipes, makenow_recipe, user1, space_1):
    request = type('', (object, ), {'space': space_1, 'user': user1, 'user_space': UserSpace.objects.filter(space=space_1, user=user1).first()})()
    search = RecipeSearch(request, makenow='true')
    with scope(space=space_1):
        search = search.get_queryset(Recipe.objects.all())
        assert search.count() == 1
        assert search.first().id == makenow_recipe.id


@pytest.mark.parametrize("makenow_recipe", [({'onhand_users': 'u1_s1'}), ({'onhand_users': 'u2_s1'})], indirect=['makenow_recipe'])
def test_makenow_ignoreshopping(recipes, makenow_recipe, user1, household, space_1):
    request = type('', (object, ), {'space': space_1, 'user': user1, 'user_space': UserSpace.objects.filter(space=space_1, user=user1).first()})()
    search = RecipeSearch(request, makenow='true')
    with scope(space=space_1):
        food = Food.objects.filter(ingredient__step__recipe=makenow_recipe.id).first()
        _unstock(food, household)
        assert search.get_queryset(Recipe.objects.all()).count() == 0
        food.ignore_shopping = True
        food.save()
        assert _onhand_food_count(makenow_recipe, household) == 9
        assert Food.objects.filter(ingredient__step__recipe=makenow_recipe.id, ignore_shopping=True).count() == 1
        search = search.get_queryset(Recipe.objects.all())
        assert search.count() == 1
        assert search.first().id == makenow_recipe.id


@pytest.mark.parametrize("makenow_recipe", [({'onhand_users': 'u1_s1'}), ({'onhand_users': 'u2_s1'})], indirect=['makenow_recipe'])
def test_makenow_substitute(recipes, makenow_recipe, user1, household, space_1):
    request = type('', (object, ), {'space': space_1, 'user': user1, 'user_space': UserSpace.objects.filter(space=space_1, user=user1).first()})()
    search = RecipeSearch(request, makenow='true')
    with scope(space=space_1):
        food = Food.objects.filter(ingredient__step__recipe=makenow_recipe.id).first()
        _unstock(food, household)
        assert search.get_queryset(Recipe.objects.all()).count() == 0
        substitute = FoodFactory.create(space=space_1)
        _stock(substitute, household, space_1, user1)
        food.substitute.add(substitute)
        assert _onhand_food_count(makenow_recipe, household) == 9
        assert Food.objects.filter(ingredient__step__recipe=makenow_recipe.id, substitute__isnull=False).count() == 1

        search = search.get_queryset(Recipe.objects.all())
        assert search.count() == 1
        assert search.first().id == makenow_recipe.id


@pytest.mark.parametrize("makenow_recipe", [({'onhand_users': 'u1_s1'}), ({'onhand_users': 'u2_s1'})], indirect=['makenow_recipe'])
def test_makenow_child_substitute(recipes, makenow_recipe, user1, household, space_1):
    request = type('', (object, ), {'space': space_1, 'user': user1, 'user_space': UserSpace.objects.filter(space=space_1, user=user1).first()})()
    search = RecipeSearch(request, makenow='true')
    with scope(space=space_1):
        food = Food.objects.filter(ingredient__step__recipe=makenow_recipe.id).first()
        _unstock(food, household)
        food.substitute_children = True
        food.save()
        assert search.get_queryset(Recipe.objects.all()).count() == 0
        new_food = FoodFactory.create(space=space_1)
        _stock(new_food, household, space_1, user1)
        new_food.move(food, node_location)
        assert _onhand_food_count(makenow_recipe, household) == 9
        assert Food.objects.filter(ingredient__step__recipe=makenow_recipe.id, numchild__gt=0).count() == 1
        search = search.get_queryset(Recipe.objects.all())
        assert search.count() == 1
        assert search.first().id == makenow_recipe.id


@pytest.mark.parametrize("makenow_recipe", [({'onhand_users': 'u1_s1'}), ({'onhand_users': 'u2_s1'})], indirect=['makenow_recipe'])
def test_makenow_sibling_substitute(recipes, makenow_recipe, user1, household, space_1):
    request = type('', (object, ), {'space': space_1, 'user': user1, 'user_space': UserSpace.objects.filter(space=space_1, user=user1).first()})()
    search = RecipeSearch(request, makenow='true')
    with scope(space=space_1):
        food = Food.objects.filter(ingredient__step__recipe=makenow_recipe.id).first()
        _unstock(food, household)
        food.substitute_siblings = True
        food.save()
        assert search.get_queryset(Recipe.objects.all()).count() == 0

        new_parent = FoodFactory.create(space=space_1)
        new_sibling = FoodFactory.create(space=space_1)
        _stock(new_sibling, household, space_1, user1)
        new_sibling.move(new_parent, node_location)
        food.move(new_parent, node_location)
        # force refresh from database, treebeard bypasses ORM after short pause
        time.sleep(1)
        food = Food.objects.get(id=food.id)
        assert _onhand_food_count(makenow_recipe, household) == 9
        assert Food.objects.filter(ingredient__step__recipe=makenow_recipe.id, depth=2).count() == 1

        search = search.get_queryset(Recipe.objects.all())
        assert search.count() == 1
        assert search.first().id == makenow_recipe.id
