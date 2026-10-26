import json
import os
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from bs4 import BeautifulSoup
from django.contrib import auth
from django.core.cache import caches
from django.test import RequestFactory
from django.urls import reverse
from django_scopes import scope

from cookbook.helper.ingredient_parser import IngredientParser
from cookbook.helper.recipe_url_import import (clean_dict, clean_instruction_string, get_from_scraper, get_images_from_soup, listify_keywords,
                                               normalize_string, parse_image, parse_instructions, parse_servings, parse_servings_text, parse_time)
from cookbook.models import Automation
from cookbook.tests.conftest import validate_recipe
from cookbook.tests.factories import KeywordFactory

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
    ('4', ''),
    ('8 servings (2 tarts)', 'servings (2 tarts)'),
    (['4', '4 servings'], 'servings'),
    ('x' * 40, 'x' * 32),  # cut to the 32 characters the field holds
])
def test_parse_servings_text(value, expected):
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


def _import_html(client, filename, url):
    with open(os.path.join(os.path.dirname(__file__), 'test_data', filename), 'r', encoding='UTF-8') as page:
        response = client.post(reverse(IMPORT_SOURCE_URL), {'data': page.read(), 'url': url}, content_type='application/json')
    assert response.status_code == 200
    return json.loads(response.content)['recipe']


# Neither page declares a <link rel="canonical">, so the URL the client sent is the only source URL there is.
# The bookmarklet sends the page HTML together with its URL.
@pytest.mark.parametrize("filename, url", [
    ('americastestkitchen.html', 'http://www.americastestkitchen.com/recipes/1771-pasta-with-chicken-broccoli-and-sun-dried-tomatoes'),
    ('cookscountry.html', 'http://www.cookscountry.com/recipes/2202-shrimp-piccata-pasta'),
])
def test_import_html_with_url_keeps_the_supplied_source_url(filename, url, u1_s1):
    assert _import_html(u1_s1, filename, url)['source_url'] == url


def test_import_html_with_url_prefers_the_pages_own_canonical_url(u1_s1):
    recipe = _import_html(u1_s1, 'allrecipes.html', 'https://www.allrecipes.com/some/other/url')
    assert recipe['source_url'] == 'https://www.allrecipes.com/recipe/24010/easy-chicken-marsala/'


# ---------------------------------------------------------------------------------------------------------------------
# Pure helpers of the url importer. Each parametrized row is one input shape a web page or scraper can hand over.
# ---------------------------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("text,expected", [
    ('plain text', 'plain text'),
    ('  padded  ', 'padded'),
    ('<b>bold</b> text', 'bold text'),
    ('Tom &amp; Jerry', 'Tom & Jerry'),
    ('x &#62; y', 'x > y'),
    ('a\xa0b\tc', 'a b c'),
    ('a    b', 'a b'),
    ('line1\n\n\n\nline2', 'line1\n\nline2'),
])
def test_normalize_string(text, expected):
    assert normalize_string(text) == expected


# TODO decision pending on HTML stripping: normalize_string deletes every "<...>" span first and only then looks for "</p>", which is
#  already gone. These rows say what a reader would expect; today paragraphs run together and text between "<" and ">" is deleted.
@pytest.mark.parametrize("text,expected", [
    pytest.param('<p>One</p><p>Two</p>', 'One\nTwo', id='paragraphs run together'),
    pytest.param('Bake until a < b and c > d', 'Bake until a < b and c > d', id='comparison is not a tag'),
])
@pytest.mark.xfail(strict=True, reason='TODO: HTML stripping needs a design decision (see comment above)')
def test_normalize_string_html_stripping(text, expected):
    assert normalize_string(text) == expected


@pytest.mark.parametrize("text,expected", [
    ('<strong>Mix</strong>\nthen bake', '**Mix**  \nthen bake'),
    ('<nobr>5 min</nobr>', '**5 min**'),
    ('line1\nline2', 'line1  \nline2'),
    ('a\n\nb', 'a\n\nb'),
])
def test_clean_instruction_string(text, expected):
    assert clean_instruction_string(text) == expected


@pytest.mark.parametrize("code_point", ['', '', '', '', '', '', '', '', '', '',
                                        '', '', '', '', '', '', '', '', ''])
