"""Part 2 of the pantry-expiration-and-data-portability plan: version-agnostic
Food/Keyword/RecipeBook export. See .claude/plans/pantry-expiration-and-data-portability.md.

Export-only (sub-phase 2a) — natural-key hierarchy serialization + metadata scope.
Import/merge logic is a separate sub-phase built on top of this envelope shape.
"""
import pytest
from django_scopes import scopes_disabled

from cookbook.helper.portable_data import build_portable_export
from cookbook.models import Food, FoodInheritField, FoodProperty, Property, PropertyType, RecipeBookEntry
from cookbook.tests.factories import (FoodFactory, KeywordFactory, RecipeBookFactory, RecipeFactory,
                                      SupermarketCategoryFactory)


@pytest.mark.django_db
def test_export_envelope_format_version(space_1):
    with scopes_disabled():
        export = build_portable_export(space_1)
    assert export['tandoor_export_format'] == 'portable-data-v1'
    assert 'exported_at' in export
    assert export['content']['foods'] == []
    assert export['content']['keywords'] == []
    assert export['content']['books'] == []


@pytest.mark.django_db
def test_export_includes_root_food_and_keyword(space_1):
    with scopes_disabled():
        FoodFactory(space=space_1, name='Carrot', description='orange root vegetable')
        KeywordFactory(space=space_1, name='Vegetable', description='plant food')
        export = build_portable_export(space_1)

    foods = {f['natural_key']: f for f in export['content']['foods']}
    keywords = {k['natural_key']: k for k in export['content']['keywords']}
    assert foods['Carrot']['name'] == 'Carrot'
    assert foods['Carrot']['parent_natural_key'] is None
    assert foods['Carrot']['description'] == 'orange root vegetable'
    assert keywords['Vegetable']['name'] == 'Vegetable'
    assert keywords['Vegetable']['parent_natural_key'] is None


@pytest.mark.django_db
def test_export_food_hierarchy_is_depth_sorted_with_parent_natural_key(space_1):
    with scopes_disabled():
        root = FoodFactory(space=space_1, name='Vegetable')
        child = FoodFactory(space=space_1, name='Root Vegetable')
        grandchild = FoodFactory(space=space_1, name='Carrot')
        child.move(root, 'first-child')
        grandchild = Food.objects.get(id=grandchild.id)
        grandchild.move(Food.objects.get(id=child.id), 'first-child')
        export = build_portable_export(space_1)

    keys_in_order = [f['natural_key'] for f in export['content']['foods']]
    assert keys_in_order == ['Vegetable', 'Vegetable > Root Vegetable', 'Vegetable > Root Vegetable > Carrot']
    by_key = {f['natural_key']: f for f in export['content']['foods']}
    assert by_key['Vegetable']['parent_natural_key'] is None
    assert by_key['Vegetable > Root Vegetable']['parent_natural_key'] == 'Vegetable'
    assert by_key['Vegetable > Root Vegetable > Carrot']['parent_natural_key'] == 'Vegetable > Root Vegetable'


@pytest.mark.django_db
def test_export_food_substitutes_as_natural_keys(space_1):
    with scopes_disabled():
        chicken = FoodFactory(space=space_1, name='Chicken Breast')
        turkey = FoodFactory(space=space_1, name='Turkey Breast')
        chicken.substitute.add(turkey)
        export = build_portable_export(space_1)

    by_key = {f['natural_key']: f for f in export['content']['foods']}
    assert by_key['Chicken Breast']['substitute'] == ['Turkey Breast']


@pytest.mark.django_db
def test_export_food_supermarket_category_by_name(space_1):
    with scopes_disabled():
        cat = SupermarketCategoryFactory(space=space_1, name='Produce')
        FoodFactory(space=space_1, name='Carrot', supermarket_category=cat)
        export = build_portable_export(space_1)

    by_key = {f['natural_key']: f for f in export['content']['foods']}
    assert by_key['Carrot']['supermarket_category'] == 'Produce'


@pytest.mark.django_db
def test_export_food_properties_as_type_and_amount(space_1):
    with scopes_disabled():
        food = FoodFactory(space=space_1, name='Carrot')
        ptype = PropertyType.objects.create(name='Calories', space=space_1, unit='kcal')
        prop = Property.objects.create(property_type=ptype, property_amount=41, space=space_1)
        FoodProperty.objects.create(food=food, property=prop)
        export = build_portable_export(space_1)

    by_key = {f['natural_key']: f for f in export['content']['foods']}
    assert by_key['Carrot']['properties'] == [{'property_type': 'Calories', 'amount': '41.0000'}]


@pytest.mark.django_db
def test_export_food_inherit_fields_as_field_names(space_1):
    with scopes_disabled():
        food = FoodFactory(space=space_1, name='Carrot')
        field = FoodInheritField.objects.filter(field='substitute').first()
        if field:
            food.inherit_fields.add(field)
        export = build_portable_export(space_1)

    by_key = {f['natural_key']: f for f in export['content']['foods']}
    assert by_key['Carrot']['inherit_fields'] == (['substitute'] if field else [])


@pytest.mark.django_db
def test_export_food_shelf_life_and_pantry_fields_are_scalar(space_1):
    with scopes_disabled():
        FoodFactory(space=space_1, name='Chicken', shelf_life_days=2, shelf_life_days_frozen=180,
                    shelf_life_days_opened=1, shopping_amount=1.5, fdc_id=12345)
        export = build_portable_export(space_1)

    by_key = {f['natural_key']: f for f in export['content']['foods']}
    entry = by_key['Chicken']
    assert entry['shelf_life_days'] == 2
    assert entry['shelf_life_days_frozen'] == 180
    assert entry['shelf_life_days_opened'] == 1
    assert entry['fdc_id'] == 12345


@pytest.mark.django_db
def test_export_book_includes_recipe_entries_by_name(space_1):
    with scopes_disabled():
        recipe = RecipeFactory(space=space_1, name='Sourdough Bread')
        book = RecipeBookFactory(space=space_1, name='Baking')
        RecipeBookEntry.objects.create(book=book, recipe=recipe)
        export = build_portable_export(space_1)

    books = {b['name']: b for b in export['content']['books']}
    assert books['Baking']['entries'] == ['Sourdough Bread']


@pytest.mark.django_db
def test_export_book_drops_shared_and_filter_with_warning(space_1, u1_s1, u2_s1):
    from django.contrib import auth
    with scopes_disabled():
        user2 = auth.get_user(u2_s1)
        book = RecipeBookFactory(space=space_1, name='Shared Book')
        book.shared.add(user2)
        export = build_portable_export(space_1)

    books = {b['name']: b for b in export['content']['books']}
    assert 'shared' not in books['Shared Book']
    assert any('shar' in w.lower() for w in export['content']['warnings'])


@pytest.mark.django_db
def test_export_is_scoped_to_space(space_1, space_2):
    with scopes_disabled():
        FoodFactory(space=space_1, name='InSpace1')
        FoodFactory(space=space_2, name='InSpace2')
        export = build_portable_export(space_1)

    names = {f['name'] for f in export['content']['foods']}
    assert names == {'InSpace1'}
