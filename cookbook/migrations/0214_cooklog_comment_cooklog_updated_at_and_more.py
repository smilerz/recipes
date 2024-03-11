# Generated by Django 4.2.7 on 2024-02-24 12:09

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cookbook', '0213_remove_property_property_unique_import_food_per_space_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='cooklog',
            name='comment',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='cooklog',
            name='updated_at',
            field=models.DateTimeField(auto_now=True),
        ),
        migrations.AlterField(
            model_name='cooklog',
            name='rating',
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='cooklog',
            name='servings',
            field=models.IntegerField(blank=True, null=True),
        ),
    ]
