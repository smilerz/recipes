"""Version-agnostic Food/Keyword/RecipeBook export (Part 2 of the pantry-expiration-and-
data-portability plan). Export-only for now — import/merge builds on this envelope shape.

The envelope is deliberately NOT the live API serializers (FoodSerializer etc.) — those
change with every UI feature, which is exactly how cross-version compatibility breaks
silently. `tandoor_export_format` is the compatibility contract, bumped only on an actual
breaking schema change, independently of ordinary app releases.

Hierarchy is represented by natural key (the '>'-joined ancestor name path, same as
TreeModel.full_name) rather than numeric PKs/treebeard path/depth, which are meaningless
across instances. Food and Keyword both have a DB-level UniqueConstraint(space, name), so a
plain name is already enough to identify a node within a space — the natural key here exists
to let an importer reconstruct hierarchy structure (which parent a new node attaches under),
not to disambiguate otherwise-ambiguous names.
"""
from django.utils import timezone

from cookbook.models import Food, Keyword, RecipeBookEntry

FORMAT_VERSION = 'portable-data-v1'


def _natural_key(node):
    return node.full_name


def _parent_natural_key(node):
    parent = node.get_parent()
    return parent.full_name if parent else None


def _export_food(food):
    return {
        'natural_key': _natural_key(food),
        'name': food.name,
        'parent_natural_key': _parent_natural_key(food),
        'description': food.description,
        'url': food.url,
        'ignore_shopping': food.ignore_shopping,
        'substitute_siblings': food.substitute_siblings,
        'substitute_children': food.substitute_children,
        'shelf_life_days': food.shelf_life_days,
        'shelf_life_days_frozen': food.shelf_life_days_frozen,
        'shelf_life_days_opened': food.shelf_life_days_opened,
        'shopping_amount': str(food.shopping_amount) if food.shopping_amount is not None else None,
        'fdc_id': food.fdc_id,
        'open_data_slug': food.open_data_slug,
        'supermarket_category': food.supermarket_category.name if food.supermarket_category else None,
        'substitute': [s.full_name for s in food.substitute.all()],
        'properties': [
            {'property_type': fp.property.property_type.name,
             'amount': str(fp.property.property_amount) if fp.property.property_amount is not None else None}
            for fp in food.foodproperty_set.select_related('property__property_type').all()
        ],
        'inherit_fields': [f.field for f in food.inherit_fields.all()],
        'child_inherit_fields': [f.field for f in food.child_inherit_fields.all()],
    }


def _export_keyword(keyword):
    return {
        'natural_key': _natural_key(keyword),
        'name': keyword.name,
        'parent_natural_key': _parent_natural_key(keyword),
        'description': keyword.description,
    }


def _export_book(book, warnings):
    if book.shared.exists():
        warnings.append(f"Book '{book.name}': sharing settings are not exported.")
    if book.filter_id:
        warnings.append(f"Book '{book.name}': smart-filter criteria are not exported.")
    entries = list(
        RecipeBookEntry.objects.filter(book=book).select_related('recipe').values_list('recipe__name', flat=True)
    )
    return {
        'name': book.name,
        'description': book.description,
        'order': book.order,
        'entries': entries,
    }


def build_portable_export(space, *, include_foods=True, include_keywords=True, include_books=True):
    """Build the portable-data export envelope for one space.

    Foods/keywords are returned depth-sorted (root-to-leaf) so a sequential importer can
    always resolve `parent_natural_key` against nodes already created earlier in the same
    pass, without needing a two-pass algorithm.
    """
    warnings = []
    content = {'foods': [], 'keywords': [], 'books': [], 'warnings': warnings}

    if include_foods:
        foods = Food.objects.filter(space=space).order_by('depth', 'path')
        content['foods'] = [_export_food(f) for f in foods]

    if include_keywords:
        keywords = Keyword.objects.filter(space=space).order_by('depth', 'path')
        content['keywords'] = [_export_keyword(k) for k in keywords]

    if include_books:
        from cookbook.models import RecipeBook
        books = RecipeBook.objects.filter(space=space).order_by('name')
        content['books'] = [_export_book(b, warnings) for b in books]

    return {
        'tandoor_export_format': FORMAT_VERSION,
        'exported_at': timezone.now().isoformat(),
        'content': content,
    }
