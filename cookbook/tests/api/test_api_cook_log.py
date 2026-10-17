import datetime
import json
import warnings
from datetime import timedelta

import pytest
from django.contrib import auth
from django.urls import reverse
from django.utils import timezone
from django_scopes import scopes_disabled

from cookbook.models import CookLog, Recipe

LIST_URL = 'api:cooklog-list'
DETAIL_URL = 'api:cooklog-detail'


@pytest.fixture()
def obj_1(space_1, u1_s1, recipe_1_s1):
    return CookLog.objects.create(recipe=recipe_1_s1, created_by=auth.get_user(u1_s1), space=space_1)


@pytest.fixture
def obj_2(space_1, u1_s1, recipe_1_s1):
    return CookLog.objects.create(recipe=recipe_1_s1, created_by=auth.get_user(u1_s1), space=space_1)


@pytest.mark.parametrize("arg", [
    ['a_u', 403],
    ['g1_s1', 403],
    ['u1_s1', 200],
    ['a1_s1', 200],
])
def test_list_permission(arg, request):
    c = request.getfixturevalue(arg[0])
    assert c.get(reverse(LIST_URL)).status_code == arg[1]


def test_list_space(obj_1, obj_2, u1_s1, u1_s2, space_2):
    assert json.loads(u1_s1.get(reverse(LIST_URL)).content)['count'] == 2
    assert json.loads(u1_s2.get(reverse(LIST_URL)).content)['count'] == 0

    obj_1.space = space_2
    obj_1.save()

    assert json.loads(u1_s1.get(reverse(LIST_URL)).content)['count'] == 1
    assert json.loads(u1_s2.get(reverse(LIST_URL)).content)['count'] == 1


@pytest.mark.parametrize("arg", [
    ['a_u', 403],
    ['g1_s1', 403],
    ['u1_s1', 200],
    ['a1_s1', 200],
    ['g1_s2', 403],
    ['u1_s2', 404],
    ['a1_s2', 404],
])
def test_update(arg, request, obj_1):
    c = request.getfixturevalue(arg[0])
    r = c.patch(
        reverse(
            DETAIL_URL,
            args={obj_1.id}
        ),
        {'servings': 2},
        content_type='application/json'
    )
    response = json.loads(r.content)
    assert r.status_code == arg[1]
    if r.status_code == 200:
        assert response['servings'] == 2


@pytest.mark.parametrize("arg", [
    ['a_u', 403],
    ['g1_s1', 403],
    ['u1_s1', 201],
    ['a1_s1', 201],
])
def test_add(arg, request, u1_s2, u2_s1, recipe_1_s1):
    c = request.getfixturevalue(arg[0])
    r = c.post(
        reverse(LIST_URL),
        {'recipe': recipe_1_s1.id},
        content_type='application/json'
    )
    assert r.status_code == arg[1]
    if r.status_code == 201:
        response = json.loads(r.content)
        assert response['recipe'] == recipe_1_s1.id
        r = c.get(reverse(DETAIL_URL, args={response['id']}))
        assert r.status_code == 200
        r = u2_s1.get(reverse(DETAIL_URL, args={response['id']}))
        assert r.status_code == 200
        r = u1_s2.get(reverse(DETAIL_URL, args={response['id']}))
        assert r.status_code == 404


def test_cooklog_serializer_zero_rating_normalized_to_null(u1_s1, recipe_1_s1):
    """rating=0 from the UI (Vuetify clearable v-rating emits 0 on clear) must be
    normalized to NULL at the serializer so the DB invariant is "rating is NULL or 1-5"."""
    r = u1_s1.post(
        reverse(LIST_URL),
        {'recipe': recipe_1_s1.id, 'rating': 0},
        content_type='application/json',
    )
    assert r.status_code == 201
    response = json.loads(r.content)
    assert response['rating'] is None
    with scopes_disabled():
        assert CookLog.objects.get(id=response['id']).rating is None


@pytest.mark.parametrize('bad_rating', [-1, 6, 7, 100])
def test_cooklog_serializer_rejects_out_of_range_rating(u1_s1, recipe_1_s1, bad_rating):
    """Ratings outside 1-5 (other than 0, which normalizes to None) are rejected."""
    r = u1_s1.post(
        reverse(LIST_URL),
        {'recipe': recipe_1_s1.id, 'rating': bad_rating},
        content_type='application/json',
    )
    assert r.status_code == 400


