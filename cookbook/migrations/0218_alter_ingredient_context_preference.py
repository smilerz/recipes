# Generated by Django 4.1.10 on 2023-08-25 13:23

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cookbook', '0217_alter_userpreference_default_page'),
    ]

    operations = [
        migrations.AddField(
            model_name='userpreference',
            name='ingredient_context',
            field=models.BooleanField(default=False),
        ),
    ]
