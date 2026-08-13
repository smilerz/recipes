"""Part 3 of the pantry-expiration-and-data-portability plan: in-app space backup/restore.
See .claude/plans/pantry-expiration-and-data-portability.md.

Sub-phase 3a — model auto-discovery (generic FK-graph walk from Space, so a new
space-scoped model added later is picked up automatically, no code change here) and the
backup-build engine. Restore/import logic is a separate sub-phase built on top of this.
"""
import pytest
from django_scopes import scopes_disabled

from cookbook.helper.space_backup import build_space_backup, discover_space_scoped_models
from cookbook.models import Food, Recipe, RecipeBook, Space
from cookbook.tests.factories import FoodFactory, KeywordFactory, RecipeBookFactory, RecipeFactory


def test_discover_space_scoped_models_includes_known_models():
    discovered = discover_space_scoped_models()
    names = {model.__name__ for model, _path in discovered}
    for expected in ('Food', 'Keyword', 'Recipe', 'RecipeBook', 'MealPlan', 'ShoppingListEntry',
                     'InventoryEntry', 'CookLog', 'Household', 'UserSpace'):
        assert expected in names, f'{expected} should be discovered as space-scoped'


def test_discover_space_scoped_models_excludes_global_lookup_tables():
    discovered = discover_space_scoped_models()
    names = {model.__name__ for model, _path in discovered}
    assert 'FoodInheritField' not in names
    assert 'SearchFields' not in names


def test_discover_space_scoped_models_excludes_user_preference():
    # UserPreference only reaches Space via an optional default_meal_type FK — it's the
    # user's own cross-space settings, not this space's data. See _EXCLUDED_MODELS.
    discovered = discover_space_scoped_models()
    names = {model.__name__ for model, _path in discovered}
    assert 'UserPreference' not in names
    assert 'SearchPreference' not in names
    assert 'Space' not in names
    assert 'SpaceBackup' not in names


def test_discover_space_scoped_models_orders_dependencies_before_dependents():
    discovered = discover_space_scoped_models()
    index = {model: i for i, (model, _path) in enumerate(discovered)}
    # Ingredient FKs to both Food and Step; both must be created first.
    from cookbook.models import Ingredient, Step
    assert index[Food] < index[Ingredient]
    assert index[Step] < index[Ingredient]
    # RecipeBookEntry FKs to Recipe and RecipeBook.
    from cookbook.models import RecipeBookEntry
    assert index[Recipe] < index[RecipeBookEntry]
    assert index[RecipeBook] < index[RecipeBookEntry]


def test_discover_space_scoped_models_returns_a_usable_space_lookup_path():
    discovered = dict((model.__name__, path) for model, path in discover_space_scoped_models())
    assert discovered['Food'] == 'space'
    # Ingredient reaches space only indirectly, through food or step.
    with scopes_disabled():
        space = Space.objects.create(name='path-check-space')
        food = FoodFactory(space=space, name='PathCheckFood')
    lookup = {discovered['Food']: space}
    with scopes_disabled():
        assert Food.objects.filter(**lookup).first() == food


@pytest.mark.django_db
def test_build_space_backup_format(space_1):
    with scopes_disabled():
        backup = build_space_backup(space_1)
    assert backup['tandoor_backup_format'] == 'space-backup-v1'
    assert 'created_at' in backup
    assert backup['space_name'] == space_1.name
    assert 'models' in backup
    assert 'users' in backup


@pytest.mark.django_db
def test_build_space_backup_records_referenced_users(space_1, u1_s1):
    from django.contrib import auth
    from cookbook.models import CookLog

    user = auth.get_user(u1_s1)
    with scopes_disabled():
        recipe = RecipeFactory(space=space_1, name='Referenced-user recipe')
        CookLog.objects.create(recipe=recipe, created_by=user, space=space_1)
        backup = build_space_backup(space_1)

    assert backup['users'][str(user.pk)]['username'] == user.username


@pytest.mark.django_db
def test_build_space_backup_includes_data_only_from_target_space(space_1, space_2):
    with scopes_disabled():
        FoodFactory(space=space_1, name='InSpace1')
        FoodFactory(space=space_2, name='InSpace2')
        backup = build_space_backup(space_1)

    food_rows = backup['models']['Food']
    names = {row['fields']['name'] for row in food_rows}
    assert names == {'InSpace1'}


@pytest.mark.django_db
def test_build_space_backup_covers_recipe_and_hierarchy(space_1):
    with scopes_disabled():
        parent = KeywordFactory(space=space_1, name='Parent')
        KeywordFactory(space=space_1, name='Child')
        parent.add_child(name='ChildOfParent', space=space_1)
        RecipeFactory(space=space_1, name='Test Recipe')
        RecipeBookFactory(space=space_1, name='Test Book')
        backup = build_space_backup(space_1)

    assert len(backup['models']['Keyword']) >= 3
    recipe_names = {row['fields']['name'] for row in backup['models']['Recipe']}
    assert 'Test Recipe' in recipe_names
    book_names = {row['fields']['name'] for row in backup['models']['RecipeBook']}
    assert 'Test Book' in book_names


@pytest.mark.django_db
def test_build_space_backup_zero_writes(space_1):
    with scopes_disabled():
        FoodFactory(space=space_1, name='Untouched')
        before = Food.objects.filter(space=space_1).count()
        build_space_backup(space_1)
        after = Food.objects.filter(space=space_1).count()
    assert before == after == 1
