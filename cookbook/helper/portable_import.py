"""Import/merge for the portable Food/Keyword/RecipeBook export (cookbook.helper.portable_data).

Two entry points:
- analyze_portable_import(export, space) — dry-run diff preview, zero DB writes.
- apply_portable_import(export, space, merge_policy=...) — commit, returns a result report.

Resolution is by NAME, not full natural-key path: Food and Keyword both carry a DB-level
UniqueConstraint(space, name), so a name is already unambiguous within a space regardless of
tree position. The natural_key/parent_natural_key strings in the export exist so a human
reading the file (or a hand-edited one) sees full hierarchical context, but resolution only
ever needs the trailing name segment.

Merge policy applies ONLY to fields on an already-matched (same-name) food/keyword — a
not-yet-existing node is always created outright with the imported values, regardless of
policy. Three policies: 'skip' (never touch an existing node), 'overwrite' (imported values
always win), 'fill_gaps' (default — only fills fields that are currently blank/None).
"""
from cookbook.models import (Food, FoodInheritField, FoodProperty, Keyword, Property, PropertyType,
                             Recipe, RecipeBook, RecipeBookEntry, SupermarketCategory)

FOOD_SCALAR_FIELDS = (
    'description', 'url', 'ignore_shopping', 'substitute_siblings', 'substitute_children',
    'shelf_life_days', 'shelf_life_days_frozen', 'shelf_life_days_opened',
    'fdc_id', 'open_data_slug',
)
KEYWORD_SCALAR_FIELDS = ('description',)


def _leaf_name(natural_key):
    """The node's own name from a '>'-joined natural key path — resolution only ever needs
    this, since Food/Keyword names are already unique per space (see module docstring)."""
    if natural_key is None:
        return None
    return natural_key.rsplit(' > ', 1)[-1]


def _apply_field(instance, field, new_value, merge_policy):
    """Set `field` on `instance` per `merge_policy`; returns True if changed."""
    if merge_policy == 'skip':
        return False
    current = getattr(instance, field)
    if merge_policy == 'overwrite':
        if current == new_value:
            return False
        setattr(instance, field, new_value)
        return True
    # fill_gaps (default): only set if currently blank and the import has something to offer
    if current in (None, '') and new_value not in (None, ''):
        setattr(instance, field, new_value)
        return True
    return False


def _classify_tree_entries(entries, model, space):
    """Dry-run classification for Food/Keyword entries: new / matching (exact name) /
    possible_match (case-insensitive name collision only, exact match not found)."""
    new, matching, possible_match = [], [], []
    for entry in entries:
        name = entry['name']
        if model.objects.filter(space=space, name=name).exists():
            matching.append(name)
        elif model.objects.filter(space=space, name__iexact=name).exists():
            possible_match.append(name)
        else:
            new.append(name)
    return {'new': new, 'matching': matching, 'possible_match': possible_match}


def analyze_portable_import(export, space):
    """Dry-run: classify every entry without writing anything to the database."""
    content = export['content']
    return {
        'foods': _classify_tree_entries(content.get('foods', []), Food, space),
        'keywords': _classify_tree_entries(content.get('keywords', []), Keyword, space),
        'books': _classify_tree_entries(
            [{'name': b['name']} for b in content.get('books', [])], RecipeBook, space),
        'warnings': list(content.get('warnings', [])),
    }


def _get_or_create_supermarket_category(name, space):
    if not name:
        return None
    obj, _created = SupermarketCategory.objects.get_or_create(space=space, name=name)
    return obj


def _import_tree_model(entries, model, space, merge_policy, scalar_fields, extra_fields_fn=None):
    """Shared Food/Keyword tree import: depth-sorted input resolves parents in one pass
    (each entry's parent, if any, was already processed earlier in the export's own
    depth-sorted order); a parent not yet seen is deferred and retried once before being
    treated as an error (matches the plan's documented behavior for out-of-order input)."""
    created_count = 0
    merged_count = 0
    pending = list(entries)
    errors = []

    for _pass in range(2):
        still_pending = []
        for entry in pending:
            parent_name = _leaf_name(entry['parent_natural_key'])
            parent = None
            if parent_name is not None:
                parent = model.objects.filter(space=space, name=parent_name).first()
                if parent is None:
                    still_pending.append(entry)
                    continue

            instance = model.objects.filter(space=space, name=entry['name']).first()
            extra = extra_fields_fn(entry, space) if extra_fields_fn else {}
            if instance is None:
                fields = {f: entry.get(f) for f in scalar_fields}
                fields.update(extra)
                if parent is not None:
                    instance = parent.add_child(name=entry['name'], space=space, **fields)
                else:
                    instance = model.add_root(name=entry['name'], space=space, **fields)
                created_count += 1
            else:
                changed = False
                for field in scalar_fields:
                    if _apply_field(instance, field, entry.get(field), merge_policy):
                        changed = True
                for field, value in extra.items():
                    if _apply_field(instance, field, value, merge_policy):
                        changed = True
                if changed:
                    instance.save()
                merged_count += 1
        if not still_pending:
            break
        pending = still_pending
    else:
        for entry in pending:
            errors.append(f"{model.__name__} '{entry['name']}': parent "
                          f"'{_leaf_name(entry['parent_natural_key'])}' could not be resolved.")

    return {'created': created_count, 'merged': merged_count, 'errors': errors}


