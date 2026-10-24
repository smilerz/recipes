from django.db.models import QuerySet
from django.utils.translation import gettext as _
from rest_framework import status
from rest_framework.response import Response

from cookbook.models import UserSpace


def _ids_in_scope(relation_model, field_name, ids):
    """
    keep only the ids that exist for the model behind field_name in the active scope (current space),
    bulk writes below skip the ORM so nothing else stops an id from another space being linked.
    A queryset of that model was already read through its manager and is passed on as it is.
    """
    target = relation_model._meta.get_field(field_name).related_model
    if isinstance(ids, QuerySet) and ids.model is target:
        return ids
    return list(target.objects.filter(pk__in=ids).values_list('pk', flat=True))


def _link(relation_model, base_field_name, base_ids, related_field_name, related_ids):
    relation_objects = []
    for b in base_ids:
        for r in related_ids:
            relation_objects.append(relation_model(**{base_field_name: b, related_field_name: r}))
    relation_model.objects.bulk_create(relation_objects, ignore_conflicts=True, unique_fields=(base_field_name, related_field_name,))


def add_to_relation(relation_model, base_field_name, base_ids, related_field_name, related_ids):
    """
    given a model, the base and related field and the base and related ids, bulk create relation objects
    ids that don't exist in the current space are skipped
    """
    _link(relation_model,
          base_field_name, _ids_in_scope(relation_model, base_field_name, base_ids),
          related_field_name, _ids_in_scope(relation_model, related_field_name, related_ids))


def remove_from_relation(relation_model, base_field_name, base_ids, related_field_name, related_ids):
    base_ids = _ids_in_scope(relation_model, base_field_name, base_ids)
    relation_model.objects.filter(**{f'{base_field_name}__in': base_ids, f'{related_field_name}__in': related_ids}).delete()


def remove_all_from_relation(relation_model, base_field_name, base_ids):
    base_ids = _ids_in_scope(relation_model, base_field_name, base_ids)
    relation_model.objects.filter(**{f'{base_field_name}__in': base_ids}).delete()


def set_relation(relation_model, base_field_name, base_ids, related_field_name, related_ids):
    """
    replace the relations of the base objects, nothing is removed if none of the related ids exist in the current space
    """
    base_ids = _ids_in_scope(relation_model, base_field_name, base_ids)
    related_ids = _ids_in_scope(relation_model, related_field_name, related_ids)
    if not related_ids:
        return
    remove_all_from_relation(relation_model, base_field_name, base_ids)
    _link(relation_model, base_field_name, base_ids, related_field_name, related_ids)


def users_in_space(space, user_ids):
    """
    the given user ids that are members of the space (users have no scoped manager)
    """
    return list(UserSpace.objects.filter(space=space, user_id__in=user_ids).values_list('user_id', flat=True))


def invalid_id_response(field_name, pk):
    """
    400 response for a single id that does not exist in the current space
    """
    return Response({field_name: [_('Invalid id "%(id)s" - object does not exist.') % {'id': pk}]}, status=status.HTTP_400_BAD_REQUEST)