@pytest.mark.parametrize('good_rating', [1, 2, 3, 4, 5, None])
def test_cooklog_serializer_accepts_valid_ratings(u1_s1, recipe_1_s1, good_rating):
    """Ratings 1-5 and None round-trip successfully."""
    r = u1_s1.post(
        reverse(LIST_URL),
        {'recipe': recipe_1_s1.id, 'rating': good_rating},
        content_type='application/json',
    )
    assert r.status_code == 201
    assert json.loads(r.content)['rating'] == good_rating


def test_delete(u1_s1, u1_s2, obj_1):
    r = u1_s2.delete(
        reverse(
            DETAIL_URL,
            args={obj_1.id}
        )
    )
    assert r.status_code == 404

    r = u1_s1.delete(
        reverse(
            DETAIL_URL,
            args={obj_1.id}
        )
    )

    assert r.status_code == 204
    with scopes_disabled():
        assert CookLog.objects.count() == 0


def test_ordering_recipe_name(u1_s1, space_1):
    user = auth.get_user(u1_s1)
    recipe_zzz = Recipe.objects.create(name='zzz_recipe', created_by=user, space=space_1)
    recipe_aaa = Recipe.objects.create(name='aaa_recipe', created_by=user, space=space_1)
    CookLog.objects.create(recipe=recipe_zzz, created_by=user, space=space_1)
    CookLog.objects.create(recipe=recipe_aaa, created_by=user, space=space_1)

    r = json.loads(u1_s1.get(f'{reverse(LIST_URL)}?ordering=recipe__name').content)
    assert r['results'][0]['recipe'] == recipe_aaa.id


def test_query_filters_by_recipe_name(u1_s1, space_1):
    user = auth.get_user(u1_s1)
    recipe_pasta = Recipe.objects.create(name='Pasta Bake', created_by=user, space=space_1)
    recipe_soup = Recipe.objects.create(name='Tomato Soup', created_by=user, space=space_1)
    CookLog.objects.create(recipe=recipe_pasta, created_by=user, space=space_1)
    CookLog.objects.create(recipe=recipe_soup, created_by=user, space=space_1)

    r = json.loads(u1_s1.get(f'{reverse(LIST_URL)}?query=pasta').content)
    assert r['count'] == 1
    assert r['results'][0]['recipe'] == recipe_pasta.id


def test_list_includes_recipe_name(u1_s1, space_1):
    user = auth.get_user(u1_s1)
    recipe = Recipe.objects.create(name='Pasta Bake', created_by=user, space=space_1)
    CookLog.objects.create(recipe=recipe, created_by=user, space=space_1)
    r = json.loads(u1_s1.get(reverse(LIST_URL)).content)
    assert r['results'][0]['recipe_name'] == 'Pasta Bake'


def _cooked(space, user, recipe, ago):
    return CookLog.objects.create(recipe=recipe, created_by=user, space=space, created_at=timezone.now() - ago)


def test_created_after_returns_only_newer_entries(u1_s1, space_1, recipe_1_s1):
    user = auth.get_user(u1_s1)
    _cooked(space_1, user, recipe_1_s1, timedelta(days=10))
    recent = _cooked(space_1, user, recipe_1_s1, timedelta(days=3))
    newest = _cooked(space_1, user, recipe_1_s1, timedelta(hours=1))

    cutoff = (timezone.now() - timedelta(days=5)).isoformat()
    r = json.loads(u1_s1.get(reverse(LIST_URL), {'created_after': cutoff}).content)

    assert r['count'] == 2
    assert {entry['id'] for entry in r['results']} == {recent.id, newest.id}


def test_created_after_includes_an_entry_made_exactly_then(u1_s1, space_1, recipe_1_s1):
    user = auth.get_user(u1_s1)
    moment = timezone.now() - timedelta(days=2)
    _cooked(space_1, user, recipe_1_s1, timedelta(days=9))
    entry = CookLog.objects.create(recipe=recipe_1_s1, created_by=user, space=space_1, created_at=moment)

    r = json.loads(u1_s1.get(reverse(LIST_URL), {'created_after': moment.isoformat()}).content)

    assert [e['id'] for e in r['results']] == [entry.id]


