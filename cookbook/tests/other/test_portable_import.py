"""Part 2 (sub-phase 2b) of the pantry-expiration-and-data-portability plan: import/merge
for the portable Food/Keyword/RecipeBook export built by cookbook.helper.portable_data.

Two entry points:
- analyze_portable_import(export, space): dry-run diff preview, zero DB writes.
- apply_portable_import(export, space, merge_policy=...): commit, returns a result report.

Merge policy applies to MATCHED (already-existing, same-name) foods/keywords only — a food
that doesn't yet exist is always created outright regardless of policy.
"""
import pytest
from django.contrib import auth
from django_scopes import scopes_disabled

from cookbook.helper.portable_data import build_portable_export
from cookbook.helper.portable_import import analyze_portable_import, apply_portable_import
from cookbook.models import (Food, FoodProperty, Keyword, Property, PropertyType, RecipeBook, RecipeBookEntry,
                             SupermarketCategory)
from cookbook.tests.factories import FoodFactory, KeywordFactory, RecipeFactory


def _food_export(name, parent_natural_key=None, **overrides):
    entry = {
        'natural_key': f'{parent_natural_key} > {name}' if parent_natural_key else name,
        'name': name,
        'parent_natural_key': parent_natural_key,
        'description': '',
        'url': '',
        'ignore_shopping': False,
        'substitute_siblings': False,
        'substitute_children': False,
        'shelf_life_days': None,
        'shelf_life_days_frozen': None,
        'shelf_life_days_opened': None,
        'shopping_amount': None,
        'fdc_id': None,
        'open_data_slug': None,
        'supermarket_category': None,
        'substitute': [],
        'properties': [],
        'inherit_fields': [],
        'child_inherit_fields': [],
    }
    entry.update(overrides)
    return entry


def _keyword_export(name, parent_natural_key=None, **overrides):
    entry = {
        'natural_key': f'{parent_natural_key} > {name}' if parent_natural_key else name,
        'name': name,
        'parent_natural_key': parent_natural_key,
        'description': '',
    }
    entry.update(overrides)
    return entry


def _envelope(*, foods=None, keywords=None, books=None, warnings=None):
    return {
        'tandoor_export_format': 'portable-data-v1',
        'exported_at': '2026-01-01T00:00:00',
        'content': {
            'foods': foods or [],
            'keywords': keywords or [],
            'books': books or [],
            'warnings': warnings or [],
        },
    }


# ==================== analyze (dry-run, zero writes) ====================

@pytest.mark.django_db
def test_analyze_classifies_everything_new_into_empty_space(space_1):
    export = _envelope(foods=[_food_export('Carrot')], keywords=[_keyword_export('Vegetable')])
    with scopes_disabled():
        food_count_before = Food.objects.filter(space=space_1).count()
        report = analyze_portable_import(export, space_1)
        food_count_after = Food.objects.filter(space=space_1).count()

    assert food_count_before == food_count_after == 0  # dry-run performs zero writes
    assert report['foods']['new'] == ['Carrot']
    assert report['foods']['matching'] == []
    assert report['keywords']['new'] == ['Vegetable']


@pytest.mark.django_db
def test_analyze_classifies_existing_name_as_matching(space_1):
    with scopes_disabled():
        FoodFactory(space=space_1, name='Carrot')
    export = _envelope(foods=[_food_export('Carrot')])

    with scopes_disabled():
        report = analyze_portable_import(export, space_1)

    assert report['foods']['matching'] == ['Carrot']
    assert report['foods']['new'] == []


@pytest.mark.django_db
def test_analyze_flags_case_insensitive_near_match_separately(space_1):
    with scopes_disabled():
        FoodFactory(space=space_1, name='carrot')
    export = _envelope(foods=[_food_export('Carrot')])

    with scopes_disabled():
        report = analyze_portable_import(export, space_1)

    assert report['foods']['new'] == []
    assert report['foods']['matching'] == []
    assert report['foods']['possible_match'] == ['Carrot']


# ==================== apply (commit) ====================

@pytest.mark.django_db
def test_apply_creates_hierarchy_into_empty_space(space_1):
    export = _envelope(foods=[
        _food_export('Vegetable'),
        _food_export('Carrot', parent_natural_key='Vegetable'),
    ])

    with scopes_disabled():
        apply_portable_import(export, space_1)
        carrot = Food.objects.get(space=space_1, name='Carrot')
        veg = Food.objects.get(space=space_1, name='Vegetable')
        assert carrot.get_parent().id == veg.id


@pytest.mark.django_db
def test_apply_is_idempotent_under_default_fill_gaps_policy(space_1):
    export = _envelope(foods=[_food_export('Carrot', description='root vegetable')])

    with scopes_disabled():
        apply_portable_import(export, space_1)
        apply_portable_import(export, space_1)  # re-run the same import
        count = Food.objects.filter(space=space_1, name='Carrot').count()

    assert count == 1  # no duplicate created on re-import


