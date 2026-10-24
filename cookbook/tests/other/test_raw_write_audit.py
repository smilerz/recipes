"""Tripwire for writes that bypass the ORM's space scoping.

Normal serializers resolve related objects through the scoped managers, so an id from another space
simply doesn't resolve. These raw writes don't: bulk_create(), queryset.update(<fk>_id=...) and
instantiating a join-table row all take an id and write it, whatever space it belongs to. Every one of
them in the application code has to be listed below with the reason it is safe, and when client supplied
ids reach it, the test that proves a foreign id is rejected.

Adding a new raw write fails test_every_raw_write_is_classified until it is reviewed and listed.

Known gaps: related-manager ``.add()`` / ``.set()`` with raw pks, ``update(fk=obj)``, raw SQL and
``**kwargs`` writes are not detected.
"""
import ast
import collections
import pathlib

CODE_ROOT = pathlib.Path(__file__).resolve().parents[2]
TESTS_ROOT = CODE_ROOT / 'tests'
SKIPPED_DIRS = {'tests', 'migrations', 'locale'}

INTERNAL = 'internal ids: '

ALLOWLIST = {
    'cookbook/helper/batch_edit_helper.py::_link::bulk_create': (
        1,
        'only called by add_to_relation and set_relation, which filter both id lists to the current space first',
        ['test_add_to_relation_skips_related_ids_from_another_space', 'test_add_to_relation_skips_base_ids_from_another_space', 'test_set_relation_skips_related_ids_from_another_space']),
    'cookbook/views/api.py::FoodViewSet.batch_update::update_fk_id': (
        1,
        'category is checked against the request space (null clears it)',
        ['test_batch_update_rejects_category_from_another_space']),
    'cookbook/views/api.py::UserSpaceViewSet.batch_update::update_fk_id': (
        1,
        'household is checked against the request space (null clears it)',
        ['test_batch_update_ignores_household_from_another_space']),
    'cookbook/views/api.py::RecipeViewSet.batch_update::bulk_create': (
        3,
        'shared users are limited to members of the space, keywords go through the helper',
        ['test_batch_update_ignores_shared_user_from_another_space']),
    'cookbook/views/api.py::RecipeViewSet.batch_update::through_instance': (
        2,
        'shared users are limited to members of the space',
        ['test_batch_update_ignores_shared_user_from_another_space']),
    'cookbook/views/api.py::ShoppingListRecipeViewSet.bulk_create_entries::bulk_create': (
        2,
        'unit, food, ingredient and shopping list ids are limited to the space',
        ['test_bulk_create_entries_ignores_ids_from_another_space', 'test_bulk_create_entries_ignores_shopping_list_from_another_space']),
    'cookbook/views/api.py::ShoppingListRecipeViewSet.bulk_create_entries::through_instance': (
        1,
        'shopping list ids are limited to the space',
        ['test_bulk_create_entries_ignores_shopping_list_from_another_space']),
    'cookbook/views/api.py::AutoPlanViewSet.create::bulk_create': (
        1,
        'meal type is checked against the space, shared users are limited to members of the space',
        ['test_auto_plan_ignores_meal_type_from_another_space', 'test_auto_plan_ignores_shared_user_from_another_space']),
    'cookbook/views/api.py::FoodViewSet.fdc::bulk_create': (
        2,
        INTERNAL + 'the food from get_object() and property types from the scoped manager',
        []),
    'cookbook/views/api.py::FoodViewSet.fdc::through_instance': (
        1,
        INTERNAL + 'the food from get_object() and the properties just created',
        []),
    'cookbook/models.py::Food.reset_inheritance::bulk_create': (
        1,
        INTERNAL + 'foods selected by the space/tree filter, inherit field ids from the database',
        []),
    'cookbook/helper/shopping_helper.py::RecipeShoppingEditor._add_ingredients::bulk_create': (
        1,
        INTERNAL + 'ingredients resolved through the scoped Ingredient manager, entries carry the editor space',
        []),
    'cookbook/helper/open_data_importer.py::OpenDataImporter.import_units::bulk_create': (
        1,
        INTERNAL + 'rows built from the open data payload for the importing space',
        []),
    'cookbook/helper/open_data_importer.py::OpenDataImporter.import_category::bulk_create': (
        1,
        INTERNAL + 'rows built from the open data payload for the importing space',
        []),
    'cookbook/helper/open_data_importer.py::OpenDataImporter.import_property::bulk_create': (
        1,
        INTERNAL + 'rows built from the open data payload for the importing space',
        []),
    'cookbook/helper/open_data_importer.py::OpenDataImporter.import_supermarket::bulk_create': (
        2,
        INTERNAL + 'rows built from the open data payload for the importing space',
        []),
    'cookbook/helper/open_data_importer.py::OpenDataImporter.import_food::bulk_create': (
        2,
        INTERNAL + 'rows built from the open data payload and the space slug cache',
        []),
    'cookbook/helper/open_data_importer.py::OpenDataImporter.import_food::through_instance': (
        1,
        INTERNAL + 'ids come from the space slug cache',
        []),
    'cookbook/helper/open_data_importer.py::OpenDataImporter.import_conversion::bulk_create': (
        1,
        INTERNAL + 'rows built from the open data payload for the importing space',
        []),
    'cookbook/integration/mealie1.py::Mealie1.get_recipe_from_file::bulk_create': (
        9,
        INTERNAL + 'pks of rows created during this import',
        []),
    'cookbook/integration/mealie1.py::Mealie1.get_recipe_from_file::through_instance': (
        10,
        INTERNAL + 'pks of rows created during this import',
        []),
}


