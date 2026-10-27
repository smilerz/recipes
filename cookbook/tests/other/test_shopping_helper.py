"""
RecipeShoppingEditor: what a recipe, or a meal plan, puts on the shopping list, and how the list follows later changes.

The API tests in api/test_api_shopping_recipe.py check what arrives on the list. These call the editor the way the views and
serializers do (a user and a space, then id, recipe, mealplan and servings) and check the exact values: the servings that count,
the amounts, who owns the list, and what edit, scale and delete do to the entries.
"""
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.conf import settings
from django.contrib import auth
from django_scopes import scope, scopes_disabled

from cookbook.connectors.connector_manager import ActionType, ConnectorManager
from cookbook.helper.permission_helper import invalidate_household_cache
from cookbook.helper.shopping_helper import RecipeShoppingEditor
from cookbook.models import Household, Ingredient, ShoppingList, ShoppingListEntry, ShoppingListRecipe, UserSpace
from cookbook.tests.factories import InventoryEntryFactory, InventoryLocationFactory, MealPlanFactory, RecipeFactory

# work around for bug described here https://stackoverflow.com/a/70312265/15762829
if settings.DATABASES['default']['ENGINE'] == 'django.db.backends.postgresql':
    from django.db.backends.postgresql.features import DatabaseFeatures
    DatabaseFeatures.can_defer_constraint_checks = False


@pytest.fixture(autouse=True)
def in_space(space_1):
    with scope(space=space_1):
        yield


def _user(client):
    return auth.get_user(client)


def _editor(client, space, **kwargs):
    return RecipeShoppingEditor(_user(client), space, **kwargs)


def _created(client, space, recipe, create_kwargs=None, **kwargs):
    """The list the recipe endpoint makes: an editor for the recipe, and the editor after create."""
    editor = _editor(client, space, recipe=recipe, **kwargs)
    editor.create(**(create_kwargs or {}))
    return editor


def _entries(editor_or_slr):
    slr = getattr(editor_or_slr, '_shopping_list_recipe', editor_or_slr)
    return ShoppingListEntry.objects.filter(list_recipe=slr)


def _ingredient_ids(recipe):
    return sorted(Ingredient.objects.filter(step__recipe=recipe).values_list('id', flat=True))


def _household(space, *clients):
    with scopes_disabled():
        household = Household.objects.create(name='household', space=space)
        for client in clients:
            UserSpace.objects.filter(user=_user(client), space=space).update(household=household)
        for user_space in UserSpace.objects.filter(space=space, household=household):
            invalidate_household_cache(user_space)
    return household


def _preferences(client, **preferences):
    user = _user(client)
    for name, value in preferences.items():
        setattr(user.userpreference, name, value)
    user.userpreference.save()


# ---------------------------------------------------------------------------------------------------------------------
# Opening an editor: what it takes from its arguments, and from a list that already exists
# ---------------------------------------------------------------------------------------------------------------------

def test_an_editor_without_arguments_has_nothing_set(u1_s1, space_1):
    editor = _editor(u1_s1, space_1)
    assert (editor.id, editor.mealplan, editor.recipe, editor.servings, editor._shopping_list_recipe) == (None, None, None, None, None)
    assert (editor.created_by, editor.space) == (_user(u1_s1), space_1)


@pytest.mark.parametrize("given,expected", [('3', 3.0), (2, 2.0), (2.5, 2.5), ('x', None), ('', None), (None, None)])
def test_servings_are_read_as_a_number(given, expected, u1_s1, space_1):
    assert _editor(u1_s1, space_1, servings=given).servings == expected


def test_servings_fall_back_to_the_list_then_the_meal_plan_then_the_recipe(u1_s1, space_1, recipe_1_s1):
    plan = MealPlanFactory(space=space_1, created_by=_user(u1_s1), recipe=recipe_1_s1, servings=6)
    assert _editor(u1_s1, space_1, recipe=recipe_1_s1).servings == 4
    assert _editor(u1_s1, space_1, mealplan=plan).servings == 6
    assert _editor(u1_s1, space_1, mealplan=plan, recipe=recipe_1_s1).servings == 6
    assert _editor(u1_s1, space_1, mealplan=plan, servings=2).servings == 2
    slr = _created(u1_s1, space_1, recipe_1_s1, {'servings': 9})._shopping_list_recipe
    assert _editor(u1_s1, space_1, id=slr.id, mealplan=plan).servings == 9


