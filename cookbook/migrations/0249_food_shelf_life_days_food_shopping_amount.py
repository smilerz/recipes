from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cookbook', '0248_alter_userpreference_nav_bg_color_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='food',
            name='shelf_life_days',
            field=models.PositiveIntegerField(blank=True, default=None, null=True),
        ),
        migrations.AddField(
            model_name='food',
            name='shopping_amount',
            field=models.DecimalField(blank=True, decimal_places=4, default=None, max_digits=16, null=True),
        ),
    ]