def find_raw_writes(source):
    """number of raw writes per (qualified function name, kind) in the source"""
    found = collections.Counter()

    def visit(node, scope):
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                visit(child, scope + [child.name])
                continue
            if isinstance(child, ast.Call) and isinstance(child.func, ast.Attribute):
                where = '.'.join(scope) or '<module>'
                if child.func.attr == 'bulk_create':
                    found[(where, 'bulk_create')] += 1
                elif child.func.attr == 'update' and any(k.arg and k.arg.endswith('_id') for k in child.keywords):
                    found[(where, 'update_fk_id')] += 1
                elif child.func.attr == 'through':
                    found[(where, 'through_instance')] += 1
            visit(child, scope)

    visit(ast.parse(source), [])
    return dict(found)


def scan_code():
    """number of raw writes per 'file::function::kind' key"""
    counts = {}
    for path in sorted(CODE_ROOT.rglob('*.py')):
        if SKIPPED_DIRS & set(path.relative_to(CODE_ROOT).parts):
            continue
        for (where, kind), n in find_raw_writes(path.read_text()).items():
            counts[f'cookbook/{path.relative_to(CODE_ROOT).as_posix()}::{where}::{kind}'] = n
    return counts


def test_scanner_detects_each_kind_of_raw_write():
    source = (
        'class V:\n'
        '    def a(self):\n'
        '        Model.objects.bulk_create(rows)\n'
        '        qs.update(owner_id=1)\n'
        '        Recipe.keywords.through(recipe_id=1, keyword_id=2)\n'
        '    def b(self):\n'
        '        qs.update(name="x")\n'
        '        qs.filter(id=1).delete()\n'
    )

    assert find_raw_writes(source) == {('V.a', 'bulk_create'): 1, ('V.a', 'update_fk_id'): 1, ('V.a', 'through_instance'): 1}


def test_scanner_counts_every_site_in_a_function():
    source = (
        'def a():\n'
        '    One.objects.bulk_create(rows)\n'
        '    Two.objects.bulk_create(rows)\n'
    )

    assert find_raw_writes(source) == {('a', 'bulk_create'): 2}


def test_every_raw_write_is_classified():
    unclassified = sorted(set(scan_code()) - set(ALLOWLIST))

    assert not unclassified, (
        'New raw write(s) found. They take ids and write them without the ORM scoping them to the current space.\n'
        'Check that client supplied ids cannot reach another space, add a test that sends an id from another space, '
        'then list each one in ALLOWLIST with its reason and test:\n  ' + '\n  '.join(unclassified))


def test_allowlisted_functions_have_no_additional_raw_writes():
    found = scan_code()
    changed = [f'{key}: reviewed {count}, found {found[key]}' for key, (count, _reason, _tests) in ALLOWLIST.items() if key in found and found[key] != count]

    assert not changed, (
        'The number of raw writes in an already listed function changed. Review the added or removed ones '
        '(ids from the client must not reach another space) and update the count:\n  ' + '\n  '.join(changed))


def test_allowlist_has_no_stale_entries():
    stale = sorted(set(ALLOWLIST) - set(scan_code()))

    assert not stale, 'Allowlisted raw writes no longer exist, remove them from ALLOWLIST:\n  ' + '\n  '.join(stale)


def test_allowlist_entries_justify_themselves():
    test_sources = '\n'.join(p.read_text() for p in TESTS_ROOT.rglob('test_*.py'))
    problems = []
    for key, (_count, reason, tests) in ALLOWLIST.items():
        if not tests and not reason.startswith(INTERNAL):
            problems.append(f'{key}: needs a test, or an "{INTERNAL}" reason when no client ids reach it')
        problems += [f'{key}: test {name} does not exist' for name in tests if f'def {name}(' not in test_sources]

    assert not problems, '\n'.join(problems)