@pytest.mark.parametrize("shape", ['id', 'dict', 'object'])
def test_a_meal_plan_is_found_from_its_id_as_a_number_a_dict_or_an_object(shape, u1_s1, space_1, recipe_1_s1):
    plan = MealPlanFactory(space=space_1, created_by=_user(u1_s1), recipe=recipe_1_s1)
    given = {'id': plan.id, 'object': plan}.get(shape, plan.id)
    editor = _editor(u1_s1, space_1, mealplan=given)
    assert editor.mealplan == plan
    assert editor.recipe == recipe_1_s1


@pytest.mark.parametrize("shape", ['id', 'dict'])
def test_a_meal_plan_of_another_space_is_not_found(shape, u1_s1, space_1, space_2):
    with scopes_disabled():
        other = RecipeFactory(space=space_2)
        plan = MealPlanFactory(space=space_2, recipe=other)
    given = {'id': plan.id} if shape == 'dict' else plan.id
    assert _editor(u1_s1, space_1, mealplan=given).mealplan is None


def test_a_recipe_given_to_the_editor_is_the_recipe_of_the_list(u1_s1, space_1, recipe_1_s1, recipe_2_s1):
    assert _editor(u1_s1, space_1, recipe=recipe_1_s1).recipe == recipe_1_s1
    slr = _created(u1_s1, space_1, recipe_1_s1)._shopping_list_recipe
    # the list knows its recipe, and that wins over the one that is given
    assert _editor(u1_s1, space_1, id=slr.id, recipe=recipe_2_s1).recipe == recipe_1_s1


def test_a_list_is_found_for_its_owner_and_the_members_of_the_household_only(u1_s1, u2_s1, u1_s2, space_1, space_2, recipe_1_s1):
    slr = _created(u1_s1, space_1, recipe_1_s1)._shopping_list_recipe

    def find(client, space, id=slr.id):
        with scopes_disabled():
            return RecipeShoppingEditor.get_shopping_list_recipe(id, _user(client), space)

    assert find(u1_s1, space_1) == slr
    assert find(u2_s1, space_1) is None  # same space, but not the same household
    _household(space_1, u1_s1, u2_s1)
    assert find(u2_s1, space_1) == slr
    assert find(u1_s1, space_1, id=slr.id + 1000) is None
    assert find(u1_s2, space_2) is None  # in another space the list does not exist


def test_the_creator_of_the_entries_stays_the_owner_of_the_list(u1_s1, u2_s1, space_1, recipe_1_s1):
    slr = _created(u1_s1, space_1, recipe_1_s1)._shopping_list_recipe
    _household(space_1, u1_s1, u2_s1)
    assert _editor(u2_s1, space_1, id=slr.id).created_by == _user(u1_s1)


def test_an_editor_for_an_existing_list_takes_its_recipe_and_servings(u1_s1, space_1, recipe_1_s1):
    slr = _created(u1_s1, space_1, recipe_1_s1, {'servings': 6})._shopping_list_recipe
    editor = _editor(u1_s1, space_1, id=slr.id)
    assert (editor.recipe, editor.servings) == (recipe_1_s1, 6)


# ---------------------------------------------------------------------------------------------------------------------
# get_recipe_ingredients
# ---------------------------------------------------------------------------------------------------------------------

def test_the_ingredients_of_a_recipe_leave_out_foods_that_are_not_shopped_for(u1_s1, space_1, recipe_1_s1, recipe_2_s1):
    ids = _ingredient_ids(recipe_1_s1)
    editor = _editor(u1_s1, space_1)
    assert sorted(editor.get_recipe_ingredients(recipe_1_s1.id).values_list('id', flat=True)) == ids

    ignored = Ingredient.objects.get(id=ids[0]).food
    ignored.ignore_shopping = True
    ignored.save()
    assert sorted(editor.get_recipe_ingredients(recipe_1_s1.id).values_list('id', flat=True)) == ids[1:]
    assert sorted(editor.get_recipe_ingredients(recipe_1_s1.id, exclude_onhand=True).values_list('id', flat=True)) == ids[1:]


