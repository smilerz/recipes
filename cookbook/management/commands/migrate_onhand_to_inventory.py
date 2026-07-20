"""
One-time migration: convert Food.onhand_users entries to InventoryEntry records.

onhand was per-user; the pantry is household-shared, so this creates ONE lot (amount=1, no unit)
per food per household — deduping the per-user relation — at the household's default location (a
"Pantry" location is auto-created if the household has none, so no data is silently dropped). Idempotent:
a food already stocked in a household is left alone, so re-runs are safe. onhand users with no household
in the food's space cannot be placed in the household-scoped pantry and are reported (not silently lost).

Usage:
    conda run -n tandoor python manage.py migrate_onhand_to_inventory
    conda run -n tandoor python manage.py migrate_onhand_to_inventory --dry-run
"""
from django.core.management.base import BaseCommand
from django_scopes import scopes_disabled

from cookbook.helper.inventory_helper import add_food_to_pantry
from cookbook.models import Food, InventoryEntry, UserSpace


class Command(BaseCommand):
    help = 'Migrate Food.onhand_users to InventoryEntry records (one lot per food per household)'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Show what would be created without writing')

    def handle(self, *args, **options):
        dry_run = options['dry_run']

        created = 0
        skipped_exists = 0
        skipped_no_household = 0

        with scopes_disabled():
            foods = Food.objects.filter(onhand_users__isnull=False).distinct().select_related('space')

            for food in foods:
                onhand_users = list(food.onhand_users.all())
                user_spaces = {
                    us.user_id: us
                    for us in UserSpace.objects.filter(user__in=onhand_users, space=food.space)
                }

                # collapse the per-user relation to one representative user per household
                household_user = {}
                for user in onhand_users:
                    us = user_spaces.get(user.id)
                    household = us.household if us else None
                    if household is None:
                        skipped_no_household += 1
                        if dry_run:
                            self.stdout.write(f'  SKIP (no household): {food.name} for {user.username}')
                        continue
                    household_user.setdefault(household.id, (household, user))

                for household, user in household_user.values():
                    already_stocked = InventoryEntry.objects.filter(
                        food=food, inventory_location__household=household, amount__gt=0,
                    ).exists()
                    if already_stocked:
                        skipped_exists += 1
                        if dry_run:
                            self.stdout.write(f'  SKIP (exists): {food.name} in household {household.name}')
                        continue

                    if dry_run:
                        self.stdout.write(f'  CREATE: {food.name} -> household {household.name}')
                    else:
                        add_food_to_pantry(food, user, food.space, household, amount=1)
                    created += 1

        prefix = '[DRY RUN] ' if dry_run else ''
        self.stdout.write(self.style.SUCCESS(
            f'{prefix}Done: {created} lots created, '
            f'{skipped_exists} skipped (already stocked), '
            f'{skipped_no_household} skipped (user has no household)'
        ))
