from unittest.mock import patch

import pytest
from django_scopes import scopes_disabled

from cookbook.helper.inventory_helper import add_food_to_pantry, get_or_create_default_inventory_location
from cookbook.models import InventoryEntry, InventoryLocation
from cookbook.tests.factories import FoodFactory, HouseholdFactory, InventoryLocationFactory, UserFactory


@pytest.mark.django_db
def test_add_food_to_pantry_rolls_back_on_log_failure(space_1):
    """The entry + B_ADD log write atomically — a log failure rolls back the entry."""
    with scopes_disabled():
        household = HouseholdFactory(space=space_1)
        user = UserFactory(space=space_1)
        food = FoodFactory(space=space_1)

        with patch('cookbook.helper.inventory_helper.InventoryLog.objects.create', side_effect=RuntimeError('boom')):
            with pytest.raises(RuntimeError):
                add_food_to_pantry(food, user, space_1, household)

        # the entry must not survive the failed log write
        assert not InventoryEntry.objects.filter(food=food).exists()


@pytest.mark.django_db
def test_returns_existing_location(space_1):
    """When the household already has a location, return it and create nothing."""
    with scopes_disabled():
        household = HouseholdFactory(space=space_1)
        user = UserFactory(space=space_1)
        existing = InventoryLocationFactory(space=space_1, household=household, created_by=user)

        result = get_or_create_default_inventory_location(household, user, space_1)

        assert result == existing
        assert InventoryLocation.objects.filter(household=household).count() == 1


@pytest.mark.django_db
def test_creates_pantry_when_none(space_1):
    """When the household has no location, create a 'Pantry' one for it."""
    with scopes_disabled():
        household = HouseholdFactory(space=space_1)
        user = UserFactory(space=space_1)

        result = get_or_create_default_inventory_location(household, user, space_1)

        assert result.pk is not None
        assert result.name == 'Pantry'
        assert result.household == household
        assert result.space == space_1
        assert result.created_by == user
        assert InventoryLocation.objects.filter(household=household).count() == 1


@pytest.mark.django_db
def test_idempotent_when_none(space_1):
    """Calling twice when none exists creates exactly one location."""
    with scopes_disabled():
        household = HouseholdFactory(space=space_1)
        user = UserFactory(space=space_1)

        first = get_or_create_default_inventory_location(household, user, space_1)
        second = get_or_create_default_inventory_location(household, user, space_1)

        assert first == second
        assert InventoryLocation.objects.filter(household=household).count() == 1


@pytest.mark.django_db
def test_scoped_to_household(space_1):
    """Does not return another household's location."""
    with scopes_disabled():
        household_a = HouseholdFactory(space=space_1)
        household_b = HouseholdFactory(space=space_1)
        user = UserFactory(space=space_1)
        loc_b = InventoryLocationFactory(space=space_1, household=household_b, created_by=user)

        result = get_or_create_default_inventory_location(household_a, user, space_1)

        assert result != loc_b
        assert result.household == household_a


@pytest.mark.django_db
def test_add_food_to_pantry_creates_entry_and_log(space_1):
    """add_food_to_pantry creates one InventoryEntry at the default location + a B_ADD log."""
    from cookbook.helper.inventory_helper import add_food_to_pantry
    from cookbook.models import InventoryEntry, InventoryLog
    from cookbook.tests.factories import FoodFactory

    with scopes_disabled():
        household = HouseholdFactory(space=space_1)
        user = UserFactory(space=space_1)
        food = FoodFactory(space=space_1)

        entry = add_food_to_pantry(food, user, space_1, household)

        assert entry.pk is not None
        assert entry.food == food
        assert entry.amount == 1
        assert entry.inventory_location.household == household
        assert entry.inventory_location.name == 'Pantry'   # auto-created default
        assert entry.code                                  # code assigned like the serializer
        assert InventoryEntry.objects.filter(food=food).count() == 1
        assert InventoryLog.objects.filter(entry=entry, booking_type=InventoryLog.B_ADD).count() == 1


@pytest.mark.django_db
def test_finalize_new_inventory_entry_assigns_code_and_logs(space_1):
    """The shared finalizer (used by BOTH InventoryEntrySerializer.create and add_food_to_pantry)
    assigns a code and writes exactly one B_ADD log — single source of truth."""
    from cookbook.helper.inventory_helper import finalize_new_inventory_entry
    from cookbook.models import InventoryLog
    from cookbook.tests.factories import InventoryEntryFactory

    with scopes_disabled():
        entry = InventoryEntryFactory(space=space_1, amount=3)
        entry.code = None
        entry.save()

        result = finalize_new_inventory_entry(entry)

        assert result is entry
        assert entry.code
        logs = InventoryLog.objects.filter(entry=entry, booking_type=InventoryLog.B_ADD)
        assert logs.count() == 1
        log = logs.first()
        assert log.old_amount == 0
        assert log.new_amount == 3
        assert log.new_inventory_location == entry.inventory_location
        assert log.old_inventory_location == entry.inventory_location