def test_clean_instruction_string_replaces_thermomix_symbols_with_words(code_point):
    cleaned = clean_instruction_string(f'{code_point} 5 min')
    assert code_point not in cleaned
    assert cleaned.endswith(' 5 min') and len(cleaned) > len(' 5 min')


def test_clean_instruction_string_leaves_other_private_use_characters_alone():
    assert clean_instruction_string(' 5 min') == ' 5 min'


@pytest.mark.parametrize("instructions,expected", [
    ('Mix well.', ['Mix well.']),
    (['Step 1', 'Step 2'], ['Step 1', 'Step 2']),
    ([{'text': 'A'}, {'text': 'B'}], ['A', 'B']),
    ([{'itemListElement': ['A', {'text': 'B'}]}], ['A', 'B']),
    ([{'itemListElement': ['A', {'name': 'no text'}]}], ['A']),
    ([{'name': 'unknown shape'}], ["{'name': 'unknown shape'}"]),
    ([], []),
])
def test_parse_instructions(instructions, expected):
    assert parse_instructions(instructions) == expected


@pytest.mark.parametrize("image,expected", [
    (None, None),
    ('', None),
    ('https://a.example/b.jpg', 'https://a.example/b.jpg'),
    ('/relative.jpg', ''),
    ({'url': 'https://x.example/y.png'}, 'https://x.example/y.png'),
    ({'width': 100}, ''),
    ([{'url': 'https://b.example/2.jpg'}], 'https://b.example/2.jpg'),
    (['/rel.jpg'], ''),
    # the first usable image wins ("take first if so" in the code)
    (['/rel.jpg', 'https://a.example/b.jpg', 'https://c.example/d.jpg'], 'https://a.example/b.jpg'),
    (['https://a.example/1.jpg', {'url': 'https://b.example/2.jpg'}], 'https://a.example/1.jpg'),
    # strings and numbers that merely look like they might carry a "url" key must not crash
    (['/images/url-shot.png'], ''),
    ([1, 'https://a.example/b.jpg'], 'https://a.example/b.jpg'),
])
def test_parse_image(image, expected):
    assert parse_image(image) == expected


@pytest.mark.parametrize("servings,expected", [
    ('4', 4),
    ('4-6 servings', 4),
    ('Serves 4', 4),
    ('', 1),
    ('a dozen', 1),
    (None, None),
    (4, 4),
    ([4, '4 servings'], 4),
    (['6 portions'], 6),
    ([], 1),
])
def test_parse_servings(servings, expected):
    assert parse_servings(servings) == expected


@pytest.mark.parametrize("recipe_time,expected", [
    ('PT45M', 45),
    ('PT1H30M', 90),
    ('PT1H', 60),
    ('P0DT1H', 60),
    ('P1DT2H', 1560),
    ('PT0S', 0),
    ('90', 90),
    ('15 min', 15),
    (90, 90),
    (45.0, 45),
    (None, 0),
    ('', 0),
    ('garbage', 0),
    (['PT20M'], 20),
    ([], 0),
])
def test_parse_time(recipe_time, expected):
    assert parse_time(recipe_time) == expected


@pytest.mark.parametrize("keywords,expected", [
    ('a, b', ['a', 'b']),
    (['a, b'], ['a', 'b']),
    (['a', 'b'], ['a', 'b']),
    ('a,,b', ['a', '', 'b']),  # empty entries are dropped later by parse_keywords
    (['  x  '], ['x']),
    ([{'name': 'x'}], [{'name': 'x'}]),
])
def test_listify_keywords(keywords, expected):
    assert listify_keywords(keywords) == expected


PAGE = 'https://www.example.com/recipes/soup'


