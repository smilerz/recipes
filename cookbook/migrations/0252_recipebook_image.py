from django.db import migrations, models


class AddFieldIfColumnMissing(migrations.AddField):
    """AddField that skips the DDL when the column is already there.

    RecipeBook.image was added by the same original migration as Food.food_image
    (0246_image_improvements, 2026-04-12) that was silently dropped from the
    migration history during a chain-rebaseline squash — see 0251's restoration
    of food_image/crop_data (commit 386adfe19) and this field's own restoration.
    Any database migrated before that squash already has this column and never
    lost it; only databases created after the squash are actually missing it.
    """

    def __init__(self, *args, table_name, column_name, **kwargs):
        self.table_name = table_name
        self.column_name = column_name
        super().__init__(*args, **kwargs)

    def _column_exists(self, schema_editor):
        with schema_editor.connection.cursor() as cursor:
            columns = schema_editor.connection.introspection.get_table_description(cursor, self.table_name)
        return any(col.name == self.column_name for col in columns)

    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        if self._column_exists(schema_editor):
            return
        super().database_forwards(app_label, schema_editor, from_state, to_state)

    def database_backwards(self, app_label, schema_editor, from_state, to_state):
        if not self._column_exists(schema_editor):
            return
        super().database_backwards(app_label, schema_editor, from_state, to_state)


class Migration(migrations.Migration):

    dependencies = [
        ('cookbook', '0251_food_image_and_userfile_crop_data'),
    ]

    operations = [
        AddFieldIfColumnMissing(
            model_name='recipebook',
            name='image',
            field=models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, related_name='recipe_books', to='cookbook.userfile'),
            table_name='cookbook_recipebook',
            column_name='image_id',
        ),
    ]