@pytest.mark.django_db
def test_apply_fill_gaps_only_fills_blank_fields(space_1):
    with scopes_disabled():
        FoodFactory(space=space_1, name='Carrot', description='my own notes', shelf_life_days=None)
    export = _envelope(foods=[_food_export('Carrot', description='imported description', shelf_life_days=7)])

    with scopes_disabled():
        apply_portable_import(export, space_1, merge_policy='fill_gaps')
        carrot = Food.objects.get(space=space_1, name='Carrot')

    assert carrot.description == 'my own notes'  # existing non-blank field untouched
    assert carrot.shelf_life_days == 7  # blank field filled from import


@pytest.mark.django_db
def test_apply_overwrite_replaces_existing_values(space_1):
    with scopes_disabled():
        FoodFactory(space=space_1, name='Carrot', description='my own notes')
    export = _envelope(foods=[_food_export('Carrot', description='imported description')])

    with scopes_disabled():
        apply_portable_import(export, space_1, merge_policy='overwrite')
        carrot = Food.objects.get(space=space_1, name='Carrot')

    assert carrot.description == 'imported description'


@pytest.mark.django_db
def test_apply_skip_leaves_existing_food_untouched(space_1):
    with scopes_disabled():
        FoodFactory(space=space_1, name='Carrot', description='my own notes')
    export = _envelope(foods=[_food_export('Carrot', description='imported description')])

    with scopes_disabled():
        apply_portable_import(export, space_1, merge_policy='skip')
        carrot = Food.objects.get(space=space_1, name='Carrot')

    assert carrot.description == 'my own notes'


@pytest.mark.django_db
def test_apply_skip_does_not_create_orphan_supermarket_category(space_1):
    """_food_extra_fields resolved (and get_or_create'd) the supermarket_category BEFORE
    _apply_field's merge_policy check — so under 'skip' a brand-new SupermarketCategory row
    got persisted even though _apply_field then refused to attach it to anything, violating
    this module's documented 'skip never touches an existing node' contract with orphan
    storage."""
    with scopes_disabled():
        FoodFactory(space=space_1, name='Carrot')
    export = _envelope(foods=[_food_export('Carrot', supermarket_category='Produce')])

    with scopes_disabled():
        apply_portable_import(export, space_1, merge_policy='skip')

        assert not SupermarketCategory.objects.filter(space=space_1, name='Produce').exists()
        assert Food.objects.get(space=space_1, name='Carrot').supermarket_category is None


@pytest.mark.django_db
def test_apply_resolves_substitutes_within_the_batch(space_1):
    export = _envelope(foods=[
        _food_export('Chicken Breast', substitute=['Turkey Breast']),
        _food_export('Turkey Breast'),
    ])

    with scopes_disabled():
        apply_portable_import(export, space_1)
        chicken = Food.objects.get(space=space_1, name='Chicken Breast')
        turkey = Food.objects.get(space=space_1, name='Turkey Breast')
        assert turkey in chicken.substitute.all()


@pytest.mark.django_db
def test_apply_unresolvable_substitute_is_dropped_with_warning_not_hard_failure(space_1):
    export = _envelope(foods=[_food_export('Chicken Breast', substitute=['Nonexistent Food'])])

    with scopes_disabled():
        report = apply_portable_import(export, space_1)
        chicken = Food.objects.get(space=space_1, name='Chicken Breast')
        assert chicken.substitute.count() == 0
    assert any('Nonexistent Food' in w for w in report['warnings'])


@pytest.mark.django_db
def test_apply_book_entries_resolved_by_recipe_name_unresolvable_dropped_with_warning(space_1, u1_s1):
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        recipe = RecipeFactory(space=space_1, name='Sourdough Bread')
    export = _envelope(books=[{
        'name': 'Baking', 'description': '', 'order': 0,
        'entries': ['Sourdough Bread', 'Nonexistent Recipe'],
    }])

    with scopes_disabled():
        report = apply_portable_import(export, space_1, user=user)
        book = RecipeBook.objects.get(space=space_1, name='Baking')
        entries = RecipeBookEntry.objects.filter(book=book)

    assert entries.count() == 1
    assert entries.first().recipe_id == recipe.id
    assert any('Nonexistent Recipe' in w for w in report['warnings'])


@pytest.mark.django_db
def test_apply_returns_created_and_merged_counts(space_1):
    with scopes_disabled():
        FoodFactory(space=space_1, name='Carrot')
    export = _envelope(foods=[_food_export('Carrot'), _food_export('Turnip')])

    with scopes_disabled():
        report = apply_portable_import(export, space_1)

    assert report['foods']['created'] == 1
    assert report['foods']['merged'] == 1


