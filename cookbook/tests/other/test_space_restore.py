"""Part 3 of the pantry-expiration-and-data-portability plan: in-app space backup/restore.
See .claude/plans/pantry-expiration-and-data-portability.md.

Sub-phase 3b — the restore engine. v1 ships exactly one mode: restore into a brand-new
space. FK fields on restored rows are remapped to the newly-created objects (built
incrementally as each model's rows are created, walked in the dependency order
discover_space_scoped_models already gives); User fields are re-linked to *existing*
target-instance accounts by username, never recreated. M2M fields (Food.substitute,
RecipeBook.shared, UserSpace.groups) are NOT YET covered by this sub-phase — flagged, not
silently dropped.
"""
import pytest
from django.contrib import auth
from django_scopes import scopes_disabled

from cookbook.helper.space_backup import build_space_backup
from cookbook.helper.space_restore import assert_target_space_is_empty, preview_restore, restore_space_backup
from cookbook.helper.permission_helper import create_space_for_user
from cookbook.models import Food, Recipe, RecipeBook, RecipeBookEntry, Space, UserSpace
from cookbook.tests.factories import FoodFactory, RecipeBookFactory, RecipeFactory


@pytest.mark.django_db
def test_assert_target_space_is_empty_passes_for_freshly_created_space(u1_s1):
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        space = create_space_for_user(user).space
        assert_target_space_is_empty(space)  # must not raise


@pytest.mark.django_db
def test_assert_target_space_is_empty_raises_when_space_has_data(u1_s1):
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        space = create_space_for_user(user).space
        FoodFactory(space=space, name='Intruder')
        with pytest.raises(ValueError):
            assert_target_space_is_empty(space)


@pytest.mark.django_db
def test_assert_target_space_is_empty_raises_when_extra_userspace_exists(u1_s1, u2_s1):
    user = auth.get_user(u1_s1)
    other_user = auth.get_user(u2_s1)
    with scopes_disabled():
        space = create_space_for_user(user).space
        UserSpace.objects.create(space=space, user=other_user)
        with pytest.raises(ValueError):
            assert_target_space_is_empty(space)


@pytest.mark.django_db
def test_restore_creates_new_space_and_leaves_original_untouched(u1_s1, space_1):
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        FoodFactory(space=space_1, name='Original Carrot')
        original_food_count = Food.objects.filter(space=space_1).count()
        backup = build_space_backup(space_1)

        new_space, report = restore_space_backup(backup, user)

        assert new_space.pk != space_1.pk
        assert Food.objects.filter(space=space_1).count() == original_food_count
        assert Food.objects.filter(space=new_space, name='Original Carrot').exists()


@pytest.mark.django_db
def test_restore_recreates_food_hierarchy(space_1, u1_s1):
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        parent = FoodFactory(space=space_1, name='Fruit')
        parent.add_child(name='Citrus', space=space_1)
        backup = build_space_backup(space_1)

        new_space, report = restore_space_backup(backup, user)

        new_parent = Food.objects.get(space=new_space, name='Fruit')
        new_child = Food.objects.get(space=new_space, name='Citrus')
        assert new_child.get_parent().pk == new_parent.pk


@pytest.mark.django_db
def test_restore_recreates_fk_relationships_between_restored_objects(space_1, u1_s1):
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        recipe = RecipeFactory(space=space_1, name='Soup')
        book = RecipeBookFactory(space=space_1, name='Favorites')
        RecipeBookEntry.objects.create(recipe=recipe, book=book)
        backup = build_space_backup(space_1)

        new_space, report = restore_space_backup(backup, user)

        new_recipe = Recipe.objects.get(space=new_space, name='Soup')
        new_book = RecipeBook.objects.get(space=new_space, name='Favorites')
        new_entry = RecipeBookEntry.objects.get(book=new_book)
        assert new_entry.recipe_id == new_recipe.pk


@pytest.mark.django_db
def test_restore_relinks_existing_user_by_username(space_1, u1_s1):
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        from cookbook.models import CookLog
        recipe = RecipeFactory(space=space_1, name='Stew')
        CookLog.objects.create(recipe=recipe, created_by=user, space=space_1)
        backup = build_space_backup(space_1)

        new_space, report = restore_space_backup(backup, user)

        new_log = CookLog.objects.filter(space=new_space).first()
        assert new_log is not None
        assert new_log.created_by_id == user.id


@pytest.mark.django_db
def test_restore_reports_unresolved_user_and_skips_the_row(space_1, u1_s1):
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        recipe = RecipeFactory(space=space_1, name='Chili')
        backup = build_space_backup(space_1)
        # simulate a backup referencing a user account that no longer exists on this instance
        backup['users']['999999'] = {'username': 'ghost-user', 'email': 'ghost@example.com'}
        # rewrite the recipe's created_by (or any User FK present) to the fabricated old pk
        # CookLog.created_by is a clean, always-required User FK to exercise the skip path
        backup['models']['CookLog'] = [{
            'model': 'cookbook.cooklog', 'pk': 1,
            'fields': {'recipe': recipe.pk, 'created_by': 999999, 'space': space_1.pk,
                       'servings': 1, 'rating': None, 'comment': '', 'created_at': backup['created_at']},
        }]

        new_space, report = restore_space_backup(backup, user)

        assert 'ghost-user' in report['unresolved_users']
        assert report['models']['CookLog']['created'] == 0
        assert report['models']['CookLog']['skipped'] == 1


@pytest.mark.django_db
def test_restore_rolls_back_on_failure(space_1, u1_s1, monkeypatch):
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        FoodFactory(space=space_1, name='WillFail')
        backup = build_space_backup(space_1)
        space_count_before = Space.objects.count()

        def boom(*args, **kwargs):
            raise RuntimeError('simulated mid-restore failure')

        monkeypatch.setattr('cookbook.helper.space_restore._create_row', boom)

        with pytest.raises(RuntimeError):
            restore_space_backup(backup, user)

        assert Space.objects.count() == space_count_before


@pytest.mark.django_db
def test_preview_restore_is_zero_write_and_reports_model_counts(space_1, u1_s1):
    with scopes_disabled():
        FoodFactory(space=space_1, name='Preview Carrot')
        backup = build_space_backup(space_1)
        space_count_before = Space.objects.count()

        preview = preview_restore(backup)

        assert Space.objects.count() == space_count_before
    assert preview['model_counts']['Food'] == 1


@pytest.mark.django_db
def test_preview_restore_lists_resolved_and_unresolved_users(space_1, u1_s1):
    from cookbook.models import CookLog
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        recipe = RecipeFactory(space=space_1, name='Preview Stew')
        CookLog.objects.create(recipe=recipe, created_by=user, space=space_1)
        backup = build_space_backup(space_1)
        backup['users']['999999'] = {'username': 'ghost-user', 'email': 'ghost@example.com'}

        preview = preview_restore(backup)

    by_username = {u['username']: u for u in preview['users']}
    assert by_username[user.username]['resolved'] is True
    assert by_username['ghost-user']['resolved'] is False