def test_a_food_that_is_on_hand_is_left_out_only_when_asked(u1_s1, space_1, recipe_1_s1):
    household = _household(space_1, u1_s1)
    ids = _ingredient_ids(recipe_1_s1)
    food = Ingredient.objects.get(id=ids[0]).food
    InventoryEntryFactory(space=space_1, food=food, inventory_location=InventoryLocationFactory(space=space_1, household=household), amount=1)
    editor = _editor(u1_s1, space_1)
    assert sorted(editor.get_recipe_ingredients(recipe_1_s1.id).values_list('id', flat=True)) == ids
    assert sorted(editor.get_recipe_ingredients(recipe_1_s1.id, exclude_onhand=True).values_list('id', flat=True)) == ids[1:]


# ---------------------------------------------------------------------------------------------------------------------
# create
# ---------------------------------------------------------------------------------------------------------------------

def test_create_makes_a_list_and_one_entry_for_each_ingredient(u1_s1, space_1, recipe_1_s1):
    editor = _editor(u1_s1, space_1, recipe=recipe_1_s1)
    assert editor.create() is True

    slr = editor._shopping_list_recipe
    assert (slr.recipe, slr.mealplan, slr.servings, slr.space, slr.created_by) == (recipe_1_s1, None, 4, space_1, _user(u1_s1))
    entries = list(_entries(slr))
    assert sorted(e.ingredient_id for e in entries) == _ingredient_ids(recipe_1_s1)
    for entry in entries:
        ingredient = entry.ingredient
        assert (entry.food, entry.unit, entry.amount, entry.created_by, entry.space) == (ingredient.food, ingredient.unit, Decimal(1), _user(u1_s1), space_1)
        assert entry.checked is False


@pytest.mark.parametrize("servings,amount", [(4, 1), (8, 2), (6, 1.5), ('2', 0.5), (1, 0.25)])
def test_create_scales_the_amounts_by_the_servings_it_is_given(servings, amount, u1_s1, space_1, recipe_1_s1):
    editor = _created(u1_s1, space_1, recipe_1_s1, {'servings': servings})
    assert editor._shopping_list_recipe.servings == float(servings)
    assert {e.amount for e in _entries(editor)} == {Decimal(str(amount))}


def test_servings_given_to_create_win_over_those_given_to_the_editor(u1_s1, space_1, recipe_1_s1):
    assert {e.amount for e in _entries(_created(u1_s1, space_1, recipe_1_s1, {'servings': 8}, servings=2))} == {Decimal(2)}
    # and without them the editor's own servings count
    assert {e.amount for e in _entries(_created(u1_s1, space_1, recipe_1_s1, None, servings=2))} == {Decimal('0.5')}


def test_create_with_ingredients_adds_only_those_and_not_foods_that_are_not_shopped_for(u1_s1, space_1, recipe_1_s1):
    ids = _ingredient_ids(recipe_1_s1)
    ignored = Ingredient.objects.get(id=ids[2]).food
    ignored.ignore_shopping = True
    ignored.save()
    editor = _created(u1_s1, space_1, recipe_1_s1, {'ingredients': ids[:3]})
    assert sorted(e.ingredient_id for e in _entries(editor)) == ids[:2]


def test_create_takes_a_recipe_that_is_named_in_the_call(u1_s1, space_1, recipe_1_s1):
    editor = _editor(u1_s1, space_1)
    assert editor.create(recipe=recipe_1_s1) is True
    slr = editor._shopping_list_recipe
    assert (slr.recipe, slr.servings) == (recipe_1_s1, 4)
    assert _entries(slr).count() == 10


def test_create_for_a_meal_plan_takes_its_recipe_and_servings(u1_s1, space_1, recipe_1_s1):
    plan = MealPlanFactory(space=space_1, created_by=_user(u1_s1), recipe=recipe_1_s1, servings=6)
    editor = _editor(u1_s1, space_1)
    assert editor.create(mealplan=plan) is True
    slr = editor._shopping_list_recipe
    assert (slr.mealplan, slr.recipe, slr.servings) == (plan, recipe_1_s1, 6)
    assert {e.amount for e in _entries(slr)} == {Decimal('1.5')}


