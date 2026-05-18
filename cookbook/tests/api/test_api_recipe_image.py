import json

import pytest
from django.contrib import auth
from django.urls import reverse
from django_scopes import scopes_disabled

from cookbook.models import RecipeImage

LIST_URL = 'api:recipeimage-list'
DETAIL_URL = 'api:recipeimage-detail'


@pytest.fixture()
def img_1(space_1, u1_s1, recipe_1_s1):
    return RecipeImage.objects.create(
        recipe=recipe_1_s1,
        file='recipes/test.jpg',
        is_primary=True,
        order=0,
        created_by=auth.get_user(u1_s1),
        space=space_1,
    )


@pytest.mark.parametrize("arg", [
    ['a_u', 403],
    ['g1_s1', 403],
    ['u1_s1', 200],
    ['a1_s1', 200],
])
def test_list_permission(arg, request):
    c = request.getfixturevalue(arg[0])
    assert c.get(reverse(LIST_URL)).status_code == arg[1]


def test_list_space(u1_s1, u1_s2, img_1):
    assert json.loads(u1_s1.get(reverse(LIST_URL)).content)['count'] == 1
    assert json.loads(u1_s2.get(reverse(LIST_URL)).content)['count'] == 0


def test_list_filter_by_recipe(u1_s1, img_1, recipe_2_s1, space_1):
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        img2 = RecipeImage.objects.create(
            recipe=recipe_2_s1,
            file='recipes/r2.jpg',
            is_primary=True,
            order=0,
            created_by=user,
            space=space_1,
        )

    url = reverse(LIST_URL) + f'?recipe={img_1.recipe_id}'
    results = json.loads(u1_s1.get(url).content)
    assert results['count'] == 1
    assert results['results'][0]['recipe'] == img_1.recipe_id


@pytest.mark.parametrize("arg", [
    ['a_u', 403],
    ['g1_s1', 403],
    ['u1_s1', 200],
    ['a1_s1', 200],
    ['u1_s2', 404],
])
def test_detail_permission(arg, request, img_1):
    c = request.getfixturevalue(arg[0])
    assert c.get(reverse(DETAIL_URL, args=[img_1.id])).status_code == arg[1]


def test_patch_crop_data(u1_s1, img_1):
    r = u1_s1.patch(
        reverse(DETAIL_URL, args=[img_1.id]),
        {'crop_data': {'x': 10, 'y': 20, 'width': 80, 'height': 60}},
        content_type='application/json',
    )
    assert r.status_code == 200
    assert json.loads(r.content)['crop_data'] == {'x': 10, 'y': 20, 'width': 80, 'height': 60}


def test_delete(u1_s1, img_1):
    r = u1_s1.delete(reverse(DETAIL_URL, args=[img_1.id]))
    assert r.status_code == 204
    with scopes_disabled():
        assert not RecipeImage.objects.filter(pk=img_1.id).exists()


def test_cross_space_access_rejected(u1_s2, img_1):
    r = u1_s2.get(reverse(DETAIL_URL, args=[img_1.id]))
    assert r.status_code == 404