@pytest.mark.parametrize('bad', ['yesterday', '12345', '2026-13-45T00:00:00Z'])
def test_created_after_rejects_an_invalid_timestamp(u1_s1, bad):
    assert u1_s1.get(reverse(LIST_URL), {'created_after': bad}).status_code == 400


def test_created_after_without_an_offset_is_read_as_utc(u1_s1, space_1, recipe_1_s1):
    user = auth.get_user(u1_s1)
    moment = timezone.now() - timedelta(days=2)
    inside = CookLog.objects.create(recipe=recipe_1_s1, created_by=user, space=space_1, created_at=moment)
    CookLog.objects.create(recipe=recipe_1_s1, created_by=user, space=space_1, created_at=moment - timedelta(minutes=1))
    naive = moment.astimezone(datetime.timezone.utc).replace(tzinfo=None).isoformat()

    with warnings.catch_warnings():
        warnings.simplefilter('error', RuntimeWarning)  # Django warns about a naive datetime compared with an aware column
        r = u1_s1.get(reverse(LIST_URL), {'created_after': naive})

    assert r.status_code == 200
    assert [entry['id'] for entry in json.loads(r.content)['results']] == [inside.id]


@pytest.mark.parametrize('hours', [0, 2, -5])
def test_created_after_reads_the_offset_it_is_given(u1_s1, space_1, recipe_1_s1, hours):
    user = auth.get_user(u1_s1)
    moment = timezone.now() - timedelta(days=2)
    inside = CookLog.objects.create(recipe=recipe_1_s1, created_by=user, space=space_1, created_at=moment)
    CookLog.objects.create(recipe=recipe_1_s1, created_by=user, space=space_1, created_at=moment - timedelta(minutes=1))
    written = moment.astimezone(datetime.timezone(timedelta(hours=hours))).isoformat()

    r = json.loads(u1_s1.get(reverse(LIST_URL), {'created_after': written}).content)

    assert [entry['id'] for entry in r['results']] == [inside.id]


def test_created_after_accepts_a_z_suffix(u1_s1, space_1, recipe_1_s1):
    user = auth.get_user(u1_s1)
    moment = timezone.now() - timedelta(days=2)
    inside = CookLog.objects.create(recipe=recipe_1_s1, created_by=user, space=space_1, created_at=moment)
    CookLog.objects.create(recipe=recipe_1_s1, created_by=user, space=space_1, created_at=moment - timedelta(minutes=1))

    r = json.loads(u1_s1.get(reverse(LIST_URL), {'created_after': moment.isoformat().replace('+00:00', 'Z')}).content)

    assert [entry['id'] for entry in r['results']] == [inside.id]


def test_created_after_combines_with_the_recipe_filter(u1_s1, space_1, recipe_1_s1):
    user = auth.get_user(u1_s1)
    other = Recipe.objects.create(name='other recipe', created_by=user, space=space_1)
    recent = _cooked(space_1, user, recipe_1_s1, timedelta(days=1))
    _cooked(space_1, user, recipe_1_s1, timedelta(days=10))
    _cooked(space_1, user, other, timedelta(days=1))

    cutoff = (timezone.now() - timedelta(days=5)).isoformat()
    r = json.loads(u1_s1.get(reverse(LIST_URL), {'created_after': cutoff, 'recipe': recipe_1_s1.id}).content)

    assert [entry['id'] for entry in r['results']] == [recent.id]


def test_created_after_does_not_reveal_another_spaces_entries(u1_s1, u1_s2, space_2):
    theirs = auth.get_user(u1_s2)
    recipe = Recipe.objects.create(name='their recipe', created_by=theirs, space=space_2)
    CookLog.objects.create(recipe=recipe, created_by=theirs, space=space_2)

    cutoff = (timezone.now() - timedelta(days=5)).isoformat()

    assert json.loads(u1_s1.get(reverse(LIST_URL), {'created_after': cutoff}).content)['count'] == 0
    assert json.loads(u1_s2.get(reverse(LIST_URL), {'created_after': cutoff}).content)['count'] == 1
