import pytest
from django.core.management import call_command
from django_scopes import scopes_disabled

from cookbook.models import Household, InventoryEntry, InventoryLocation, UserSpace
from cookbook.tests.factories import FoodFactory, UserFactory


@pytest.fixture
def onhand_food_two_members(space_1):
    """A food on hand for two users who share one household in space_1."""
    with scopes_disabled():
        household = Household.objects.create(name='hh', space=space_1)
        user1 = UserFactory(space=space_1)
        user2 = UserFactory(space=space_1)
        UserSpace.objects.create(user=user1, space=space_1, household=household, active=True)
        UserSpace.objects.create(user=user2, space=space_1, household=household, active=True)
        food = FoodFactory(space=space_1)
        food.onhand_users.add(user1, user2)
    return household, food


@pytest.mark.django_db
def test_migrate_one_entry_per_household(onhand_food_two_members):
    """Two household members on hand for one food -> a single deduped lot for the household."""
    household, food = onhand_food_two_members

    call_command('migrate_onhand_to_inventory')

    with scopes_disabled():
        assert InventoryEntry.objects.filter(
            food=food, inventory_location__household=household, amount__gt=0,
        ).count() == 1


@pytest.mark.django_db
def test_migrate_idempotent(onhand_food_two_members):
    """Re-running the migration creates nothing new."""
    household, food = onhand_food_two_members

    call_command('migrate_onhand_to_inventory')
    call_command('migrate_onhand_to_inventory')

    with scopes_disabled():
        assert InventoryEntry.objects.filter(
            food=food, inventory_location__household=household, amount__gt=0,
        ).count() == 1


@pytest.mark.django_db
def test_migrate_dry_run_writes_nothing(onhand_food_two_members):
    household, food = onhand_food_two_members

    call_command('migrate_onhand_to_inventory', '--dry-run')

    with scopes_disabled():
        assert InventoryEntry.objects.filter(food=food).count() == 0


@pytest.mark.django_db
def test_migrate_autocreates_default_location(onhand_food_two_members):
    """No InventoryLocation for the household -> a default 'Pantry' one is auto-created."""
    household, food = onhand_food_two_members
    with scopes_disabled():
        assert InventoryLocation.objects.filter(household=household).count() == 0

    call_command('migrate_onhand_to_inventory')

    with scopes_disabled():
        assert InventoryLocation.objects.filter(household=household).count() == 1
        entry = InventoryEntry.objects.get(food=food)
        assert entry.inventory_location.household_id == household.id


@pytest.mark.django_db
def test_migrate_skips_user_without_household(space_1):
    """An onhand user whose UserSpace has no household is reported, not silently migrated."""
    with scopes_disabled():
        user = UserFactory(space=space_1)
        UserSpace.objects.create(user=user, space=space_1, household=None, active=True)
        food = FoodFactory(space=space_1)
        food.onhand_users.add(user)

    call_command('migrate_onhand_to_inventory')

    with scopes_disabled():
        assert InventoryEntry.objects.filter(food=food).count() == 0


@pytest.mark.django_db
def test_migrate_separate_households_each_get_a_lot(space_1):
    """A food on hand for users in two different households gets one lot per household."""
    with scopes_disabled():
        hh_a = Household.objects.create(name='a', space=space_1)
        hh_b = Household.objects.create(name='b', space=space_1)
        user_a = UserFactory(space=space_1)
        user_b = UserFactory(space=space_1)
        UserSpace.objects.create(user=user_a, space=space_1, household=hh_a, active=True)
        UserSpace.objects.create(user=user_b, space=space_1, household=hh_b, active=True)
        food = FoodFactory(space=space_1)
        food.onhand_users.add(user_a, user_b)

    call_command('migrate_onhand_to_inventory')

    with scopes_disabled():
        assert InventoryEntry.objects.filter(food=food, inventory_location__household=hh_a, amount__gt=0).count() == 1
        assert InventoryEntry.objects.filter(food=food, inventory_location__household=hh_b, amount__gt=0).count() == 1
