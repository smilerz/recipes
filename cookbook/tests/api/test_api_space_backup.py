"""API layer for Part 3, sub-phase 3c of the pantry-expiration-and-data-portability plan.
Thin HTTP wrapper around cookbook.helper.space_backup / cookbook.helper.space_restore,
already covered at the helper-function level in test_space_backup.py / test_space_restore.py
— these tests focus on the request/response contract, permissions, and space scoping.
"""
import json

import pytest
from django.contrib import auth
from django.core.serializers.json import DjangoJSONEncoder
from django.urls import reverse
from django_scopes import scopes_disabled

from cookbook.models import Food, SpaceBackup
from cookbook.tests.factories import FoodFactory

LIST_URL = 'api:spacebackup-list'
DETAIL_URL = 'api:spacebackup-detail'
RESTORE_URL = 'api:spacebackup-restore'
RESTORE_PREVIEW_URL = 'api:spacebackup-restore-preview'


def _make_ready_backup(space, user):
    from django.core.files.base import ContentFile
    from cookbook.helper.space_backup import build_space_backup

    backup_data = build_space_backup(space)
    content = json.dumps(backup_data, cls=DjangoJSONEncoder).encode('utf-8')
    backup = SpaceBackup.objects.create(space=space, created_by=user, running=False)
    backup.file.save('test-backup.json', ContentFile(content))
    return backup


@pytest.mark.parametrize("arg", [
    ['a_u', 403],
    ['g1_s1', 403],
    ['u1_s1', 403],
    ['a1_s1', 201],
    ['s1_s1', 201],
])
@pytest.mark.django_db
def test_create_backup_permission(arg, request):
    c = request.getfixturevalue(arg[0])
    r = c.post(reverse(LIST_URL), {}, content_type='application/json')
    assert r.status_code == arg[1]


@pytest.mark.django_db
def test_create_backup_returns_a_backup_row(a1_s1, space_1):
    r = a1_s1.post(reverse(LIST_URL), {}, content_type='application/json')
    assert r.status_code == 201
    body = json.loads(r.content)
    assert body['id']
    with scopes_disabled():
        assert SpaceBackup.objects.filter(pk=body['id'], space=space_1).exists()


@pytest.mark.django_db
def test_run_space_backup_populates_file_and_counts(a1_s1, space_1):
    # run_space_backup is the create() view's background-thread target. A real DB-backed
    # thread can't be exercised under standard @pytest.mark.django_db test-transaction
    # isolation (a second connection can't see the test's uncommitted data) — matching the
    # rest of this codebase's convention (e.g. recipe export's do_export tests), call the
    # work function directly and synchronously instead of testing through threading.Thread.
    from cookbook.helper.space_backup import run_space_backup

    with scopes_disabled():
        FoodFactory(space=space_1, name='Carrot')
        backup = SpaceBackup.objects.create(created_by=auth.get_user(a1_s1), space=space_1)
        run_space_backup(space_1, backup)

        backup.refresh_from_db()
        assert backup.running is False
        assert backup.file
        assert backup.total_items > 0


@pytest.mark.django_db
def test_list_backups_is_space_scoped(a1_s1, space_1, space_2):
    with scopes_disabled():
        SpaceBackup.objects.create(space=space_1, created_by=auth.get_user(a1_s1))
        SpaceBackup.objects.create(space=space_2, created_by=auth.get_user(a1_s1))

    r = a1_s1.get(reverse(LIST_URL))
    assert r.status_code == 200
    body = json.loads(r.content)
    results = body['results'] if 'results' in body else body
    assert len(results) == 1


@pytest.mark.parametrize("arg", [
    ['a_u', 403],
    ['g1_s1', 403],
    ['u1_s1', 403],
    ['a1_s1', 200],
])
@pytest.mark.django_db
def test_restore_permission(arg, request, space_1):
    with scopes_disabled():
        with_admin = request.getfixturevalue('a1_s1')
        backup = _make_ready_backup(space_1, auth.get_user(with_admin))

    c = request.getfixturevalue(arg[0])
    r = c.post(reverse(RESTORE_URL, args=[backup.pk]), {}, content_type='application/json')
    assert r.status_code == arg[1]


@pytest.mark.django_db
def test_restore_creates_new_space_with_data(a1_s1, space_1):
    with scopes_disabled():
        FoodFactory(space=space_1, name='Restorable Carrot')
        backup = _make_ready_backup(space_1, auth.get_user(a1_s1))

    r = a1_s1.post(reverse(RESTORE_URL, args=[backup.pk]), {}, content_type='application/json')
    assert r.status_code == 200
    body = json.loads(r.content)
    assert body['space_id']
    with scopes_disabled():
        assert Food.objects.filter(space_id=body['space_id'], name='Restorable Carrot').exists()


@pytest.mark.django_db
def test_restore_rejects_a_still_running_backup(a1_s1, space_1):
    with scopes_disabled():
        backup = SpaceBackup.objects.create(space=space_1, created_by=auth.get_user(a1_s1), running=True)

    r = a1_s1.post(reverse(RESTORE_URL, args=[backup.pk]), {}, content_type='application/json')
    assert r.status_code == 400


@pytest.mark.django_db
def test_restore_preview_lists_model_counts_and_users(a1_s1, space_1):
    from cookbook.models import Space
    with scopes_disabled():
        FoodFactory(space=space_1, name='Preview Carrot')
        backup = _make_ready_backup(space_1, auth.get_user(a1_s1))
        space_count_before = Space.objects.count()

    r = a1_s1.post(reverse(RESTORE_PREVIEW_URL, args=[backup.pk]), {}, content_type='application/json')
    assert r.status_code == 200
    body = json.loads(r.content)
    assert body['model_counts']['Food'] == 1
    with scopes_disabled():
        # zero-write — a preview must never create a new space, unlike restore
        assert Space.objects.count() == space_count_before