def test_create_for_a_meal_plan_given_as_a_dict(u1_s1, space_1, recipe_1_s1):
    plan = MealPlanFactory(space=space_1, created_by=_user(u1_s1), recipe=recipe_1_s1, servings=6)
    editor = _editor(u1_s1, space_1)
    assert editor.create(mealplan={'id': plan.id}) is True
    assert (editor._shopping_list_recipe.mealplan, editor._shopping_list_recipe.recipe) == (plan, recipe_1_s1)


def test_entries_take_the_shopping_lists_of_their_food(u1_s1, space_1, recipe_1_s1):
    ids = _ingredient_ids(recipe_1_s1)
    food = Ingredient.objects.get(id=ids[0]).food
    costco = ShoppingList.objects.create(name='Costco', space=space_1)
    food.shopping_lists.add(costco)
    editor = _created(u1_s1, space_1, recipe_1_s1)
    for entry in _entries(editor):
        assert list(entry.shopping_lists.all()) == ([costco] if entry.ingredient_id == ids[0] else [])


def test_create_tells_the_connectors_about_every_entry(u1_s1, space_1, recipe_1_s1):
    with patch.object(ConnectorManager, 'add_work') as add_work:
        _created(u1_s1, space_1, recipe_1_s1)
    add_work.assert_called_once()
    action, *entries = add_work.call_args.args
    assert action == ActionType.CREATED
    assert sorted(e.ingredient_id for e in entries) == _ingredient_ids(recipe_1_s1)


def test_on_hand_foods_are_left_out_only_for_users_who_ask_and_when_no_ingredients_are_given(u1_s1, space_1, recipe_1_s1):
    household = _household(space_1, u1_s1)
    ids = _ingredient_ids(recipe_1_s1)
    InventoryEntryFactory(space=space_1, food=Ingredient.objects.get(id=ids[0]).food,
                          inventory_location=InventoryLocationFactory(space=space_1, household=household), amount=1)

    _preferences(u1_s1, mealplan_autoexclude_onhand=True)
    assert sorted(e.ingredient_id for e in _entries(_created(u1_s1, space_1, recipe_1_s1))) == ids[1:]
    assert sorted(e.ingredient_id for e in _entries(_created(u1_s1, space_1, recipe_1_s1, {'ingredients': ids}))) == ids  # asked for by name

    _preferences(u1_s1, mealplan_autoexclude_onhand=False)
    assert sorted(e.ingredient_id for e in _entries(_created(u1_s1, space_1, recipe_1_s1))) == ids


@pytest.mark.parametrize("include_related,entries", [(True, 20), (False, 10)])
def test_the_ingredients_of_related_recipes_are_added_only_for_users_who_ask(include_related, entries, u1_s1, space_1):
    recipe = RecipeFactory(space=space_1, created_by=_user(u1_s1), steps__recipe_count=1)
    _preferences(u1_s1, mealplan_autoinclude_related=include_related)
    assert _entries(_created(u1_s1, space_1, recipe)).count() == entries


# ---------------------------------------------------------------------------------------------------------------------
# edit, edit_servings and delete
# ---------------------------------------------------------------------------------------------------------------------

def _open(client, space, recipe, slr, **kwargs):
    """The editor the recipe endpoint opens for a list that exists."""
    return _editor(client, space, id=slr.id, recipe=recipe, **kwargs)


def test_edit_scales_the_entries_when_the_servings_change(u1_s1, space_1, recipe_1_s1):
    slr = _created(u1_s1, space_1, recipe_1_s1)._shopping_list_recipe
    assert _open(u1_s1, space_1, recipe_1_s1, slr, servings=8).edit(servings=8) is True
    slr.refresh_from_db()
    assert slr.servings == 8
    assert {e.amount for e in _entries(slr)} == {Decimal(2)}


def test_edit_takes_the_servings_it_is_given_by_an_editor_that_only_knows_the_list(u1_s1, space_1, recipe_1_s1):
    """What a changed meal plan does: an editor with the id of the list, and the new servings only in the call."""
    slr = _created(u1_s1, space_1, recipe_1_s1)._shopping_list_recipe
    assert _editor(u1_s1, space_1, id=slr.id).edit(servings=8) is True
    slr.refresh_from_db()
    assert slr.servings == 8
    assert {e.amount for e in _entries(slr)} == {Decimal(2)}