@pytest.mark.django_db
def test_apply_rolls_back_on_mid_import_failure(space_1, monkeypatch):
    """apply_portable_import runs several sequential DB-writing phases (foods, substitutes,
    inherit_fields, properties, keywords, books). Without a transaction wrapper, an
    exception in a later phase leaves earlier phases' writes (e.g. the Food created below)
    committed — a silently half-imported space. Mirrors test_restore_rolls_back_on_failure
    for restore_space_backup."""
    export = _envelope(foods=[_food_export('Carrot')])

    def boom(*args, **kwargs):
        raise RuntimeError('simulated mid-import failure')

    monkeypatch.setattr('cookbook.helper.portable_import._import_books', boom)

    with scopes_disabled():
        with pytest.raises(RuntimeError):
            apply_portable_import(export, space_1)

        assert not Food.objects.filter(space=space_1, name='Carrot').exists()


@pytest.mark.django_db
def test_apply_keyword_hierarchy(space_1):
    export = _envelope(keywords=[
        _keyword_export('Cuisine'),
        _keyword_export('Asian', parent_natural_key='Cuisine'),
    ])

    with scopes_disabled():
        apply_portable_import(export, space_1)
        asian = Keyword.objects.get(space=space_1, name='Asian')
        cuisine = Keyword.objects.get(space=space_1, name='Cuisine')
        assert asian.get_parent().id == cuisine.id


@pytest.mark.django_db
def test_round_trip_food_property_with_null_amount_does_not_crash(space_1, space_2):
    """Property.property_amount is nullable (e.g. the AI-import path explicitly produces
    null amounts). Before the fix, the export wrote str(None) as a literal 'None' string,
    and import's Decimal('None') conversion raised decimal.InvalidOperation, 500ing the
    whole apply."""
    with scopes_disabled():
        food = FoodFactory(space=space_1, name='Carrot')
        ptype = PropertyType.objects.create(space=space_1, name='Calories', unit='kcal')
        prop = Property.objects.create(space=space_1, property_type=ptype, property_amount=None)
        FoodProperty.objects.create(food=food, property=prop)

        export = build_portable_export(space_1)
        apply_portable_import(export, space_2)

        imported_food = Food.objects.get(space=space_2, name='Carrot')
        imported_prop = Property.objects.get(space=space_2, foodproperty__food=imported_food)
        assert imported_prop.property_amount is None


# ==================== round-trip: export a space, import into a fresh one ====================

@pytest.mark.django_db
def test_round_trip_export_then_import_preserves_hierarchy_and_substitutes(space_1, space_2, u1_s1):
    """Export a space with a 3-level food tree, substitutes, and a keyword tree; import into
    an empty space; assert structural equivalence (per the plan's stated verification)."""
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        veg = FoodFactory(space=space_1, name='Vegetable')
        root_veg = FoodFactory(space=space_1, name='Root Vegetable')
        carrot = FoodFactory(space=space_1, name='Carrot')
        root_veg.move(veg, 'first-child')
        carrot = Food.objects.get(id=carrot.id)
        carrot.move(Food.objects.get(id=root_veg.id), 'first-child')
        parsnip = FoodFactory(space=space_1, name='Parsnip')
        Food.objects.get(id=carrot.id).substitute.add(parsnip)

        cuisine = KeywordFactory(space=space_1, name='Cuisine')
        asian = KeywordFactory(space=space_1, name='Asian')
        asian.move(cuisine, 'first-child')

        export = build_portable_export(space_1)
        apply_portable_import(export, space_2, user=user)

        assert Food.objects.filter(space=space_2, name='Carrot').exists()
        imported_carrot = Food.objects.get(space=space_2, name='Carrot')
        imported_root_veg = Food.objects.get(space=space_2, name='Root Vegetable')
        imported_veg = Food.objects.get(space=space_2, name='Vegetable')
        assert imported_carrot.get_parent().id == imported_root_veg.id
        assert imported_root_veg.get_parent().id == imported_veg.id
        assert imported_veg.get_parent() is None
        assert Food.objects.get(space=space_2, name='Parsnip') in imported_carrot.substitute.all()

        imported_asian = Keyword.objects.get(space=space_2, name='Asian')
        imported_cuisine = Keyword.objects.get(space=space_2, name='Cuisine')
        assert imported_asian.get_parent().id == imported_cuisine.id

        # original space is untouched by the import into space_2
        assert Food.objects.filter(space=space_1).count() == 4
        assert Keyword.objects.filter(space=space_1).count() == 2


@pytest.mark.django_db
def test_reimporting_the_same_export_is_idempotent_fill_gaps(space_1, space_2, u1_s1):
    """Re-running the same import a second time under the default fill_gaps policy must not
    produce duplicate foods/keywords."""
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        FoodFactory(space=space_1, name='Carrot', description='root vegetable')
        KeywordFactory(space=space_1, name='Vegetable')
        export = build_portable_export(space_1)

        apply_portable_import(export, space_2, user=user)
        apply_portable_import(export, space_2, user=user)

        assert Food.objects.filter(space=space_2, name='Carrot').count() == 1
        assert Keyword.objects.filter(space=space_2, name='Vegetable').count() == 1
