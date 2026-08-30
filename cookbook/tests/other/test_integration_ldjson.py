"""Part 4 of the pantry-expiration-and-data-portability plan: JSON-LD bulk export.

Per direct user correction: this is a manual, one-way bulk export format for external
tools (schema.org Recipe JSON-LD), NOT automatic SEO/page markup, and NOT usable to
restore or migrate data (see Part 3's Backup feature for that).
"""
import json
from decimal import Decimal

import pytest
from django.contrib import auth
from django_scopes import scope, scopes_disabled

from cookbook.integration.ldjson import LdJson, format_iso8601_duration, flatten_ingredient
from cookbook.models import ExportLog, Ingredient, NutritionInformation, Unit
from cookbook.tests.factories import FoodFactory, RecipeFactory


def _integration(space, user):
    request = type('R', (), {})()
    request.space = space
    request.user = user
    request.COOKIES = {}

    def build_absolute_uri(path):
        return f'https://example.test{path}'
    request.build_absolute_uri = build_absolute_uri

    integration = LdJson.__new__(LdJson)
    integration.request = request
    integration.ignored_recipes = []
    return integration


@pytest.mark.parametrize("minutes,expected", [
    (0, None),
    (None, None),
    (30, 'PT30M'),
    (60, 'PT1H'),
    (90, 'PT1H30M'),
    (125, 'PT2H5M'),
])
def test_format_iso8601_duration(minutes, expected):
    assert format_iso8601_duration(minutes) == expected


@pytest.mark.django_db
def test_flatten_ingredient_combines_amount_unit_food(space_1):
    with scopes_disabled():
        unit = Unit.objects.create(name='cup', space=space_1)
        food = FoodFactory(space=space_1, name='flour')
        ingredient = Ingredient.objects.create(amount=Decimal('2'), unit=unit, food=food, space=space_1)
        assert flatten_ingredient(ingredient) == '2 cup flour'


@pytest.mark.django_db
def test_flatten_ingredient_strips_trailing_decimal_zeros(space_1):
    with scopes_disabled():
        food = FoodFactory(space=space_1, name='salt')
        ingredient = Ingredient.objects.create(amount=Decimal('1.5000000000000000'), food=food, space=space_1)
        assert flatten_ingredient(ingredient) == '1.5 salt'


@pytest.mark.django_db
def test_flatten_ingredient_includes_note(space_1):
    with scopes_disabled():
        food = FoodFactory(space=space_1, name='butter')
        ingredient = Ingredient.objects.create(amount=Decimal('1'), food=food, note='softened', space=space_1)
        assert flatten_ingredient(ingredient) == '1 butter (softened)'


@pytest.mark.django_db
def test_ldjson_export_produces_valid_schema_structure(space_1, u1_s1):
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        recipe = RecipeFactory(space=space_1, name='LDJSON Recipe', description='A test recipe',
                               servings=4, servings_text='', keywords__count=0,
                               steps__count=1, internal=True)
        integration = _integration(space_1, user)

        with scope(space=space_1):
            el = ExportLog.objects.create(type='LDJSON', created_by=user, space=space_1)
            files = integration.get_files_from_recipes([recipe], el, {})

    assert len(files) == 1
    filename, content = files[0]
    assert filename == f'{recipe.pk}.jsonld'
    data = json.loads(content)
    assert data['@context'] == 'https://schema.org'
    assert data['@type'] == 'Recipe'
    assert data['name'] == 'LDJSON Recipe'
    assert data['description'] == 'A test recipe'
    assert len(data['recipeIngredient']) > 0
    assert len(data['recipeInstructions']) == 1
    assert data['recipeInstructions'][0]['@type'] == 'HowToStep'


@pytest.mark.django_db
def test_ldjson_export_maps_durations(space_1, u1_s1):
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        recipe = RecipeFactory(space=space_1, name='Duration Recipe', keywords__count=0, steps__count=0,
                               working_time=30, waiting_time=90, internal=True)
        integration = _integration(space_1, user)

        with scope(space=space_1):
            el = ExportLog.objects.create(type='LDJSON', created_by=user, space=space_1)
            files = integration.get_files_from_recipes([recipe], el, {})

    data = json.loads(files[0][1])
    assert data['prepTime'] == 'PT30M'
    assert data['cookTime'] == 'PT1H30M'
    assert data['totalTime'] == 'PT2H'


