"""Part 3 of the pantry-expiration-and-data-portability plan: in-app space backup/restore.
See .claude/plans/pantry-expiration-and-data-portability.md.

Same-instance, same-version, full-space wholesale-replace semantics — deliberately NOT
Part 2's cross-version natural-key format (see portable_data.py/portable_import.py).

Model discovery is a generic FK-graph walk from Space rather than a hand-maintained list:
a model is "space data" if it has a (possibly indirect) FK chain reaching Space. This means
a new space-scoped model added later is picked up automatically with no code change here,
and the same walk gives the FK-dependency order restore needs (a model's FK targets are,
by construction, discovered before it).
"""
import json

from django.apps import apps
from django.contrib.auth.models import Group, User
from django.core import serializers
from django.core.files.base import ContentFile
from django.core.serializers.json import DjangoJSONEncoder
from django.utils import timezone
from django_scopes import scope

from cookbook.models import FoodInheritField, Space, SpaceBackup, UserPreference

FORMAT_VERSION = 'space-backup-v1'

# Models excluded from the FK-graph discovery even though they have some path to Space,
# because that path doesn't actually mean "owned by this space":
# - UserPreference: reaches Space only via an optional default_meal_type FK (a user's
#   preferred meal type happens to belong to some space) — preferences are the user's own,
#   carried across every space they're in, not this space's data. Its own
#   ScopedManager(space='space') declaration is itself broken (UserPreference has no such
#   field) — apparently never exercised elsewhere, since nothing else queries
#   UserPreference.objects while a space scope is active.
_EXCLUDED_MODELS = {UserPreference}

# Models referenced by space-scoped data that are themselves global (shared instance-wide,
# never restored) but whose pks are NOT safe to assume line up between two different
# Tandoor instances — the real backup/restore use case is moving a space to a different
# instance or disaster recovery, not staying on the one instance. Each maps to its natural
# (unique) identifying field; build_space_backup records that value alongside every
# referenced pk (same reasoning as `users`, just for these two lookup tables) so restore
# can resolve by identity, never by blindly reusing the old pk.
GLOBAL_NATURAL_KEY_FIELDS = {
    Group: 'name',
    FoodInheritField: 'field',
}


def _fk_fields(model):
    """(field_name, related_model) for every concrete FK/O2O field on model."""
    fields = []
    for f in model._meta.get_fields():
        if f.concrete and (f.many_to_one or getattr(f, 'one_to_one', False)):
            fields.append((f.name, f.related_model))
    return fields


def discover_space_scoped_models():
    """Returns [(model, space_lookup_path), ...] for every cookbook model with an FK chain
    (direct or transitive) reaching Space, topologically ordered so a model's in-set FK
    dependencies always precede it. Space and SpaceBackup themselves are excluded, as is
    anything in _EXCLUDED_MODELS (reachable but not actually owned by the space — see its
    comment)."""
    candidates = {m for m in apps.get_models() if m._meta.app_label == 'cookbook'} - {Space, SpaceBackup} - _EXCLUDED_MODELS

    # Pass 1: reachability from Space (BFS), recording the FK path used to reach each model.
    paths = {Space: None}
    frontier = [Space]
    while frontier:
        next_frontier = []
        for current in frontier:
            for model in candidates:
                if model in paths:
                    continue
                for field_name, related in _fk_fields(model):
                    if related is current:
                        prefix = paths[current]
                        paths[model] = field_name if prefix is None else f'{field_name}__{prefix}'
                        next_frontier.append(model)
                        break
        frontier = next_frontier
    reachable = set(paths) - {Space}

    # Pass 2: topological order within the reachable set (Kahn's algorithm, layer by layer,
    # deterministic within a layer so output order is stable across runs).
    ordered = []
    remaining = set(reachable)
    while remaining:
        ready = [m for m in remaining if all(t not in remaining for _name, t in _fk_fields(m))]
        if not ready:
            raise RuntimeError(f'circular FK dependency among space-scoped models: {sorted(m.__name__ for m in remaining)}')
        ready.sort(key=lambda m: m.__name__)
        ordered.extend(ready)
        remaining -= set(ready)

    return [(model, paths[model]) for model in ordered]


