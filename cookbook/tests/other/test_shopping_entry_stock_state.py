import importlib
from datetime import timedelta

import pytest
from django.apps import apps
from django.db import IntegrityError, connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.utils import timezone
from django_scopes import scopes_disabled

from cookbook.helper.inventory_helper import add_food_to_pantry
from cookbook.models import InventoryLog, ShoppingListEntry
from cookbook.tests.factories import FoodFactory, HouseholdFactory, UserFactory

backfill_migration = importlib.import_module('cookbook.migrations.0257_backfill_shopping_entry_stock_state')

NOW = timezone.now()


def _checked_entry(space, user, completed_at, checked=True):
    return ShoppingListEntry.objects.create(food=FoodFactory(space=space), amount=1, checked=checked, completed_at=completed_at,
                                            created_by=user, space=space)


def _pantry_add(space, user, when):
    """One B_ADD InventoryLog in ``space`` stamped at ``when`` (the log's created_at is automatic, so it is moved afterwards)."""
    household = HouseholdFactory(space=space)
    add_food_to_pantry(FoodFactory(space=space), user, space, household)
    InventoryLog.objects.filter(space=space).update(created_at=when)


def _backfill():
    with scopes_disabled():
        backfill_migration.backfill(apps, None)


def _state(entry):
    entry.refresh_from_db()
    return entry.stocked_at, entry.dismissed_at


def test_an_entry_checked_off_before_the_last_pantry_add_is_marked_stocked(space_1):
    with scopes_disabled():
        user = UserFactory(space=space_1)
        completed = NOW - timedelta(days=10)
        entry = _checked_entry(space_1, user, completed)
        _pantry_add(space_1, user, NOW - timedelta(days=5))

        _backfill()

        assert _state(entry) == (completed, None)


def test_an_entry_checked_off_after_the_last_pantry_add_stays_unstocked(space_1):
    with scopes_disabled():
        user = UserFactory(space=space_1)
        _pantry_add(space_1, user, NOW - timedelta(days=5))
        entry = _checked_entry(space_1, user, NOW - timedelta(days=2))

        _backfill()

        assert _state(entry) == (None, None)


def test_an_entry_checked_off_exactly_at_the_last_pantry_add_is_marked_stocked(space_1):
    with scopes_disabled():
        user = UserFactory(space=space_1)
        moment = NOW - timedelta(days=3)
        entry = _checked_entry(space_1, user, moment)
        _pantry_add(space_1, user, moment)

        _backfill()

        assert _state(entry) == (moment, None)


def test_a_checked_entry_without_a_completion_time_is_marked_stocked(space_1):
    with scopes_disabled():
        user = UserFactory(space=space_1)
        _pantry_add(space_1, user, NOW - timedelta(days=5))
        entry = _checked_entry(space_1, user, None)

        _backfill()

        stocked_at, dismissed_at = _state(entry)
        assert stocked_at is not None and dismissed_at is None


def test_a_space_that_never_added_to_the_pantry_has_all_its_checked_entries_marked_stocked(space_1):
    with scopes_disabled():
        user = UserFactory(space=space_1)
        completed = NOW - timedelta(days=1)
        entry = _checked_entry(space_1, user, completed)

        _backfill()

        assert _state(entry) == (completed, None)


def test_another_spaces_pantry_add_does_not_count(space_1, space_2):
    with scopes_disabled():
        user = UserFactory(space=space_1)
        other_user = UserFactory(space=space_2)
        _pantry_add(space_2, other_user, NOW)  # the newest add anywhere, but in the other space
        _pantry_add(space_1, user, NOW - timedelta(days=5))
        entry = _checked_entry(space_1, user, NOW - timedelta(days=2))

        _backfill()

        assert _state(entry) == (None, None)


def test_unchecked_entries_are_never_touched(space_1):
    with scopes_disabled():
        user = UserFactory(space=space_1)
        _pantry_add(space_1, user, NOW)
        entry = _checked_entry(space_1, user, None, checked=False)

        _backfill()

        assert _state(entry) == (None, None)


def test_the_backfill_can_be_reversed(space_1):
    with scopes_disabled():
        user = UserFactory(space=space_1)
        entry = _checked_entry(space_1, user, NOW - timedelta(days=1))
        _backfill()
        assert _state(entry)[0] is not None

        backfill_migration.unbackfill(apps, None)

        assert _state(entry) == (None, None)


def test_an_entry_cannot_be_both_stocked_and_dismissed(space_1):
    with scopes_disabled():
        user = UserFactory(space=space_1)
        entry = _checked_entry(space_1, user, NOW)
        entry.stocked_at = NOW
        entry.dismissed_at = NOW

        with pytest.raises(IntegrityError), transaction.atomic():
            entry.save()


@pytest.mark.django_db(transaction=True)
def test_the_migrations_apply_and_reverse_and_backfill_through_the_real_path(space_1):
    executor = MigrationExecutor(connection)
    before = [('cookbook', '0255_step_recipe_scale')]
    after = [('cookbook', '0257_backfill_shopping_entry_stock_state')]
    try:
        executor.migrate(before)
        old_apps = executor.loader.project_state(before).apps
        Entry = old_apps.get_model('cookbook', 'ShoppingListEntry')
        assert not hasattr(Entry, 'stocked_at')

        executor = MigrationExecutor(connection)
        executor.migrate(after)
        new_apps = executor.loader.project_state(after).apps
        assert hasattr(new_apps.get_model('cookbook', 'ShoppingListEntry'), 'stocked_at')

        executor = MigrationExecutor(connection)
        executor.migrate(before)  # the whole step reverses
        assert not hasattr(executor.loader.project_state(before).apps.get_model('cookbook', 'ShoppingListEntry'), 'stocked_at')
    finally:
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())