@pytest.mark.django_db
def test_ldjson_export_omits_zero_durations(space_1, u1_s1):
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        recipe = RecipeFactory(space=space_1, name='No Duration Recipe', keywords__count=0, steps__count=0,
                               working_time=0, waiting_time=0, internal=True)
        integration = _integration(space_1, user)

        with scope(space=space_1):
            el = ExportLog.objects.create(type='LDJSON', created_by=user, space=space_1)
            files = integration.get_files_from_recipes([recipe], el, {})

    data = json.loads(files[0][1])
    assert 'prepTime' not in data
    assert 'cookTime' not in data
    assert 'totalTime' not in data


@pytest.mark.django_db
def test_ldjson_export_maps_nutrition(space_1, u1_s1):
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        nutrition = NutritionInformation.objects.create(
            space=space_1, calories=Decimal('250'), fats=Decimal('10'),
            carbohydrates=Decimal('30'), proteins=Decimal('5'),
        )
        recipe = RecipeFactory(space=space_1, name='Nutrition Recipe', keywords__count=0, steps__count=0,
                               nutrition=nutrition, internal=True)
        integration = _integration(space_1, user)

        with scope(space=space_1):
            el = ExportLog.objects.create(type='LDJSON', created_by=user, space=space_1)
            files = integration.get_files_from_recipes([recipe], el, {})

    data = json.loads(files[0][1])
    assert data['nutrition']['@type'] == 'NutritionInformation'
    assert data['nutrition']['calories'] == '250 cal'
    assert data['nutrition']['fatContent'] == '10 g'


@pytest.mark.django_db
def test_ldjson_export_maps_keywords(space_1, u1_s1):
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        recipe = RecipeFactory(space=space_1, name='Keyword Recipe', keywords__count=2, steps__count=0, internal=True)
        keyword_names = list(recipe.keywords.values_list('name', flat=True))
        integration = _integration(space_1, user)

        with scope(space=space_1):
            el = ExportLog.objects.create(type='LDJSON', created_by=user, space=space_1)
            files = integration.get_files_from_recipes([recipe], el, {})

    data = json.loads(files[0][1])
    assert set(data['recipeCategory']) == set(keyword_names)


@pytest.mark.django_db
def test_ldjson_export_excludes_private_and_internal_fields(space_1, u1_s1):
    """source_url points elsewhere (not this exported file, per the plan); created_by,
    internal, and other Tandoor-internal bookkeeping fields must never leak into the
    schema.org-mapped output."""
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        recipe = RecipeFactory(space=space_1, name='Private Fields Recipe', keywords__count=0, steps__count=0,
                               internal=True)
        recipe.source_url = 'https://example.com/should-not-appear'
        recipe.save()
        integration = _integration(space_1, user)

        with scope(space=space_1):
            el = ExportLog.objects.create(type='LDJSON', created_by=user, space=space_1)
            files = integration.get_files_from_recipes([recipe], el, {})

    raw_content = files[0][1]
    assert 'should-not-appear' not in raw_content
    assert 'source_url' not in raw_content
    assert 'created_by' not in raw_content
    assert 'internal' not in raw_content
    data = json.loads(raw_content)
    allowed_keys = {'@context', '@type', 'name', 'description', 'image', 'recipeIngredient',
                    'recipeInstructions', 'prepTime', 'cookTime', 'totalTime', 'recipeYield',
                    'nutrition', 'keywords', 'recipeCategory'}
    assert set(data.keys()) <= allowed_keys


@pytest.mark.django_db
def test_ldjson_export_multiple_recipes_each_produce_a_valid_file(space_1, u1_s1):
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        recipe_a = RecipeFactory(space=space_1, name='Recipe A', keywords__count=0, steps__count=0, internal=True)
        recipe_b = RecipeFactory(space=space_1, name='Recipe B', keywords__count=0, steps__count=0, internal=True)
        integration = _integration(space_1, user)

        with scope(space=space_1):
            el = ExportLog.objects.create(type='LDJSON', created_by=user, space=space_1)
            files = integration.get_files_from_recipes([recipe_a, recipe_b], el, {})

    assert len(files) == 2
    names = {f[0] for f in files}
    assert names == {f'{recipe_a.pk}.jsonld', f'{recipe_b.pk}.jsonld'}
    for _filename, content in files:
        data = json.loads(content)
        assert data['@type'] == 'Recipe'


@pytest.mark.django_db
def test_ldjson_do_import_raises_not_implemented(space_1, u1_s1):
    user = auth.get_user(u1_s1)
    integration = _integration(space_1, user)
    with pytest.raises(NotImplementedError):
        integration.do_import([], None, False)
