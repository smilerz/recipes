from django.core.management.base import BaseCommand
from django.db import connection
from django.db.migrations.recorder import MigrationRecorder
from django.db.models import Count
from django.utils.translation import gettext_lazy as _
from django_scopes import scopes_disabled

from cookbook.models import RecipeImage

# The RecipeImage introduction was renumbered/renamed and then consolidated into
# this squash (replaces 0247_recipe_image / 0248_backfill / 0249_remove). An
# image built before the squash may have the cookbook_recipeimage table but a
# migration record under a name the squash's `replaces` doesn't cover — so on
# upgrade `migrate` re-runs CreateModel and hits DuplicateTable.
RECIPE_IMAGE_SQUASH = '0247_recipe_image_squashed_0249_remove_recipe_image'


# python manage.py fix_migrations [--dry-run]
#
# PREVIEW-ONLY upgrade reconcile for images built before the migration
# consolidation. Idempotent and safe to re-run. Run it if the container failed
# to start with DuplicateTable, then re-run migrate:
#   docker exec -it <container> python manage.py fix_migrations
class Command(BaseCommand):
    help = _('Preview upgrade reconcile: record the consolidated RecipeImage migration if its table already exists, then dedupe primary images and add the one-primary-per-recipe index.')

    def add_arguments(self, parser):
        parser.add_argument('-d', '--dry-run', help='report actions without applying them', action='store_true')

    def handle(self, *args, **options):
        dry = options['dry_run']

        if 'cookbook_recipeimage' not in connection.introspection.table_names():
            print('cookbook_recipeimage table absent — a normal migrate will create it with the constraint; nothing to reconcile')
            return

        # 1) Consolidation/rename/renumber reconcile: if the table exists but the
        #    squash isn't recorded, record it so migrate won't re-create the table.
        recorder = MigrationRecorder(connection)
        if ('cookbook', RECIPE_IMAGE_SQUASH) in recorder.applied_migrations():
            print(f'{RECIPE_IMAGE_SQUASH} already recorded')
        elif dry:
            print(f'would record cookbook.{RECIPE_IMAGE_SQUASH} (table exists, migration unrecorded)')
        else:
            recorder.record_applied('cookbook', RECIPE_IMAGE_SQUASH)
            print(f'recorded cookbook.{RECIPE_IMAGE_SQUASH}')

        # 2) Demote duplicate primaries (keep the first by order, pk) so the
        #    constraint can be added.
        with scopes_disabled():
            dupe_recipe_ids = list(
                RecipeImage.objects.filter(is_primary=True)
                .values('recipe').annotate(n=Count('pk')).filter(n__gt=1)
                .values_list('recipe', flat=True)
            )
            demoted = 0
            for recipe_id in dupe_recipe_ids:
                primaries = list(RecipeImage.objects.filter(recipe_id=recipe_id, is_primary=True).order_by('order', 'pk'))
                for img in primaries[1:]:
                    if dry:
                        print(f'would demote RecipeImage {img.id} (recipe {recipe_id})')
                    else:
                        img.is_primary = False
                        img.save(update_fields=['is_primary'])
                        demoted += 1
            print(f'demoted {demoted} duplicate primary image(s) across {len(dupe_recipe_ids)} recipe(s)')

        # 3) Add the partial unique index the squash installs on fresh DBs.
        if dry:
            print('dry run: index not created')
            return
        with connection.cursor() as cur:
            cur.execute(
                'CREATE UNIQUE INDEX IF NOT EXISTS unique_primary_image_per_recipe '
                'ON cookbook_recipeimage (recipe_id) WHERE is_primary'
            )
        print('unique_primary_image_per_recipe index ensured')
