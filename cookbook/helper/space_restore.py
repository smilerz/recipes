"""Part 3 of the pantry-expiration-and-data-portability plan: in-app space backup/restore.
See .claude/plans/pantry-expiration-and-data-portability.md.

Sub-phase 3b — the restore engine. v1 ships exactly one mode: restore into a brand-new
space, never in-place overwrite. Restore never trusts a serialized row's original pk for
anything other than looking itself up in the per-model old-pk-to-new-object map built as
rows are created (in the dependency order discover_space_scoped_models already gives) —
FK fields pointing at a restored model are rewritten to the new object; FK fields pointing
at User are re-linked to an *existing* target-instance account by username, never
recreated (unresolvable references are reported and that row is skipped, not silently
dropped or misattributed); FK fields pointing at anything else (global, instance-wide
reference data untouched by restore) keep their original pk.

M2M fields (Food.substitute, RecipeBook.shared, UserSpace.groups,
Food.inherit_fields/child_inherit_fields) are resolved in a second pass after every
model's rows exist, using the same FK/User/global-pk resolution rules — an M2M target
that's itself a restored model resolves through its pk_maps entry, a User-target resolves
through user_map, anything else (Group, FoodInheritField) resolves through global_refs by
natural key (name / field) — restore's real use case is moving a space to a different
Tandoor instance or disaster recovery, not staying on the one instance, so these pks are
never assumed to line up between source and target. Uses .add() (union), never .set()
(replace) — critical for UserSpace.groups specifically, see _create_row's UserSpace
special-case below.
"""
from django.contrib.auth.models import User
from django.db import transaction

from cookbook.helper.permission_helper import create_space_for_user
from cookbook.helper.space_backup import GLOBAL_NATURAL_KEY_FIELDS, discover_space_scoped_models, _fk_fields
from cookbook.models import Space, TreeModel, UserSpace


class SpaceRestoreValidationError(ValueError):
    """A deliberate, safe-to-display validation refusal — never wraps or carries an
    unrelated exception's message. The API view catches only this type (not bare
    ValueError) so an incidental/unexpected error elsewhere in the restore path can't be
    forwarded to the client verbatim (CWE-209 / CodeQL alert #125)."""
    pass


def assert_target_space_is_empty(space):
    """A freshly-created, untouched space has exactly one UserSpace row (its creator) and
    nothing else. Raises SpaceRestoreValidationError if `space` has anything more than that
    baseline."""
    if UserSpace.objects.filter(space=space).count() > 1:
        raise SpaceRestoreValidationError(f'space {space.pk} already has additional members — refusing to restore into it')

    for model, lookup_path in discover_space_scoped_models():
        if model is UserSpace:
            continue
        if model.objects.filter(**{lookup_path: space}).exists():
            raise SpaceRestoreValidationError(f'space {space.pk} already has {model.__name__} data — refusing to restore into it')


def _resolve_users(users_payload):
    """{old_pk_str: {'username', 'email'}} -> ({old_pk_int: User}, [unresolved usernames]).
    Matches by username first, falling back to email; never creates an account."""
    user_map = {}
    unresolved = []
    for old_pk_str, info in users_payload.items():
        user = User.objects.filter(username=info['username']).first()
        if user is None and info.get('email'):
            user = User.objects.filter(email=info['email']).first()
        if user is not None:
            user_map[int(old_pk_str)] = user
        else:
            unresolved.append(info['username'])
    return user_map, unresolved


def _resolve_global_refs(backup_data):
    """{model_name: {old_pk_str: natural_key_value}} -> {model_name: {old_pk_int: instance}}.
    Resolves Group/FoodInheritField by their natural key (name/field), never by pk — see
    GLOBAL_NATURAL_KEY_FIELDS. An unresolvable reference (no matching row on this
    instance — these are meant to be fixed, always-present lookup tables, so this should
    be rare) is simply absent from the map; the M2M pass skips it, per-value, silently."""
    global_ref_map = {}
    global_refs_payload = backup_data.get('global_refs', {})
    for model, natural_field in GLOBAL_NATURAL_KEY_FIELDS.items():
        refs = global_refs_payload.get(model.__name__, {})
        if not refs:
            continue
        model_map = {}
        for old_pk_str, natural_value in refs.items():
            obj = model.objects.filter(**{natural_field: natural_value}).first()
            if obj is not None:
                model_map[int(old_pk_str)] = obj
        global_ref_map[model.__name__] = model_map
    return global_ref_map


def preview_restore(backup_data):
    """Zero-write: what restore_space_backup would do, without doing it. Lets the UI show
    the full username/email re-link list for review before the admin commits — restore is
    the one place this feature acts on cross-cutting identity data, and the adversarial risk
    most likely to bite someone (a different real person now registered under a matching
    username/email on this instance)."""
    model_counts = {name: len(rows) for name, rows in backup_data.get('models', {}).items()}

    users = []
    for info in backup_data.get('users', {}).values():
        user = User.objects.filter(username=info['username']).first()
        if user is None and info.get('email'):
            user = User.objects.filter(email=info['email']).first()
        users.append({'username': info['username'], 'email': info.get('email', ''), 'resolved': user is not None})

    return {'model_counts': model_counts, 'users': users}


def _create_row(model, fields, is_tree, parent_obj):
    """The actual insert — isolated so the tree-vs-plain branch stays in one place and so
    tests can simulate a mid-restore failure without depending on ORM internals."""
    if is_tree:
        return parent_obj.add_child(**fields) if parent_obj is not None else model.add_root(**fields)
    return model.objects.create(**fields)