def _referenced_pks(model, related_model, rows):
    """All pks referencing `related_model` via any FK or M2M field on `model`, across `rows`."""
    field_names = [(f.name, f.many_to_many) for f in model._meta.get_fields()
                   if f.concrete and f.related_model is related_model and (f.many_to_one or f.many_to_many)]
    pks = set()
    for row in rows:
        for field_name, is_m2m in field_names:
            value = row['fields'].get(field_name)
            if value is None:
                continue
            pks.update(value) if is_m2m else pks.add(value)
    return pks


def build_space_backup(space):
    """Zero-write: serializes every discovered space-scoped model's rows for `space` into a
    single JSON-able dict. Does not touch the database beyond reads.

    User isn't itself space-scoped (accounts are shared instance-wide), so it's never in
    `models` — but rows elsewhere reference User by pk. `users` records username/email for
    every User pk actually referenced anywhere in this backup, so restore can re-link to an
    *existing* target-instance account without needing the User table dumped wholesale.
    `global_refs` does the same for GLOBAL_NATURAL_KEY_FIELDS models (see its comment)."""
    discovered = discover_space_scoped_models()

    models_payload = {}
    referenced_user_pks = set()
    referenced_global_pks = {model: set() for model in GLOBAL_NATURAL_KEY_FIELDS}

    for model, lookup_path in discovered:
        queryset = model.objects.filter(**{lookup_path: space})
        rows = serializers.serialize('python', queryset)
        models_payload[model.__name__] = rows

        referenced_user_pks |= _referenced_pks(model, User, rows)
        for global_model in GLOBAL_NATURAL_KEY_FIELDS:
            referenced_global_pks[global_model] |= _referenced_pks(model, global_model, rows)

    users_payload = {
        str(u.pk): {'username': u.username, 'email': u.email}
        for u in User.objects.filter(pk__in=referenced_user_pks)
    }

    global_refs_payload = {}
    for global_model, natural_field in GLOBAL_NATURAL_KEY_FIELDS.items():
        pks = referenced_global_pks[global_model]
        if not pks:
            continue
        global_refs_payload[global_model.__name__] = {
            str(obj.pk): getattr(obj, natural_field)
            for obj in global_model.objects.filter(pk__in=pks)
        }

    return {
        'tandoor_backup_format': FORMAT_VERSION,
        'created_at': timezone.now().isoformat(),
        'space_name': space.name,
        'models': models_payload,
        'users': users_payload,
        'global_refs': global_refs_payload,
    }


def run_space_backup(space, backup_log):
    """Thread target for SpaceBackupViewSet.create — builds the backup and attaches it to
    `backup_log` (an already-created, running=True SpaceBackup row), matching the existing
    ExportLog/AppExportView background-thread convention. Any failure is recorded in `msg`
    rather than raised, since this runs off the request thread with no one to catch it.

    A background thread has no django_scopes context — the request middleware sets it in
    thread-local state that a new thread doesn't inherit — so every ScopedManager query
    inside build_space_backup would otherwise raise ScopeError. Re-establish it explicitly,
    same as do_export's `with scope(space=self.request.space):`."""
    try:
        with scope(space=space):
            data = build_space_backup(space)
            content = json.dumps(data, cls=DjangoJSONEncoder).encode('utf-8')
            backup_log.total_items = sum(len(rows) for rows in data['models'].values())
            backup_log.processed_items = backup_log.total_items
            backup_log.file_size_kb = len(content) // 1024
            backup_log.file.save(f'space-{space.id}-backup-{backup_log.id}.json', ContentFile(content), save=False)
    except Exception as e:
        backup_log.msg = str(e)
    finally:
        backup_log.running = False
        backup_log.save()
