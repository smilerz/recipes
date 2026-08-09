import json

import pytest
from django.urls import reverse

from cookbook.models import ShoppingList

LIST_URL = 'api:shoppinglist-list'
DETAIL_URL = 'api:shoppinglist-detail'


@pytest.fixture
def obj_1(space_1, u1_s1):
    return ShoppingList.objects.get_or_create(name='Weekly Groceries', space=space_1)[0]


@pytest.fixture
def obj_2(space_1, u1_s1):
    return ShoppingList.objects.get_or_create(name='Party Supplies', space=space_1)[0]


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


def test_list_search(obj_1, obj_2, u1_s1):
    # feat-list-shopping-list-tc14/tc15: the search box updated the URL but the query
    # never reached the API - ShoppingListViewSet extended plain viewsets.ModelViewSet
    # instead of StandardFilterModelViewSet (the shared query->name__icontains mixin
    # every other simple named model, e.g. Supermarket, already uses), so there was no
    # search filtering on the backend at all regardless of what the frontend sent.
    r = u1_s1.get(reverse(LIST_URL))
    assert r.status_code == 200
    assert json.loads(r.content)['count'] == 2

    response = json.loads(u1_s1.get(f'{reverse(LIST_URL)}?query=zzznonexistent').content)
    assert response['count'] == 0

    response = json.loads(u1_s1.get(f'{reverse(LIST_URL)}?query={obj_1.name[:6]}').content)
    assert response['count'] == 1
