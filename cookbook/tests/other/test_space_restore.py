"""Part 3 of the pantry-expiration-and-data-portability plan: in-app space backup/restore.
See .claude/plans/pantry-expiration-and-data-portability.md.

Sub-phase 3b — the restore engine. v1 ships exactly one mode: restore into a brand-new
space. FK fields on restored rows are remapped to the newly-created objects (built
incrementally as each model's rows are created, walked in the dependency order
discover_space_scoped_models already gives); User fields are re-linked to *existing*
target-instance accounts by username, never recreated. M2M fields (Food.substitute,
RecipeBook.shared, UserSpace.groups, Food.inherit_fields) resolve in a second pass —
Group/FoodInheritField specifically by natural key (name/field), never by raw pk, since
the real use case is moving a space to a *different* Tandoor instance or disaster
recovery, not staying on the one instance where pks would happen to still line up.
"""
import pytest
from django.contrib import auth
from django.contrib.auth.models import Group
from django_scopes import scopes_disabled

from cookbook.helper.space_backup import build_space_backup
from cookbook.helper.space_restore import assert_target_space_is_empty, preview_restore, restore_space_backup
from cookbook.helper.permission_helper import create_space_for_user
from cookbook.models import (CookLog, Food, FoodInheritField, InventoryEntry, InventoryLocation, InviteLink,
                             MealPlan, Recipe, RecipeBook, RecipeBookEntry, Space, UserSpace)
from cookbook.tests.factories import (CookLogFactory, FoodFactory, InventoryEntryFactory, InventoryLocationFactory,
                                      KeywordFactory, MealPlanFactory, RecipeBookFactory, RecipeFactory,
                                      ShoppingListEntryFactory)


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


@pytest.mark.django_db
def test_restore_recreates_food_substitute_m2m(space_1, u1_s1):
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        lime = FoodFactory(space=space_1, name='Lime')
        lemon = FoodFactory(space=space_1, name='Lemon')
        lime.substitute.add(lemon)
        backup = build_space_backup(space_1)

        new_space, report = restore_space_backup(backup, user)

        new_lime = Food.objects.get(space=new_space, name='Lime')
        new_lemon = Food.objects.get(space=new_space, name='Lemon')
        assert new_lemon in new_lime.substitute.all()


@pytest.mark.django_db
def test_restore_recreates_recipe_book_shared_users(space_1, u1_s1, u2_s1):
    user = auth.get_user(u1_s1)
    other_user = auth.get_user(u2_s1)
    with scopes_disabled():
        book = RecipeBookFactory(space=space_1, name='Shared Book')
        book.shared.add(other_user)
        backup = build_space_backup(space_1)

        new_space, report = restore_space_backup(backup, user)

        new_book = RecipeBook.objects.get(space=new_space, name='Shared Book')
        assert other_user in new_book.shared.all()


@pytest.mark.django_db
def test_restore_recreates_food_inherit_fields_m2m(space_1, u1_s1):
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        inherit_field, _ = FoodInheritField.objects.get_or_create(field='name', defaults={'name': 'Name'})
        food = FoodFactory(space=space_1, name='InheritTest')
        food.inherit_fields.add(inherit_field)
        backup = build_space_backup(space_1)

        new_space, report = restore_space_backup(backup, user)

        new_food = Food.objects.get(space=new_space, name='InheritTest')
        assert inherit_field in new_food.inherit_fields.all()


@pytest.mark.django_db
def test_restore_recreates_userspace_groups_for_other_members(space_1, u1_s1, u2_s1):
    user = auth.get_user(u1_s1)
    other_user = auth.get_user(u2_s1)
    with scopes_disabled():
        other_userspace = UserSpace.objects.get(user=other_user, space=space_1)
        other_userspace.groups.add(Group.objects.get(name='guest'))
        backup = build_space_backup(space_1)

        new_space, report = restore_space_backup(backup, user)

        new_userspace = UserSpace.objects.get(user=other_user, space=new_space)
        assert 'guest' in new_userspace.groups.values_list('name', flat=True)


