import json

import pytest
from django.urls import reverse

from cookbook.tests.factories import InventoryLocationFactory

LIST_URL = 'api:inventorylocation-list'


def get_result_names(response):
    return [e['name'] for e in json.loads(response.content)['results']]


# Defect found during UAT: InventoryLocationViewSet.get_queryset() was a bare
# `.filter(space=...)` — no `query` param handling (unlike sibling model viewsets, which extend
# FuzzyFilterMixin) and no ORDER BY, so location pickers silently returned "No Results" for a
# location outside the default page, and the reachable subset was non-deterministic across
# requests once a space had more locations than the page size.
@pytest.mark.django_db
def test_query_param_filters_by_name(u1_s1, space_1):
    match = InventoryLocationFactory(space=space_1, name='UAT-PEL Pantry')
    other = InventoryLocationFactory(space=space_1, name='Bar Cart')

    names = get_result_names(u1_s1.get(reverse(LIST_URL), {'query': 'UAT-PEL Pantry'}))

    assert match.name in names
    assert other.name not in names


@pytest.mark.django_db
def test_list_is_deterministically_ordered_by_name(u1_s1, space_1):
    InventoryLocationFactory(space=space_1, name='Zebra Shelf')
    InventoryLocationFactory(space=space_1, name='Apple Bin')
    InventoryLocationFactory(space=space_1, name='Mango Rack')

    names = get_result_names(u1_s1.get(reverse(LIST_URL), {'page_size': 100}))

    assert names == sorted(names, key=str.lower)
