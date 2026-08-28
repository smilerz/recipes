import json
import os
from unittest.mock import MagicMock, patch

import pytest
from django.urls import reverse

from cookbook.tests.conftest import validate_recipe

from ._recipes import (ALLRECIPES, AMERICAS_TEST_KITCHEN, CHEF_KOCH, CHEF_KOCH2, COOKPAD,
                       COOKS_COUNTRY, DELISH, FOOD_NETWORK, GIALLOZAFFERANO, JOURNAL_DES_FEMMES,
                       MADAME_DESSERT, MARMITON, TASTE_OF_HOME, THE_SPRUCE_EATS, TUDOGOSTOSO)

IMPORT_SOURCE_URL = 'api_recipe_from_source'
DATA_DIR = "cookbook/tests/other/test_data/"


# These were chosen arbitrarily from:
# Top 10 recipe websites listed here https://www.similarweb.com/top-websites/category/food-and-drink/cooking-and-recipes/
# plus the test that previously existed
# plus the custom scraper that was created
# plus any specific defects discovered along the way
RECIPES = [
    ALLRECIPES,
    AMERICAS_TEST_KITCHEN,
    CHEF_KOCH,
    CHEF_KOCH2,  # test for empty ingredient in ingredient_parser
    COOKPAD,
    COOKS_COUNTRY,
    DELISH,
    FOOD_NETWORK,
    GIALLOZAFFERANO,
    JOURNAL_DES_FEMMES,
    MADAME_DESSERT,  # example of json only source
    MARMITON,
    TASTE_OF_HOME,
    THE_SPRUCE_EATS,  # example of non-json recipes_scraper
    TUDOGOSTOSO,
]


@pytest.mark.parametrize("arg", [
    ['a_u', 403],
    ['g1_s1', 403],
    ['u1_s1', 405],
    ['a1_s1', 405],
])
def test_import_permission(arg, request):
    c = request.getfixturevalue(arg[0])
    assert c.get(reverse(IMPORT_SOURCE_URL)).status_code == arg[1]


@pytest.mark.parametrize("status_code", [403, 404, 500])
def test_url_import_returns_error_on_non_ok_response(status_code, u1_s1):
    mock_resp = MagicMock()
    mock_resp.ok = False
    mock_resp.status_code = status_code

    with patch('cookbook.views.api.safe_request', return_value=mock_resp):
        response = u1_s1.post(
            reverse(IMPORT_SOURCE_URL),
            {'url': 'https://example.com/recipe'},
            content_type='application/json',
        )
    assert response.status_code == 400
    data = json.loads(response.content)
    assert data['error'] is True
    assert str(status_code) in data['msg']


def test_url_import_sends_accept_header(u1_s1):
    mock_resp = MagicMock()
    mock_resp.ok = True
    mock_resp.content = b'<html><body>no recipe here</body></html>'

    with patch('cookbook.views.api.safe_request', return_value=mock_resp) as mock_request:
        u1_s1.post(
            reverse(IMPORT_SOURCE_URL),
            {'url': 'https://example.com/recipe'},
            content_type='application/json',
        )
    mock_request.assert_called_once()
    headers = mock_request.call_args.kwargs.get('headers', {})
    assert 'Accept' in headers


@pytest.mark.parametrize("value,expected", [
    (None, ''),
    ('', ''),
    ('Serves 4', 'Serves'),
    ('4 servings', 'servings'),
    (4, '4'),
    (['foo', 'bar'], 'bar'),
])
def test_parse_servings_text(value, expected):
    from cookbook.helper.recipe_url_import import parse_servings_text
    assert parse_servings_text(value) == expected


class FakeScrapeUrlTotalFailure:
    """Minimal scrape stand-in where both canonical_url() and .url raise -
    exercises get_from_scraper's source_url extraction when every attempt fails."""

    def canonical_url(self):
        raise Exception('canonical_url not implemented')

    @property
    def url(self):
        raise Exception('url not implemented')

    def title(self):
        return 'Test Recipe'

    def description(self):
        return ''

    def prep_time(self):
        return None

    def cook_time(self):
        return None

    def total_time(self):
        return None

    def image(self):
        return None

    def category(self):
        raise NotImplementedError

    def cuisine(self):
        raise NotImplementedError

    def author(self):
        raise NotImplementedError

    def instructions_list(self):
        return ['Step 1']

    def ingredients(self):
        return []

    class schema:
        data = {}

        @staticmethod
        def nutrients():
            return {}


def test_get_from_scraper_does_not_crash_when_url_extraction_totally_fails(u1_s1):
    from django.contrib import auth
    from django.test import RequestFactory
    from django_scopes import scope

    from cookbook.helper.recipe_url_import import get_from_scraper

    user = auth.get_user(u1_s1)
    space = user.userspace_set.first().space
    request = RequestFactory()
    request.user = user
    request.space = space

    with scope(space=space):
        recipe_json = get_from_scraper(FakeScrapeUrlTotalFailure(), request)

    assert recipe_json['source_url'] == ''


def test_source_import_step_serializer_defaults_name_to_empty_string():
    from cookbook.serializer import SourceImportStepSerializer
    step = {'instruction': 'mix', 'ingredients': []}
    assert SourceImportStepSerializer(step).data['name'] == ''


def test_source_import_step_serializer_preserves_given_name():
    from cookbook.serializer import SourceImportStepSerializer
    step = {'name': 'Prep', 'instruction': 'mix', 'ingredients': []}
    assert SourceImportStepSerializer(step).data['name'] == 'Prep'


@pytest.mark.parametrize("arg", RECIPES, ids=[x['file'][0] for x in RECIPES])
def test_recipe_import(arg, u1_s1):
    url = arg['url']
    for f in list(arg['file']):  # url and files get popped later
        if 'cookbook' in os.getcwd():
            test_file = os.path.join(os.getcwd(), 'other', 'test_data', f)
        else:
            test_file = os.path.join(os.getcwd(), 'cookbook', 'tests', 'other', 'test_data', f)
        with open(test_file, 'r', encoding='UTF-8') as d:
            response = u1_s1.post(
                reverse(IMPORT_SOURCE_URL),
                {
                    'data': d.read(),
                    'url': url,
                },
                content_type='application/json')
        recipe = json.loads(response.content)['recipe']
        validate_recipe(arg, recipe)
