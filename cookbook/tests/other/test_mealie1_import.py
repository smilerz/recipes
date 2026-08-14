"""Regression coverage for Mealie1.get_recipe_from_file's foods-import loop.

No prior test coverage existed for this integration. These tests build the minimal
valid mealie_database.json structure needed to exercise the on-hand/pantry branch
specifically (all recipe-related keys are present but empty — the foods loop runs
independently of them).
"""
import io
import json
import zipfile

import pytest
from django.contrib import auth
from django_scopes import scope, scopes_disabled

from cookbook.integration.mealie1 import Mealie1
from cookbook.models import Food, Household, ImportLog, InventoryEntry, UserSpace


def _make_mealie_zip(foods):
    database = {
        'categories': [], 'tags': [], 'multi_purpose_labels': [],
        'ingredient_foods': foods, 'ingredient_units': [],
        'recipes': [], 'recipe_instructions': [], 'notes': [],
        'recipes_ingredients': [], 'recipe_ingredient_ref_link': [],
        'recipes_to_categories': [], 'recipes_to_tags': [],
        'recipe_nutrition': [], 'recipe_comments': [], 'recipe_timeline_events': [],
        'group_meal_plans': [], 'shopping_list_items': [],
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as zf:
        zf.writestr('database.json', json.dumps(database))
    buf.seek(0)
    return zipfile.ZipFile(buf)


def _run_import(space, user, foods):
    request = type('R', (), {})()
    request.space = space
    request.user = user
    with scope(space=space):
        request.user_space = UserSpace.objects.get(user=user, space=space)
        integration = Mealie1(request, 'MEALIE1')
        il = ImportLog.objects.create(type='MEALIE1', space=space, created_by=user, keyword=integration.keyword)
        integration.import_log = il
        integration.import_duplicates = False
        integration.nutrition_per_serving = False
        integration.get_recipe_from_file(_make_mealie_zip(foods))
        return integration


@pytest.mark.django_db
def test_onhand_food_added_to_pantry_when_household_exists(space_1, u1_s1):
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        household = Household.objects.create(name='Home', space=space_1)
        UserSpace.objects.filter(user=user, space=space_1).update(household=household)

        _run_import(space_1, user, [
            {'id': 'f1', 'name': 'Flour', 'plural_name': 'Flour', 'description': '', 'label_id': None, 'on_hand': True},
        ])

        food = Food.objects.get(name='Flour', space=space_1)
        assert InventoryEntry.objects.filter(food=food).exists()


@pytest.mark.django_db
def test_onhand_food_silently_dropped_logs_a_warning_without_household(space_1, u1_s1):
    """The food must still be created, but the on-hand state is unrecoverable without a
    household — the user must be told, not left silently guessing why it's missing."""
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        UserSpace.objects.filter(user=user, space=space_1).update(household=None)

        integration = _run_import(space_1, user, [
            {'id': 'f1', 'name': 'Sugar', 'plural_name': 'Sugar', 'description': '', 'label_id': None, 'on_hand': True},
        ])

        food = Food.objects.get(name='Sugar', space=space_1)
        assert not InventoryEntry.objects.filter(food=food).exists()
        assert 'Sugar' in integration.import_log.msg
        assert 'household' in integration.import_log.msg.lower()


@pytest.mark.django_db
def test_offhand_food_no_warning(space_1, u1_s1):
    """A food with on_hand=False never needed a household — no warning should appear."""
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        UserSpace.objects.filter(user=user, space=space_1).update(household=None)

        integration = _run_import(space_1, user, [
            {'id': 'f1', 'name': 'Pepper', 'plural_name': 'Pepper', 'description': '', 'label_id': None, 'on_hand': False},
        ])

        assert 'household' not in integration.import_log.msg.lower()
