import json

import pytest
from django.contrib import auth
from django.urls import reverse

from cookbook.models import ShoppingListEntry, ShoppingListRecipe

LIST_URL = 'api:shoppinglistrecipe-list'
DETAIL_URL = 'api:shoppinglistrecipe-detail'


@pytest.fixture()
def obj_1(space_1, u1_s1, recipe_1_s1):
    r = ShoppingListRecipe.objects.create(recipe=recipe_1_s1, servings=1, space=space_1, created_by=auth.get_user(u1_s1))
    for ing in r.recipe.steps.first().ingredients.all():
        ShoppingListEntry.objects.create(list_recipe=r, ingredient=ing, food=ing.food, unit=ing.unit, amount=ing.amount, created_by=auth.get_user(u1_s1), space=space_1)
    return r


@pytest.mark.parametrize("arg", [['a_u', 403], ['g1_s1', 200], ['u1_s1', 200], ['a1_s1', 200], ])
def test_list_permission(arg, request):
    c = request.getfixturevalue(arg[0])
    assert c.get(reverse(LIST_URL)).status_code == arg[1]


@pytest.mark.parametrize("arg", [['a_u', 403], ['g1_s1', 404], ['u1_s1', 200], ['a1_s1', 404], ['g1_s2', 404], ['u1_s2', 404], ['a1_s2', 404], ])
def test_update(arg, request, obj_1):
    c = request.getfixturevalue(arg[0])
    r = c.patch(reverse(DETAIL_URL, args={obj_1.id}), {'servings': 2}, content_type='application/json')
    assert r.status_code == arg[1]
    if r.status_code == 200:
        response = json.loads(r.content)
        assert response['servings'] == 2


@pytest.mark.parametrize("arg", [['a_u', 403], ['g1_s1', 201], ['u1_s1', 201], ['a1_s1', 201], ])
def test_add(arg, request, obj_1, recipe_1_s1):
    c = request.getfixturevalue(arg[0])
    r = c.post(reverse(LIST_URL), {'recipe': recipe_1_s1.pk, 'servings': 1}, content_type='application/json')
    response = json.loads(r.content)
    print(r.content)
    assert r.status_code == arg[1]
    if r.status_code == 201:
        assert response['recipe'] == recipe_1_s1.pk


def test_delete(u1_s1, u1_s2, obj_1):
    r = u1_s2.delete(reverse(DETAIL_URL, args={obj_1.id}))
    assert r.status_code == 404

    r = u1_s1.delete(reverse(DETAIL_URL, args={obj_1.id}))

    assert r.status_code == 204


@pytest.mark.parametrize('foreign', ['food', 'unit', 'ingredient'])
def test_bulk_create_entries_ignores_ids_from_another_space(u1_s1, obj_1, space_1, space_2, foreign):
    from django_scopes import scopes_disabled
    from cookbook.tests.factories import FoodFactory, IngredientFactory, UnitFactory
    with scopes_disabled():
        entry = {'amount': 1, 'unit_id': None, 'food_id': FoodFactory(space=space_1).id, 'ingredient_id': None}
        if foreign == 'food':
            entry['food_id'] = FoodFactory(space=space_2).id
        elif foreign == 'unit':
            entry['unit_id'] = UnitFactory(space=space_2).id
        else:
            entry['ingredient_id'] = IngredientFactory(space=space_2).id
    foreign_id = entry[f'{foreign}_id']

    r = u1_s1.post(reverse('api:shoppinglistrecipe-bulk-create-entries', args=[obj_1.id]), {'entries': [entry], 'shopping_lists_ids': []}, content_type='application/json')

    assert r.status_code == 200
    with scopes_disabled():
        assert not ShoppingListEntry.objects.filter(**{f'{foreign}_id': foreign_id}).exists()


def test_bulk_create_entries_ignores_shopping_list_from_another_space(u1_s1, obj_1, space_1, space_2):
    from django_scopes import scopes_disabled
    from cookbook.models import ShoppingList
    from cookbook.tests.factories import FoodFactory
    with scopes_disabled():
        food = FoodFactory(space=space_1)
        foreign_list = ShoppingList.objects.create(name='foreign', space=space_2)

    r = u1_s1.post(reverse('api:shoppinglistrecipe-bulk-create-entries', args=[obj_1.id]),
                   {'entries': [{'amount': 1, 'unit_id': None, 'food_id': food.id, 'ingredient_id': None}], 'shopping_lists_ids': [foreign_list.id]},
                   content_type='application/json')

    assert r.status_code == 200
    with scopes_disabled():
        assert not ShoppingListEntry.shopping_lists.through.objects.filter(shoppinglist_id=foreign_list.id).exists()


def test_bulk_create_entries_response_only_lists_created_entries(u1_s1, obj_1, space_1, space_2):
    from django_scopes import scopes_disabled
    from cookbook.tests.factories import FoodFactory
    with scopes_disabled():
        own_food = FoodFactory(space=space_1)
        foreign_food = FoodFactory(space=space_2)
    entries = [{'amount': 1, 'unit_id': None, 'food_id': food.id, 'ingredient_id': None} for food in (own_food, foreign_food)]

    r = u1_s1.post(reverse('api:shoppinglistrecipe-bulk-create-entries', args=[obj_1.id]), {'entries': entries, 'shopping_lists_ids': []}, content_type='application/json')

    assert r.status_code == 200
    assert [e['food_id'] for e in json.loads(r.content)['entries']] == [own_food.id]
    with scopes_disabled():
        assert ShoppingListEntry.objects.filter(food_id=own_food.id).count() == 1


def _recipe_for(kind, user, other, space):
    from django_scopes import scopes_disabled
    from cookbook.tests.factories import RecipeFactory
    with scopes_disabled():
        recipe = RecipeFactory(space=space, created_by=user if kind == 'own_private' else other, private=kind != 'public')
        if kind == 'shared_private':
            recipe.shared.add(user)
    return recipe


@pytest.mark.parametrize('kind, expected', [('public', 201), ('own_private', 201), ('shared_private', 201), ('private_of_another_user', 400)])
def test_create_only_accepts_a_recipe_the_user_can_see(u1_s1, u2_s1, space_1, kind, expected):
    recipe = _recipe_for(kind, auth.get_user(u1_s1), auth.get_user(u2_s1), space_1)

    r = u1_s1.post(reverse(LIST_URL), {'recipe': recipe.id, 'servings': 1}, content_type='application/json')

    assert r.status_code == expected
    if expected == 400:
        assert recipe.name not in r.content.decode()


def test_create_refuses_a_meal_plan_of_another_user(u1_s1, u2_s1, space_1):
    from django_scopes import scopes_disabled
    from cookbook.tests.factories import MealPlanFactory
    with scopes_disabled():
        own = MealPlanFactory(space=space_1, created_by=auth.get_user(u1_s1), has_recipe=False)
        other = MealPlanFactory(space=space_1, created_by=auth.get_user(u2_s1), has_recipe=False, note='U2-PRIVATE-NOTE')

    assert u1_s1.post(reverse(LIST_URL), {'mealplan': own.id, 'servings': 1}, content_type='application/json').status_code == 201
    r = u1_s1.post(reverse(LIST_URL), {'mealplan': other.id, 'servings': 1}, content_type='application/json')

    assert r.status_code == 400
    assert 'U2-PRIVATE-NOTE' not in r.content.decode()