def test_edit_without_new_servings_leaves_the_amounts_alone(u1_s1, space_1, recipe_1_s1):
    slr = _created(u1_s1, space_1, recipe_1_s1)._shopping_list_recipe
    assert _open(u1_s1, space_1, recipe_1_s1, slr).edit() is True
    assert {e.amount for e in _entries(slr)} == {Decimal(1)}
    assert _entries(slr).count() == 10


def test_edit_keeps_the_entries_of_the_given_ingredients_and_adds_new_ones(u1_s1, space_1, recipe_1_s1):
    a, b, c, d = _ingredient_ids(recipe_1_s1)[:4]
    slr = _created(u1_s1, space_1, recipe_1_s1, {'ingredients': [a, b, c]})._shopping_list_recipe
    kept = {e.ingredient_id: e.id for e in _entries(slr)}

    assert _open(u1_s1, space_1, recipe_1_s1, slr).edit(ingredients=[b, c, d]) is True

    now = {e.ingredient_id: e.id for e in _entries(slr)}
    assert sorted(now) == sorted([b, c, d])
    assert now[b] == kept[b] and now[c] == kept[c]  # the entries that stay are not made again


def test_edit_does_not_add_an_ingredient_twice(u1_s1, space_1, recipe_1_s1):
    ids = _ingredient_ids(recipe_1_s1)
    slr = _created(u1_s1, space_1, recipe_1_s1)._shopping_list_recipe
    _open(u1_s1, space_1, recipe_1_s1, slr).edit(ingredients=ids)
    assert _entries(slr).count() == len(ids)


def test_edit_servings_scales_entries_that_come_from_an_ingredient_and_not_manual_ones(u1_s1, space_1, recipe_1_s1):
    editor = _created(u1_s1, space_1, recipe_1_s1)
    slr = editor._shopping_list_recipe
    food = Ingredient.objects.get(id=_ingredient_ids(recipe_1_s1)[0]).food
    manual = ShoppingListEntry.objects.create(list_recipe=slr, food=food, amount=5, created_by=_user(u1_s1), space=space_1)

    assert _open(u1_s1, space_1, recipe_1_s1, slr).edit_servings(servings=8) is True

    slr.refresh_from_db()
    manual.refresh_from_db()
    assert slr.servings == 8
    assert manual.amount == 5
    assert {e.amount for e in _entries(slr).exclude(id=manual.id)} == {Decimal(2)}


def test_edit_servings_with_the_servings_the_list_has_changes_nothing(u1_s1, space_1, recipe_1_s1):
    slr = _created(u1_s1, space_1, recipe_1_s1)._shopping_list_recipe
    assert _open(u1_s1, space_1, recipe_1_s1, slr).edit_servings(servings=4) is True
    assert {e.amount for e in _entries(slr)} == {Decimal(1)}


def test_edit_servings_needs_servings(u1_s1, space_1):
    with pytest.raises(ValueError, match='servings size'):
        _editor(u1_s1, space_1).edit_servings()


@pytest.mark.parametrize("with_recipe", [True, False])
def test_edit_servings_finds_the_list_by_the_id_it_is_given(with_recipe, u1_s1, space_1, recipe_1_s1):
    """The serializer opens an editor with no list and no recipe, then names the list."""
    slr = _created(u1_s1, space_1, recipe_1_s1)._shopping_list_recipe
    editor = _editor(u1_s1, space_1, **({'recipe': recipe_1_s1} if with_recipe else {}))
    assert editor.edit_servings(servings=8, id=slr.id) is True
    slr.refresh_from_db()
    assert slr.servings == 8
    assert {e.amount for e in _entries(slr)} == {Decimal(2)}


def test_delete_removes_the_list_and_its_entries(u1_s1, space_1, recipe_1_s1):
    slr = _created(u1_s1, space_1, recipe_1_s1)._shopping_list_recipe
    assert _entries(slr).count() == 10

    assert _open(u1_s1, space_1, recipe_1_s1, slr).delete() is True

    assert not ShoppingListRecipe.objects.filter(id=slr.id).exists()
    assert not ShoppingListEntry.objects.filter(list_recipe_id=slr.id).exists()


def test_delete_of_a_list_that_cannot_be_found_reports_failure(u1_s1, space_1):
    assert _editor(u1_s1, space_1, id=123456).delete() is False