@pytest.mark.parametrize("img,page_url,expected", [
    ('<img src="https://cdn.example.com/a/photo.jpg">', PAGE, ['https://cdn.example.com/a/photo.jpg']),
    ('<img src="https://cdn.example.com/a/photo.jpg?w=100&h=50">', PAGE, ['https://cdn.example.com/a/photo.jpg']),
    ('<img src="/img/photo.png">', PAGE, ['https://www.example.com/img/photo.png']),
    ('<img src="photo.png">', PAGE, ['https://www.example.com/recipes/photo.png']),
    ('<img src="//cdn.example.com/x.gif">', PAGE, ['https://cdn.example.com/x.gif']),
    ('<img data-src="https://cdn.example.com/lazy.jpeg">', PAGE, ['https://cdn.example.com/lazy.jpeg']),
    ('<img src="https://cdn.example.com/photo.v2.jpg">', PAGE, ['https://cdn.example.com/photo.v2.jpg']),
    ('<img src="https://cdn.example.com/UPPER.JPG">', PAGE, ['https://cdn.example.com/UPPER.JPG']),
    ('<img src="https://cdn.example.com/modern.webp">', PAGE, ['https://cdn.example.com/modern.webp']),
    ('<img srcset="https://cdn.example.com/a.jpg 1x, https://cdn.example.com/b.jpg 2x">', PAGE,
     ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg']),
    # without a page address a relative path cannot be resolved, so it is left out
    ('<img src="/img/photo.png"><img src="https://cdn.example.com/b.png">', None, ['https://cdn.example.com/b.png']),
    # things that are not picture files
    ('<img src="/img/tracker.php"><img src="data:image/png;base64,AAAA"><img>', PAGE, []),
])
def test_get_images_from_soup(img, page_url, expected):
    assert get_images_from_soup(BeautifulSoup(img, 'html.parser'), page_url) == expected


def test_clean_dict_removes_the_key_at_every_depth():
    data = {'id': 1, 'name': 'a', 'steps': [{'id': 2, 'instruction': 'x', 'ingredients': [{'id': 3, 'food': {'id': 4, 'name': 'f'}}]}]}
    assert clean_dict(data, 'id') == {'name': 'a', 'steps': [{'instruction': 'x', 'ingredients': [{'food': {'name': 'f'}}]}]}


# ---------------------------------------------------------------------------------------------------------------------
# get_from_scraper: one test per branch. Nearly every scraper call falls back to the page's schema.org data and then to a default.
# ---------------------------------------------------------------------------------------------------------------------

class FakeScrape:
    """
    A scraper stand-in. A scraper method given as keyword argument returns its value, or raises it when that is an exception; every other
    method raises, like a scraper that does not support it. `schema` is what the page's schema.org data holds and `url` is scrape.url.
    """

    def __init__(self, schema=None, nutrients=None, url=None, **methods):
        self._methods = methods
        self._url = url

        def schema_nutrients():
            if isinstance(nutrients, Exception):
                raise nutrients
            return nutrients or {}

        self.schema = SimpleNamespace(data=schema or {}, nutrients=schema_nutrients)

    @property
    def url(self):
        if self._url is None:
            raise NotImplementedError('url')
        return self._url

    def __getattr__(self, name):
        if name.startswith('_'):
            raise AttributeError(name)
        value = self._methods.get(name, NotImplementedError(name))

        def method():
            if isinstance(value, Exception):
                raise value
            return value
        return method


@pytest.fixture(autouse=True)
def clear_automation_cache():
    # automation lookups are cached for 30 seconds per space
    caches['default'].clear()


def _space(client):
    return auth.get_user(client).userspace_set.first().space


def scraped(client, scrape):
    request = RequestFactory()
    request.user = auth.get_user(client)
    request.space = _space(client)
    with scope(space=request.space):
        return get_from_scraper(scrape, request)


@pytest.mark.parametrize("scrape,expected", [
    (FakeScrape(canonical_url='https://example.com/r/1'), 'https://example.com/r/1'),
    (FakeScrape(canonical_url=Exception('no'), url='https://example.com/r/2'), 'https://example.com/r/2'),  # scrape.url is the second choice
    (FakeScrape(canonical_url=Exception('no')), ''),
    (FakeScrape(canonical_url='https://urlnotfound.none'), ''),  # the placeholder address is not an address
    (FakeScrape(canonical_url=''), ''),
    (FakeScrape(canonical_url=12345), ''),
])
def test_get_from_scraper_source_url(scrape, expected, u1_s1):
    assert scraped(u1_s1, scrape)['source_url'] == expected


def test_get_from_scraper_adds_the_host_of_the_source_url_as_keyword(u1_s1):
    recipe = scraped(u1_s1, FakeScrape(canonical_url='https://www.example.com/r/1'))
    assert [k['name'] for k in recipe['keywords']] == ['www.example.com']


def test_get_from_scraper_adds_no_host_keyword_without_a_source_url(u1_s1):
    assert scraped(u1_s1, FakeScrape())['keywords'] == []


@pytest.mark.parametrize("methods,schema,expected", [
    ({'title': 'Soup'}, {}, 'Soup'),
    ({'title': '<b>Soup</b> &amp; Bread'}, {}, 'Soup & Bread'),
    ({'title': 'x' * 200}, {}, 'x' * 128),
    ({'title': Exception('no')}, {'name': 'Schema Soup'}, 'Schema Soup'),
    ({'title': ''}, {'name': 'Schema Soup'}, 'Schema Soup'),
    ({'title': Exception('no')}, {'name': ['First', 'Second']}, 'First'),
    ({'title': Exception('no')}, {}, ''),
])
def test_get_from_scraper_name(methods, schema, expected, u1_s1):
    assert scraped(u1_s1, FakeScrape(schema=schema, **methods))['name'] == expected


@pytest.mark.parametrize("methods,schema,expected", [
    ({'description': 'A <b>fine</b> soup'}, {}, 'A fine soup'),
    ({'description': Exception('no')}, {'description': 'Schema text'}, 'Schema text'),
    ({'description': ''}, {'description': 'Schema text'}, 'Schema text'),
    ({'description': Exception('no')}, {}, ''),
    ({'description': 'y' * 600}, {}, 'y' * 512),
])
def test_get_from_scraper_description(methods, schema, expected, u1_s1):
    assert scraped(u1_s1, FakeScrape(schema=schema, **methods))['description'] == expected


@pytest.mark.parametrize("recipe_yield,servings,servings_text", [
    ('4 servings', 4, 'servings'),
    (['6', '6 portions'], 6, 'portions'),
    (None, None, ''),
])
def test_get_from_scraper_servings(recipe_yield, servings, servings_text, u1_s1):
    recipe = scraped(u1_s1, FakeScrape(schema={'recipeYield': recipe_yield}))
    assert (recipe['servings'], recipe['servings_text']) == (servings, servings_text)


@pytest.mark.parametrize("methods,schema,working,waiting", [
    ({'prep_time': 'PT10M', 'cook_time': 'PT20M'}, {}, 10, 20),
    ({'prep_time': Exception('no'), 'cook_time': Exception('no')}, {'prepTime': 'PT15M', 'cookTime': 'PT25M'}, 15, 25),
    ({'prep_time': Exception('no'), 'cook_time': Exception('no')}, {}, 0, 0),
    # without prep and cook time the total time counts as working time
    ({'prep_time': None, 'cook_time': None, 'total_time': 'PT45M'}, {}, 45, 0),
    ({'prep_time': None, 'cook_time': None, 'total_time': Exception('no')}, {'totalTime': 'PT50M'}, 50, 0),
    ({'prep_time': None, 'cook_time': None, 'total_time': Exception('no')}, {}, 0, 0),
    # but not when either of the two is known
    ({'prep_time': 'PT10M', 'cook_time': None, 'total_time': 'PT45M'}, {}, 10, 0),
])
def test_get_from_scraper_times(methods, schema, working, waiting, u1_s1):
    recipe = scraped(u1_s1, FakeScrape(schema=schema, **methods))
    assert (recipe['working_time'], recipe['waiting_time']) == (working, waiting)


@pytest.mark.parametrize("methods,schema,expected", [
    ({'image': 'https://img.example.com/a.jpg'}, {}, 'https://img.example.com/a.jpg'),
    ({'image': ['/rel.jpg', 'https://img.example.com/b.jpg']}, {}, 'https://img.example.com/b.jpg'),
    ({'image': Exception('no')}, {'image': {'url': 'https://img.example.com/c.jpg'}}, 'https://img.example.com/c.jpg'),
    ({'image': None}, {'image': 'https://img.example.com/d.jpg'}, 'https://img.example.com/d.jpg'),
    ({'image': '/relative.jpg'}, {}, ''),
    ({'image': Exception('no')}, {}, ''),
])
def test_get_from_scraper_image(methods, schema, expected, u1_s1):
    assert scraped(u1_s1, FakeScrape(schema=schema, **methods))['image_url'] == expected


@pytest.mark.parametrize("methods,schema,expected", [
    ({}, {'keywords': 'Soup, Easy'}, {'soup', 'easy'}),
    ({}, {'keywords': ['Soup, Easy']}, {'soup', 'easy'}),
    ({}, {'keywords': ['Soup', 'Easy', 'soup']}, {'soup', 'easy'}),
    ({'category': 'Dinner'}, {}, {'dinner'}),
    ({'category': 'Dinner, Soup'}, {}, {'dinner', 'soup'}),
    ({'category': Exception('no')}, {'recipeCategory': 'Lunch'}, {'lunch'}),
    ({'cuisine': 'Italian'}, {}, {'italian'}),
    ({'cuisine': Exception('no')}, {'recipeCuisine': ['Thai']}, {'thai'}),
    ({'author': 'Jo Cook'}, {}, {'jo cook'}),
    ({'author': Exception('no')}, {}, set()),
    ({'category': 'Dinner', 'cuisine': 'Italian', 'author': 'Jo'}, {'keywords': 'quick'}, {'dinner', 'italian', 'jo', 'quick'}),
])
def test_get_from_scraper_keywords(methods, schema, expected, u1_s1):
    recipe = scraped(u1_s1, FakeScrape(schema=schema, **methods))
    assert {k['name'] for k in recipe['keywords']} == expected


def test_get_from_scraper_knows_which_keywords_exist_already(u1_s1):
    space = _space(u1_s1)
    with scope(space=space):
        existing = KeywordFactory(name='soup', space=space)
    recipe = scraped(u1_s1, FakeScrape(schema={'keywords': 'Soup, Brand New'}))
    by_name = {k['name']: k for k in recipe['keywords']}
    assert by_name['soup']['import_keyword'] is True and by_name['soup']['id'] == existing.id
    assert by_name['brand new']['import_keyword'] is False and 'id' not in by_name['brand new']


def test_get_from_scraper_applies_keyword_aliases(u1_s1):
    space = _space(u1_s1)
    with scope(space=space):
        Automation.objects.create(name='alias', type=Automation.KEYWORD_ALIAS, param_1='easy', param_2='simple', created_by=auth.get_user(u1_s1), space=space)
    recipe = scraped(u1_s1, FakeScrape(schema={'keywords': 'Easy, Soup'}))
    assert {k['name'] for k in recipe['keywords']} == {'simple', 'soup'}


def test_get_from_scraper_keeps_keywords_that_come_as_objects(u1_s1):
    recipe = scraped(u1_s1, FakeScrape(schema={'keywords': [{'name': 'soup'}]}))
    assert recipe['keywords'] == [{'name': 'soup'}]


def test_get_from_scraper_makes_one_step_per_instruction(u1_s1):
    recipe = scraped(u1_s1, FakeScrape(instructions_list=['Chop.', 'Boil.', '<strong>Serve</strong> hot']))
    assert [s['instruction'] for s in recipe['steps']] == ['Chop.', 'Boil.', '**Serve** hot']
    assert all(s['ingredients'] == [] for s in recipe['steps'])


@pytest.mark.parametrize("instructions", [Exception('no'), [], ''])
def test_get_from_scraper_always_has_a_step(instructions, u1_s1):
    recipe = scraped(u1_s1, FakeScrape(instructions_list=instructions))
    assert [s['instruction'] for s in recipe['steps']] == ['']


def test_get_from_scraper_puts_a_long_description_in_front_of_the_first_step(u1_s1):
    recipe = scraped(u1_s1, FakeScrape(description='word ' * 60, instructions_list=['Chop.', 'Boil.']))
    assert recipe['steps'][0]['instruction'] == f"*{recipe['description']}*  \n\nChop."
    assert recipe['steps'][1]['instruction'] == 'Boil.'


def test_get_from_scraper_leaves_a_short_description_out_of_the_steps(u1_s1):
    recipe = scraped(u1_s1, FakeScrape(description='short', instructions_list=['Chop.']))
    assert recipe['steps'][0]['instruction'] == 'Chop.'


def test_get_from_scraper_puts_all_ingredients_in_the_first_step(u1_s1):
    recipe = scraped(u1_s1, FakeScrape(ingredients=['2 cups flour', '1 tsp salt'], instructions_list=['Mix.', 'Bake.']))
    assert [i['original_text'] for i in recipe['steps'][0]['ingredients']] == ['2 cups flour', '1 tsp salt']
    assert recipe['steps'][1]['ingredients'] == []
    assert recipe['steps'][0]['ingredients'][0]['amount'] == 2
    assert recipe['steps'][0]['ingredients'][0]['food']['name'] == 'flour'


def test_get_from_scraper_skips_blank_ingredient_lines(u1_s1):
    recipe = scraped(u1_s1, FakeScrape(ingredients=['', '   ', '1 cup flour']))
    assert [i['original_text'] for i in recipe['steps'][0]['ingredients']] == ['1 cup flour']


# an ingredient with an unusual name must never be dropped (the chefkoch2 page was added for exactly this)
@pytest.mark.parametrize("line", ['2 Ei(er) , getrennt', '6 Tomate(n) , getrocknet', '½ cup flour', 'salt', '1/2 tsp, pepper', '-', '(optional)'])
def test_get_from_scraper_keeps_every_ingredient_line(line, u1_s1):
    recipe = scraped(u1_s1, FakeScrape(ingredients=[line]))
    assert [i['original_text'] for i in recipe['steps'][0]['ingredients']] == [line]


def test_get_from_scraper_keeps_an_ingredient_whose_food_name_is_empty(u1_s1):
    with patch.object(IngredientParser, 'parse', return_value=(1, 'cup', '', '')):
        recipe = scraped(u1_s1, FakeScrape(ingredients=['1 cup']))
    assert recipe['steps'][0]['ingredients'] == [{'amount': 1, 'food': {'name': ''}, 'unit': {'name': 'cup'}, 'note': '', 'original_text': '1 cup'}]


def test_get_from_scraper_leaves_the_unit_out_when_there_is_none(u1_s1):
    with patch.object(IngredientParser, 'parse', return_value=(2, '', 'eggs', '')):
        recipe = scraped(u1_s1, FakeScrape(ingredients=['2 eggs']))
    assert recipe['steps'][0]['ingredients'][0]['unit'] is None


def test_get_from_scraper_falls_back_to_the_raw_text_when_an_ingredient_cannot_be_parsed(u1_s1):
    with patch.object(IngredientParser, 'parse', side_effect=Exception('boom')):
        recipe = scraped(u1_s1, FakeScrape(ingredients=['some odd line']))
    assert recipe['steps'][0]['ingredients'] == [{'amount': 0, 'unit': None, 'food': {'name': 'some odd line'}, 'note': '', 'original_text': 'some odd line'}]


def test_get_from_scraper_survives_a_scraper_that_cannot_list_ingredients(u1_s1):
    recipe = scraped(u1_s1, FakeScrape(ingredients=Exception('no'), instructions_list=['Mix.']))
    assert recipe['steps'][0]['ingredients'] == []


def test_get_from_scraper_returns_a_complete_recipe_when_every_scraper_call_fails(u1_s1):
    recipe = scraped(u1_s1, FakeScrape())
    assert recipe == {
        'internal': True, 'source_url': '', 'name': '', 'description': '', 'servings': None, 'servings_text': '', 'working_time': 0, 'waiting_time': 0,
        'image_url': '', 'keywords': [], 'steps': [{'instruction': '', 'ingredients': []}], 'properties': [],
    }


@pytest.mark.parametrize("source_pattern,canonical_url,applied", [
    ('.*example.com.*', 'https://www.example.com/r/1', True),
    ('.*other.com.*', 'https://www.example.com/r/1', False),
    ('.*', 'https://www.example.com/r/1', True),
    ('.*', Exception('no'), True),  # without a source address only rules that match everything apply
    ('.*example.com.*', Exception('no'), False),
])
def test_get_from_scraper_applies_regex_replacements_to_matching_sources(source_pattern, canonical_url, applied, u1_s1):
    space, user = _space(u1_s1), auth.get_user(u1_s1)
    with scope(space=space):
        for automation_type, pattern, replacement in [(Automation.NAME_REPLACE, 'soup', 'Stew'), (Automation.DESCRIPTION_REPLACE, 'tasty', 'great'),
                                                      (Automation.INSTRUCTION_REPLACE, 'boil', 'simmer')]:
            Automation.objects.create(name=automation_type, type=automation_type, param_1=source_pattern, param_2=pattern, param_3=replacement, created_by=user, space=space)
    recipe = scraped(u1_s1, FakeScrape(canonical_url=canonical_url, title='Soup', description='A tasty dish', instructions_list=['Boil it']))
    expected = ('Stew', 'A great dish', 'simmer it') if applied else ('Soup', 'A tasty dish', 'Boil it')
    assert (recipe['name'], recipe['description'], recipe['steps'][0]['instruction']) == expected