@pytest.mark.django_db
def test_restore_recreates_invite_link_group_fk(space_1, u1_s1):
    """InviteLink.group is a required FK to the global Group model — not a restored
    space-scoped model, so it isn't in pk_maps, and not User, so it must be resolved via
    global_ref_map (the same mechanism the M2M pass already uses for Group). Before the
    fix, this FK fell through to the "keep original pk" branch and
    InviteLink.objects.create(group=<int>) raised ValueError, crashing the whole restore."""
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        InviteLink.objects.create(group=Group.objects.get(name='guest'), created_by=user, space=space_1)
        backup = build_space_backup(space_1)

        new_space, report = restore_space_backup(backup, user)

        new_link = InviteLink.objects.get(space=new_space)
        assert new_link.group.name == 'guest'


@pytest.mark.django_db
def test_restore_resolves_group_by_name_even_when_pk_does_not_match_target_instance(space_1, u1_s1, u2_s1):
    """The real use case for backup/restore is moving a space to a different instance, or
    disaster recovery — not staying on the same instance. Group/FoodInheritField pks are
    NOT guaranteed to line up between source and target instances (they're seeded via a
    migration's bulk_create — the same order on a from-scratch instance, but nothing
    actually guarantees that across every real-world instance history). The backup must
    carry the natural key (name) and restore must resolve by it, never by blindly reusing
    the old pk."""
    user = auth.get_user(u1_s1)
    other_user = auth.get_user(u2_s1)
    with scopes_disabled():
        other_userspace = UserSpace.objects.get(user=other_user, space=space_1)
        other_userspace.groups.add(Group.objects.get(name='guest'))
        backup = build_space_backup(space_1)

        # Simulate a target instance where this pk means something else entirely (or
        # nothing at all) — corrupt the recorded pk while leaving global_refs' natural-key
        # record of what it meant on the source instance intact.
        real_guest_pk = Group.objects.get(name='guest').pk
        bogus_pk = real_guest_pk + 9000
        for row in backup['models']['UserSpace']:
            groups = row['fields'].get('groups', [])
            if real_guest_pk in groups:
                row['fields']['groups'] = [bogus_pk if v == real_guest_pk else v for v in groups]
        backup['global_refs']['Group'][str(bogus_pk)] = backup['global_refs']['Group'].pop(str(real_guest_pk))

        new_space, report = restore_space_backup(backup, user)

        new_userspace = UserSpace.objects.get(user=other_user, space=new_space)
        assert 'guest' in new_userspace.groups.values_list('name', flat=True)


@pytest.mark.django_db
def test_restore_resolves_food_inherit_field_by_field_name_even_when_pk_mismatched(space_1, u1_s1):
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        inherit_field, _ = FoodInheritField.objects.get_or_create(field='name', defaults={'name': 'Name'})
        food = FoodFactory(space=space_1, name='PkMismatchTest')
        food.inherit_fields.add(inherit_field)
        backup = build_space_backup(space_1)

        real_pk = inherit_field.pk
        bogus_pk = real_pk + 9000
        for row in backup['models']['Food']:
            fields = row['fields'].get('inherit_fields', [])
            if real_pk in fields:
                row['fields']['inherit_fields'] = [bogus_pk if v == real_pk else v for v in fields]
        backup['global_refs']['FoodInheritField'][str(bogus_pk)] = backup['global_refs']['FoodInheritField'].pop(str(real_pk))

        new_space, report = restore_space_backup(backup, user)

        new_food = Food.objects.get(space=new_space, name='PkMismatchTest')
        assert inherit_field in new_food.inherit_fields.all()


@pytest.mark.django_db
def test_restore_reuses_existing_userspace_for_restoring_admin_and_merges_groups(space_1, u1_s1):
    """The person doing a restore is typically also a member of the original space —
    create_space_for_user already auto-created their UserSpace (with the 'admin' group,
    since they're the one creating the space). Restoring their own backed-up UserSpace row
    must not create a duplicate, and must never strip that auto-attached 'admin' group even
    if their original UserSpace happened to have a different group."""
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        original_userspace = UserSpace.objects.get(user=user, space=space_1)
        original_userspace.groups.set([Group.objects.get(name='user')])
        backup = build_space_backup(space_1)

        new_space, report = restore_space_backup(backup, user)

        matches = UserSpace.objects.filter(user=user, space=new_space)
        assert matches.count() == 1
        groups = set(matches.first().groups.values_list('name', flat=True))
        assert 'admin' in groups
        assert 'user' in groups


