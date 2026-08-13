"""API layer for Part 2 (sub-phase 2c) of the pantry-expiration-and-data-portability plan.
Thin HTTP wrapper around cookbook.helper.portable_data / cookbook.helper.portable_import,
already covered at the helper-function level in test_portable_export.py / test_portable_import.py
— these tests focus on the request/response contract, permissions, and space scoping.
"""
import json

import pytest
from django.contrib import auth
from django.urls import reverse
from django_scopes import scopes_disabled

from cookbook.helper.portable_data import FORMAT_VERSION
from cookbook.models import Food, Keyword
from cookbook.tests.factories import FoodFactory, KeywordFactory

EXPORT_URL = 'api_export_portable_data'
IMPORT_URL = 'api_import_portable_data'


@pytest.mark.django_db
def test_export_returns_envelope_with_seeded_food(u1_s1, space_1):
    with scopes_disabled():
        FoodFactory(space=space_1, name='Carrot')

    r = u1_s1.post(reverse(EXPORT_URL), {}, content_type='application/json')
    assert r.status_code == 200
    body = json.loads(r.content)
    assert body['tandoor_export_format'] == FORMAT_VERSION
    names = {f['name'] for f in body['content']['foods']}
    assert names == {'Carrot'}


@pytest.mark.django_db
def test_export_respects_scope_flags(u1_s1, space_1):
    with scopes_disabled():
        FoodFactory(space=space_1, name='Carrot')
        KeywordFactory(space=space_1, name='Vegetable')

    r = u1_s1.post(reverse(EXPORT_URL), {'include_keywords': False}, content_type='application/json')
    assert r.status_code == 200
    body = json.loads(r.content)
    assert body['content']['foods'] != []
    assert body['content']['keywords'] == []


@pytest.mark.django_db
def test_export_is_scoped_to_space(u1_s1, space_1, space_2):
    with scopes_disabled():
        FoodFactory(space=space_1, name='InSpace1')
        FoodFactory(space=space_2, name='InSpace2')

    r = u1_s1.post(reverse(EXPORT_URL), {}, content_type='application/json')
    body = json.loads(r.content)
    names = {f['name'] for f in body['content']['foods']}
    assert names == {'InSpace1'}


@pytest.mark.django_db
def test_export_anonymous_forbidden(a_u):
    r = a_u.post(reverse(EXPORT_URL), {}, content_type='application/json')
    assert r.status_code == 403


@pytest.mark.django_db
def test_import_analyze_mode_performs_zero_writes(u1_s1, space_1):
    envelope = {
        'tandoor_export_format': FORMAT_VERSION,
        'exported_at': '2026-01-01T00:00:00',
        'content': {'foods': [{
            'natural_key': 'Carrot', 'name': 'Carrot', 'parent_natural_key': None, 'description': '',
            'url': '', 'ignore_shopping': False, 'substitute_siblings': False, 'substitute_children': False,
            'shelf_life_days': None, 'shelf_life_days_frozen': None, 'shelf_life_days_opened': None,
            'shopping_amount': None, 'fdc_id': None, 'open_data_slug': None, 'supermarket_category': None,
            'substitute': [], 'properties': [], 'inherit_fields': [], 'child_inherit_fields': [],
        }], 'keywords': [], 'books': [], 'warnings': []},
    }

    r = u1_s1.post(reverse(IMPORT_URL), {'mode': 'analyze', 'export': envelope}, content_type='application/json')
    assert r.status_code == 200
    body = json.loads(r.content)
    assert body['foods']['new'] == ['Carrot']
    with scopes_disabled():
        assert not Food.objects.filter(space=space_1, name='Carrot').exists()


@pytest.mark.django_db
def test_import_apply_mode_creates_food_and_keyword(u1_s1, space_1):
    envelope = {
        'tandoor_export_format': FORMAT_VERSION,
        'exported_at': '2026-01-01T00:00:00',
        'content': {
            'foods': [{
                'natural_key': 'Carrot', 'name': 'Carrot', 'parent_natural_key': None, 'description': '',
                'url': '', 'ignore_shopping': False, 'substitute_siblings': False, 'substitute_children': False,
                'shelf_life_days': None, 'shelf_life_days_frozen': None, 'shelf_life_days_opened': None,
                'shopping_amount': None, 'fdc_id': None, 'open_data_slug': None, 'supermarket_category': None,
                'substitute': [], 'properties': [], 'inherit_fields': [], 'child_inherit_fields': [],
            }],
            'keywords': [{'natural_key': 'Vegetable', 'name': 'Vegetable', 'parent_natural_key': None, 'description': ''}],
            'books': [], 'warnings': [],
        },
    }

    r = u1_s1.post(reverse(IMPORT_URL), {'mode': 'apply', 'export': envelope}, content_type='application/json')
    assert r.status_code == 200
    body = json.loads(r.content)
    assert body['foods']['created'] == 1
    assert body['keywords']['created'] == 1
    with scopes_disabled():
        assert Food.objects.filter(space=space_1, name='Carrot').exists()
        assert Keyword.objects.filter(space=space_1, name='Vegetable').exists()


@pytest.mark.django_db
def test_import_apply_mode_uses_request_user_for_new_book(u1_s1, space_1):
    user = auth.get_user(u1_s1)
    envelope = {
        'tandoor_export_format': FORMAT_VERSION,
        'exported_at': '2026-01-01T00:00:00',
        'content': {'foods': [], 'keywords': [],
                    'books': [{'name': 'Baking', 'description': '', 'order': 0, 'entries': []}],
                    'warnings': []},
    }

    r = u1_s1.post(reverse(IMPORT_URL), {'mode': 'apply', 'export': envelope}, content_type='application/json')
    assert r.status_code == 200
    with scopes_disabled():
        from cookbook.models import RecipeBook
        book = RecipeBook.objects.get(space=space_1, name='Baking')
        assert book.created_by_id == user.id


@pytest.mark.django_db
def test_import_rejects_invalid_envelope(u1_s1, space_1):
    r = u1_s1.post(reverse(IMPORT_URL), {'mode': 'analyze', 'export': {'not': 'valid'}}, content_type='application/json')
    assert r.status_code == 400


@pytest.mark.django_db
def test_import_rejects_invalid_mode(u1_s1, space_1):
    envelope = {'tandoor_export_format': FORMAT_VERSION, 'exported_at': '2026-01-01T00:00:00',
                'content': {'foods': [], 'keywords': [], 'books': [], 'warnings': []}}
    r = u1_s1.post(reverse(IMPORT_URL), {'mode': 'bogus', 'export': envelope}, content_type='application/json')
    assert r.status_code == 400


@pytest.mark.django_db
def test_import_anonymous_forbidden(a_u):
    r = a_u.post(reverse(IMPORT_URL), {'mode': 'analyze', 'export': {}}, content_type='application/json')
    assert r.status_code == 403
