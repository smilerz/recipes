from django.db import migrations
from django.db.models import F, Max
from django.utils import timezone


def backfill(apps, schema_editor):
    """Mark the checked-off shopping entries that Stock up should not offer, so its first run lists only what was bought
    since the pantry was last filled.

    Per space (the pantry log records no user): an entry checked off after the space's most recent pantry add stays
    unstocked. Everything else that is checked off is marked stocked: entries completed at or before that add, entries
    with no completion time (they cannot be placed in time) and every entry of a space that never added to the pantry
    (it would otherwise list its whole history).
    """
    Entry = apps.get_model('cookbook', 'ShoppingListEntry')
    Log = apps.get_model('cookbook', 'InventoryLog')
    # Historical models use Django's plain Manager, bypassing ScopedManager.
    newest_add = {row['space_id']: row['newest'] for row in Log.objects.filter(booking_type='add').values('space_id').annotate(newest=Max('created_at'))}

    unhandled = Entry.objects.filter(checked=True, stocked_at__isnull=True, dismissed_at__isnull=True)
    unhandled.filter(completed_at__isnull=True).update(stocked_at=timezone.now())
    for space_id in list(unhandled.values_list('space_id', flat=True).distinct()):
        in_space = unhandled.filter(space_id=space_id)
        newest = newest_add.get(space_id)
        if newest is not None:
            in_space = in_space.filter(completed_at__lte=newest)
        in_space.update(stocked_at=F('completed_at'))


def unbackfill(apps, schema_editor):
    Entry = apps.get_model('cookbook', 'ShoppingListEntry')
    Entry.objects.update(stocked_at=None, dismissed_at=None)


class Migration(migrations.Migration):

    dependencies = [
        ('cookbook', '0256_shoppinglistentry_stock_state'),
    ]

    operations = [
        migrations.RunPython(backfill, unbackfill),
    ]