def restore_space_backup(backup_data, admin_user):
    """Creates a brand-new Space and restores backup_data (as produced by
    build_space_backup) into it. The whole operation is one transaction — any failure
    rolls back to no new space created, never a half-built one.

    Returns (new_space, report) where report = {
        'models': {model_name: {'created': N, 'skipped': N}},
        'unresolved_users': [username, ...],
    }
    """
    with transaction.atomic():
        new_space = create_space_for_user(admin_user, name=f"Restored: {backup_data['space_name']}").space
        assert_target_space_is_empty(new_space)

        user_map, unresolved_users = _resolve_users(backup_data.get('users', {}))
        global_ref_map = _resolve_global_refs(backup_data)

        pk_maps = {}  # model name -> {old_pk: new_object}
        report_models = {}

        for model, _lookup_path in discover_space_scoped_models():
            rows = backup_data['models'].get(model.__name__, [])
            fk_field_map = dict(_fk_fields(model))
            not_null_fields = {f.name for f in model._meta.get_fields()
                               if f.concrete and hasattr(f, 'null') and not f.null}
            m2m_field_names = {f.name for f in model._meta.get_fields() if f.many_to_many}
            is_tree = issubclass(model, TreeModel)

            created = 0
            skipped = 0
            path_to_new_obj = {}
            ordered_rows = sorted(rows, key=lambda r: r['fields'].get('depth', 0)) if is_tree else rows

            for row in ordered_rows:
                fields = dict(row['fields'])
                fields.pop('numchild', None)
                old_path = fields.pop('path', None) if is_tree else None
                depth = fields.pop('depth', None) if is_tree else None
                # M2M values can't go through create()/add_root() — stripped here, resolved
                # in a second pass once every model's rows exist (see module docstring).
                for m2m_name in m2m_field_names:
                    fields.pop(m2m_name, None)

                skip_row = False
                for field_name, related_model in fk_field_map.items():
                    if field_name not in fields:
                        continue
                    old_value = fields[field_name]
                    if related_model is Space:
                        fields[field_name] = new_space
                    elif related_model is User:
                        resolved = user_map.get(old_value) if old_value is not None else None
                        if resolved is None and old_value is not None and field_name in not_null_fields:
                            skip_row = True
                            break
                        fields[field_name] = resolved
                    elif related_model.__name__ in pk_maps:
                        resolved = pk_maps[related_model.__name__].get(old_value) if old_value is not None else None
                        if resolved is None and old_value is not None and field_name in not_null_fields:
                            skip_row = True
                            break
                        fields[field_name] = resolved
                    # else: FK to a model outside the space-scoped set (global reference
                    # data untouched by restore) — keep the original pk value as-is.

                if skip_row:
                    skipped += 1
                    continue

                if model is UserSpace:
                    # The person doing a restore is typically also a member of the
                    # original space, and create_space_for_user already auto-created
                    # their own UserSpace (with the 'admin' group) before this loop
                    # started. Recreating it here would duplicate that row — reuse the
                    # existing one instead (its groups still get merged in the M2M pass).
                    existing = UserSpace.objects.filter(user=fields.get('user'), space=new_space).first()
                    if existing is not None:
                        pk_maps.setdefault(model.__name__, {})[row['pk']] = existing
                        created += 1
                        continue

                parent_obj = None
                if is_tree and depth and depth > 1:
                    parent_path = old_path[:-model.steplen]
                    parent_obj = path_to_new_obj.get(parent_path)
                    if parent_obj is None:
                        skipped += 1
                        continue

                new_obj = _create_row(model, fields, is_tree, parent_obj)
                if is_tree:
                    path_to_new_obj[old_path] = new_obj
                pk_maps.setdefault(model.__name__, {})[row['pk']] = new_obj
                created += 1

            report_models[model.__name__] = {'created': created, 'skipped': skipped}

        _restore_m2m_fields(backup_data, pk_maps, user_map, global_ref_map)

        return new_space, {'models': report_models, 'unresolved_users': unresolved_users}


def _restore_m2m_fields(backup_data, pk_maps, user_map, global_ref_map):
    """Second pass, after every model's rows exist: populate M2M fields stripped during
    creation. Always .add() (union), never .set() (replace) — a freshly-created object's
    M2M starts empty so the two are equivalent there, but UserSpace rows reused via the
    admin-dedup special case in the main loop are NOT empty (they already carry the
    auto-attached 'admin' group), and .set() would silently strip that."""
    for model, _lookup_path in discover_space_scoped_models():
        m2m_field_names = [f.name for f in model._meta.get_fields() if f.many_to_many]
        if not m2m_field_names:
            continue

        model_pk_map = pk_maps.get(model.__name__, {})
        for row in backup_data['models'].get(model.__name__, []):
            new_obj = model_pk_map.get(row['pk'])
            if new_obj is None:
                continue

            for field_name in m2m_field_names:
                old_values = row['fields'].get(field_name) or []
                if not old_values:
                    continue

                related_model = model._meta.get_field(field_name).related_model
                if related_model is User:
                    resolved = [user_map[v] for v in old_values if v in user_map]
                elif related_model.__name__ in pk_maps:
                    related_pk_map = pk_maps[related_model.__name__]
                    resolved = [related_pk_map[v] for v in old_values if v in related_pk_map]
                elif related_model.__name__ in global_ref_map:
                    related_ref_map = global_ref_map[related_model.__name__]
                    resolved = [related_ref_map[v] for v in old_values if v in related_ref_map]
                else:
                    resolved = []

                if resolved:
                    getattr(new_obj, field_name).add(*resolved)
