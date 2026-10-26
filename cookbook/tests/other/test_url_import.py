import json
import os
from unittest.mock import MagicMock, patch

import pytest
from bs4 import BeautifulSoup
from django.urls import reverse

from cookbook.helper.recipe_url_import import (clean_dict, clean_instruction_string, get_images_from_soup, listify_keywords, normalize_string, parse_image,
                                               parse_instructions, parse_servings, parse_servings_text, parse_time)
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