@pytest.mark.django_db
def test_restore_full_space_round_trip(space_1, u1_s1, u2_s1):
    """Every targeted test above proves one relationship at a time. This is the actual
    real-world shape of a backup: a broad, interconnected set of data across most of the
    models restore touches, backed up and restored in one shot, verified as a whole —
    including that nothing was silently skipped anywhere in the process."""
    user = auth.get_user(u1_s1)
    other_user = auth.get_user(u2_s1)
    with scopes_disabled():
        # Food hierarchy + substitute
        fruit = FoodFactory(space=space_1, name='RT Fruit')
        fruit.add_child(name='RT Citrus', space=space_1)
        lime = FoodFactory(space=space_1, name='RT Lime')
        lemon = FoodFactory(space=space_1, name='RT Lemon')
        lime.substitute.add(lemon)

        # Keyword hierarchy
        veg = KeywordFactory(space=space_1, name='RT Veg')
        veg.add_child(name='RT Root Veg', space=space_1)

        # Recipe with steps, RecipeBook with entry + sharing
        recipe = RecipeFactory(space=space_1, name='RT Recipe', keywords__count=0,
                               steps__count=2, steps__ingredients__count=1)
        book = RecipeBookFactory(space=space_1, name='RT Book')
        RecipeBookEntry.objects.create(recipe=recipe, book=book)
        book.shared.add(other_user)

        # Meal plan, cook log, shopping list entry — all pointing at the same recipe
        MealPlanFactory(space=space_1, recipe=recipe, created_by=user)
        CookLogFactory(space=space_1, recipe=recipe, created_by=user, rating=5)
        ShoppingListEntryFactory(space=space_1, food=lime, created_by=user)

        # Inventory
        location = InventoryLocationFactory(space=space_1, name='RT Pantry', created_by=user)
        InventoryEntryFactory(space=space_1, food=lime, inventory_location=location, created_by=user, amount=3)

        # Another member's group membership
        other_userspace = UserSpace.objects.get(user=other_user, space=space_1)
        other_userspace.groups.add(Group.objects.get(name='guest'))

        backup = build_space_backup(space_1)

        new_space, report = restore_space_backup(backup, user)

        # Food hierarchy + substitute
        new_fruit = Food.objects.get(space=new_space, name='RT Fruit')
        new_citrus = Food.objects.get(space=new_space, name='RT Citrus')
        assert new_citrus.get_parent().pk == new_fruit.pk
        new_lime = Food.objects.get(space=new_space, name='RT Lime')
        new_lemon = Food.objects.get(space=new_space, name='RT Lemon')
        assert new_lemon in new_lime.substitute.all()

        # Recipe + steps, RecipeBook + entry + sharing
        new_recipe = Recipe.objects.get(space=new_space, name='RT Recipe')
        assert new_recipe.steps.count() == 2
        new_book = RecipeBook.objects.get(space=new_space, name='RT Book')
        assert RecipeBookEntry.objects.filter(book=new_book, recipe=new_recipe).exists()
        assert other_user in new_book.shared.all()

        # Meal plan, cook log
        assert MealPlan.objects.filter(space=new_space, recipe=new_recipe).exists()
        assert CookLog.objects.filter(space=new_space, recipe=new_recipe, rating=5).exists()

        # Inventory
        new_location = InventoryLocation.objects.get(space=new_space, name='RT Pantry')
        assert InventoryEntry.objects.filter(space=new_space, food=new_lime, inventory_location=new_location).exists()

        # Group membership for the other member
        new_other_userspace = UserSpace.objects.get(user=other_user, space=new_space)
        assert 'guest' in new_other_userspace.groups.values_list('name', flat=True)

        # No silent data loss anywhere in the whole restore
        unexpected_skips = {name: counts for name, counts in report['models'].items() if counts['skipped'] > 0}
        assert unexpected_skips == {}
        assert report['unresolved_users'] == []