def _food_extra_fields(entry, space):
    return {'shopping_amount': float(entry['shopping_amount']) if entry.get('shopping_amount') else None,
            'supermarket_category': _get_or_create_supermarket_category(entry.get('supermarket_category'), space)}


def _resolve_food_substitutes(food_entries, space, warnings):
    for entry in food_entries:
        if not entry.get('substitute'):
            continue
        food = Food.objects.filter(space=space, name=entry['name']).first()
        if food is None:
            continue
        for sub_key in entry['substitute']:
            sub_name = _leaf_name(sub_key)
            sub_food = Food.objects.filter(space=space, name=sub_name).first()
            if sub_food is None:
                warnings.append(f"Food '{entry['name']}': substitute '{sub_name}' not found, skipped.")
                continue
            food.substitute.add(sub_food)


def _resolve_food_inherit_fields(food_entries, space, warnings):
    for entry in food_entries:
        food = Food.objects.filter(space=space, name=entry['name']).first()
        if food is None:
            continue
        for field_name, attr in (('inherit_fields', 'inherit_fields'), ('child_inherit_fields', 'child_inherit_fields')):
            for field_code in entry.get(field_name, []):
                field_obj = FoodInheritField.objects.filter(field=field_code).first()
                if field_obj is None:
                    continue  # unknown to this Tandoor version — preserved nowhere yet, silently inert (FR: forward-compat)
                getattr(food, attr).add(field_obj)


def _resolve_food_properties(food_entries, space, warnings):
    for entry in food_entries:
        if not entry.get('properties'):
            continue
        food = Food.objects.filter(space=space, name=entry['name']).first()
        if food is None:
            continue
        for prop in entry['properties']:
            ptype, _created = PropertyType.objects.get_or_create(space=space, name=prop['property_type'])
            property_obj, _created = Property.objects.get_or_create(
                space=space, property_type=ptype, property_amount=prop['amount'])
            FoodProperty.objects.get_or_create(food=food, property=property_obj)


def _import_books(book_entries, space, merge_policy, warnings, user):
    created = merged = 0
    for entry in book_entries:
        book = RecipeBook.objects.filter(space=space, name=entry['name']).first()
        if book is None:
            if user is None:
                warnings.append(f"Book '{entry['name']}': no importing user given, book not created.")
                continue
            book = RecipeBook.objects.create(
                space=space, name=entry['name'], description=entry.get('description', ''),
                order=entry.get('order', 0), created_by=user)
            created += 1
        else:
            if _apply_field(book, 'description', entry.get('description'), merge_policy):
                book.save()
            merged += 1

        for recipe_name in entry.get('entries', []):
            recipe = Recipe.objects.filter(space=space, name=recipe_name).first()
            if recipe is None:
                warnings.append(f"Book '{entry['name']}': recipe '{recipe_name}' not found, entry skipped.")
                continue
            RecipeBookEntry.objects.get_or_create(book=book, recipe=recipe)
    return {'created': created, 'merged': merged}


def apply_portable_import(export, space, *, merge_policy='fill_gaps', user=None):
    """Commit the import. `user` is required to create new RecipeBooks (created_by is not
    nullable) — books are skipped with a warning, not a hard failure, if omitted.

    Returns {'foods': {...}, 'keywords': {...}, 'books': {...}, 'warnings': [...]} —
    created/merged counts per category plus every non-fatal issue encountered (dropped
    substitutes, unresolved book entries, carried-over export warnings)."""
    content = export['content']
    warnings = list(content.get('warnings', []))

    food_entries = content.get('foods', [])
    food_result = _import_tree_model(food_entries, Food, space, merge_policy, FOOD_SCALAR_FIELDS, _food_extra_fields)
    _resolve_food_substitutes(food_entries, space, warnings)
    _resolve_food_inherit_fields(food_entries, space, warnings)
    _resolve_food_properties(food_entries, space, warnings)

    keyword_result = _import_tree_model(content.get('keywords', []), Keyword, space, merge_policy, KEYWORD_SCALAR_FIELDS)

    book_result = _import_books(content.get('books', []), space, merge_policy, warnings, user)

    return {'foods': food_result, 'keywords': keyword_result, 'books': book_result, 'warnings': warnings}
