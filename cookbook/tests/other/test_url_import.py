import json
import time
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
import requests
from bs4 import BeautifulSoup
from django.contrib import auth
from django.core.cache import caches
from django.test import RequestFactory
from django.urls import reverse
from django_scopes import scope

from cookbook.helper.ingredient_parser import IngredientParser
from cookbook.helper.recipe_url_import import (clean_dict, clean_instruction_string, get_from_scraper, get_images_from_soup, get_recipe_properties,
                                               listify_keywords, normalize_string, parse_image, parse_instructions, parse_servings, parse_servings_text,
                                               parse_time)
from cookbook.models import Automation, PropertyType
from cookbook.tests.factories import KeywordFactory

# The importer is tested through the conditions it has to handle, with small inputs written in the tests, and not through saved copies of
# real recipe sites: those test the scraper library and the layout of the site on the day they were saved. The conditions the old site
# fixtures were added for (an ingredient with an empty name, a JSON-only source, a site-specific scraper) are covered below.
IMPORT_SOURCE_URL = 'api_recipe_from_source'


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


# The page declares no <link rel="canonical">, so the address the client sent is the only source address there is. The bookmarklet sends the
# HTML of a page together with its address.
def test_import_html_with_url_keeps_the_supplied_source_url(u1_s1):
    response = post_import(u1_s1, data=ld_page(), url='https://www.example.com/recipes/soup')
    assert sent(response)['recipe']['source_url'] == 'https://www.example.com/recipes/soup'


def test_import_html_with_url_prefers_the_pages_own_canonical_url(u1_s1):
    page = ld_page().replace('<head>', '<head><link rel="canonical" href="https://www.example.com/canonical/soup">')
    response = post_import(u1_s1, data=page, url='https://www.example.com/other/address')
    assert sent(response)['recipe']['source_url'] == 'https://www.example.com/canonical/soup'


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


@pytest.mark.parametrize("text,expected", [
    # block elements end a line, inline elements do not
    ('<p>One</p><p>Two</p>', 'One\nTwo'),
    ('<div>One</div><div>Two</div>', 'One\nTwo'),
    ('<h2>Title</h2>Text', 'Title\nText'),
    ('<ul><li>One</li><li>Two</li></ul>', 'One\nTwo'),
    ('Line<br>break', 'Line\nbreak'),
    ('Line<br/>break', 'Line\nbreak'),
    ('Mix <b>2</b> <i>eggs</i> in', 'Mix 2 eggs in'),
    ('<span>one</span><span>two</span>', 'onetwo'),
    # links keep their text and lose their address
    ('Mix <a href="https://x.com/y">the flour</a> in', 'Mix the flour in'),
    ('<a href="https://x.com/y"></a>Text', 'Text'),
    ('https://example.com stays', 'https://example.com stays'),
    # what is not text at all
    ('Text<script>alert(1)</script>', 'Text'),
    ('Text<style>p{color:red}</style>', 'Text'),
    ('Text<!-- a comment -->', 'Text'),
    ('<img src="a.jpg" alt="pic">Text', 'Text'),
    # a "<" or ">" in the text is text, not a tag
    ('Bake until a < b and c > d', 'Bake until a < b and c > d'),
    ('Bake < 20 min', 'Bake < 20 min'),
    ('Serves 2-3 <br> or 4', 'Serves 2-3\nor 4'),
    # entities are decoded once
    ('Salt &amp; pepper', 'Salt & pepper'),
    ('Bake &lt; 20 min', 'Bake < 20 min'),
    ('&#189; cup', '\u00bd cup'),
    ('&amp;lt;b&amp;gt;', '&lt;b&gt;'),
    ('1&nbsp;cup', '1 cup'),
    # white space
    ('too    many   spaces', 'too many spaces'),
    ('a\tb', 'a b'),
    ('  padded  ', 'padded'),
    ('<p>One</p>\n\n\n<p>Two</p>', 'One\n\nTwo'),
    ('One\n\n\n\nTwo', 'One\n\nTwo'),
    ('', ''),
    ('plain', 'plain'),
])
def test_normalize_string_html_stripping(text, expected):
    assert normalize_string(text) == expected


@pytest.mark.parametrize("html,expected", [
    ('<div>' * 6000 + 'deep' + '</div>' * 6000, 'deep'),
    ('<div>' * 6000 + '<p>One</p><p>Two</p>', 'One\nTwo'),
    ('<ul>' + '<li><ul>' * 3000 + '<li>last</li>', 'last'),
    ('<p>a</p>' * 5000, '\n'.join(['a'] * 5000)),
])
def test_normalize_string_handles_a_page_that_is_deeply_nested_in_a_short_time(html, expected):
    """A description is whatever a page contains, so the time it takes must not grow with the square of the nesting."""
    started = time.monotonic()
    assert normalize_string(html) == expected
    assert time.monotonic() - started < 3


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


# ---------------------------------------------------------------------------------------------------------------------
# The import endpoint (RecipeUrlImportView.post): one test per branch.
# ---------------------------------------------------------------------------------------------------------------------

RECIPE_LD = {
    '@context': 'https://schema.org', '@type': 'Recipe', 'name': 'Test Soup', 'recipeIngredient': ['1 cup water', '2 tsp salt'],
    'recipeInstructions': ['Boil water.', 'Add salt.'], 'recipeYield': '4 servings', 'prepTime': 'PT10M', 'cookTime': 'PT20M',
    'image': 'https://img.example.com/soup.jpg', 'keywords': 'soup, easy', 'author': {'@type': 'Person', 'name': 'Jo Cook'},
}
GRAPH_LD = {
    '@context': 'https://schema.org',
    '@graph': [{'@type': 'WebSite', '@id': 'https://example.com/#website', 'name': 'Example'},
               {'@type': 'Recipe', 'name': 'Graph Soup', 'recipeIngredient': ['1 cup water'], 'recipeInstructions': ['Boil water.']}],
}
SHARE_UUID = '3f6c2a91-7b4e-4d58-9a2c-5e81b0d7c4aa'


def ld_page(recipe=None, body=''):
    return f'<html><head><script type="application/ld+json">{json.dumps(recipe or RECIPE_LD)}</script></head><body>{body}</body></html>'


def post_import(client, **payload):
    return client.post(reverse(IMPORT_SOURCE_URL), payload, content_type='application/json')


def reply(html):
    return MagicMock(ok=True, content=html.encode())


def sent(response):
    return json.loads(response.content)


def test_import_rejects_an_invalid_request(u1_s1):
    response = post_import(u1_s1, bookmarklet='not a number')
    assert response.status_code == 400
    assert sent(response)['error'] is True


@pytest.mark.parametrize("payload", [{}, {'url': '', 'data': ''}, {'url': None, 'data': None}])
def test_import_needs_a_url_or_data(payload, u1_s1):
    response = post_import(u1_s1, **payload)
    assert response.status_code == 400
    assert sent(response)['msg'] == 'Nothing to do.'


def test_import_reads_a_bookmarklet_import_and_removes_it(u1_s1):
    from cookbook.models import BookmarkletImport
    space = _space(u1_s1)
    with scope(space=space):
        bookmarklet = BookmarkletImport.objects.create(html=ld_page(), url='https://example.com/r/bm', created_by=auth.get_user(u1_s1), space=space)
        pk = bookmarklet.pk
    response = post_import(u1_s1, bookmarklet=pk)
    assert response.status_code == 200
    # the page declares no canonical address, so the one the bookmarklet sent is the source
    assert sent(response)['recipe']['name'] == 'Test Soup'
    assert sent(response)['recipe']['source_url'] == 'https://example.com/r/bm'
    with scope(space=space):
        assert not BookmarkletImport.objects.filter(pk=pk).exists()


def test_import_ignores_a_bookmarklet_import_that_does_not_exist(u1_s1):
    response = post_import(u1_s1, bookmarklet=987654)
    assert response.status_code == 400
    assert sent(response)['msg'] == 'Nothing to do.'


def test_import_ignores_the_bookmarklet_import_of_another_space(u1_s1, u1_s2, space_2):
    from django_scopes import scopes_disabled

    from cookbook.models import BookmarkletImport
    with scopes_disabled():
        foreign = BookmarkletImport.objects.create(html=ld_page(), url='https://example.com/r/foreign', created_by=auth.get_user(u1_s2), space=space_2)
    response = post_import(u1_s1, bookmarklet=foreign.pk)
    assert response.status_code == 400
    with scopes_disabled():
        assert BookmarkletImport.objects.filter(pk=foreign.pk).exists()


YOUTUBE_URLS = [
    ('https://www.youtube.com/watch?v=x', True),
    ('http://www.youtube.com/watch?v=x', True),
    ('www.youtube.com/watch?v=x', True),
    ('https://youtu.be/x', True),
    ('youtu.be/x', True),
    ('https://youtube.com/watch?v=x', True),
    ('https://m.youtube.com/watch?v=x', True),
    ('https://music.youtube.com/watch?v=x', True),
    ('HTTPS://WWW.YOUTUBE.COM/watch?v=x', True),
    ('https://www.youtube.com.evil.example/x', False),
    ('https://notyoutube.com/x', False),
    ('https://example.com/?next=https://youtu.be/x', False),
    ('https://www.youtube.com', False),
    ('https://youtu.be/', False),
]


@pytest.mark.parametrize("url,is_youtube", YOUTUBE_URLS)
def test_import_sends_youtube_addresses_to_the_youtube_scraper(url, is_youtube, u1_s1):
    not_found = MagicMock(ok=False, status_code=404)
    with patch('cookbook.helper.recipe_url_import.YouTube', side_effect=Exception('offline')) as youtube, \
            patch('cookbook.views.api.safe_request', return_value=not_found) as fetch:
        response = post_import(u1_s1, url=url)
    assert youtube.called is is_youtube
    assert fetch.called is not is_youtube
    if is_youtube:
        assert response.status_code == 200
        assert sent(response)['recipe']['source_url'] == url


def test_import_reports_duplicates_of_an_imported_youtube_video(u1_s1, recipe_1_s1):
    from django_scopes import scopes_disabled
    url = 'https://youtu.be/dup'
    with scopes_disabled():
        recipe_1_s1.source_url = url
        recipe_1_s1.save()
    with patch('cookbook.helper.recipe_url_import.YouTube', side_effect=Exception('offline')):
        response = post_import(u1_s1, url=url)
    assert [d['id'] for d in sent(response)['duplicates']] == [recipe_1_s1.id]


@pytest.mark.parametrize("url,api_url", [
    (f'https://t.example/recipe/12/?share={SHARE_UUID}', f'https://t.example/api/recipe/12/?share={SHARE_UUID}'),
    (f'https://t.example/view/recipe/12/{SHARE_UUID}', f'https://t.example/api/recipe/12?share={SHARE_UUID}'),
    # only the recipe segment is rewritten, however often the path holds "/recipe/"
    (f'https://t.example/recipe/x/recipe/12/?share={SHARE_UUID}', f'https://t.example/recipe/x/api/recipe/12/?share={SHARE_UUID}'),
])
def test_import_reads_share_links_of_another_tandoor_through_its_api(url, api_url, u1_s1):
    with patch('cookbook.views.api.safe_request', return_value=MagicMock(json=lambda: {})) as fetch:
        post_import(u1_s1, url=url)
    assert fetch.call_args_list[0].args == ('GET', api_url)


@pytest.mark.parametrize("url", [
    f'https://t.example/recipe/12/?share={SHARE_UUID.upper()}',  # not a uuid4 as Tandoor writes it
    'https://t.example/recipe/12/?share=0192f2a1-7b4e-7d58-9a2c-5e81b0d7c4aa',  # a uuid7
    f'https://t.example/recipe/12?share={SHARE_UUID}',  # no slash before the query
    'https://t.example/recipe/12/',
])
def test_import_treats_other_recipe_addresses_as_ordinary_web_pages(url, u1_s1):
    with patch('cookbook.views.api.safe_request', return_value=MagicMock(ok=False, status_code=404)) as fetch:
        response = post_import(u1_s1, url=url)
    assert fetch.call_args.args == ('GET', url)
    assert 'headers' in fetch.call_args.kwargs
    assert response.status_code == 400


def test_import_reports_a_share_link_that_does_not_hold_a_valid_recipe(u1_s1):
    with patch('cookbook.views.api.safe_request', return_value=MagicMock(json=lambda: {})):
        response = post_import(u1_s1, url=f'https://t.example/recipe/12/?share={SHARE_UUID}')
    assert response.status_code == 400
    assert sent(response)['msg'] == 'No usable data could be found.'


def _shared_recipe(client, recipe, image):
    from rest_framework.renderers import JSONRenderer

    from cookbook.serializer import RecipeExportSerializer
    request = RequestFactory()
    request.user = auth.get_user(client)
    request.space = _space(client)
    with scope(space=request.space):
        data = json.loads(JSONRenderer().render(RecipeExportSerializer(recipe, context={'request': request}).data))
    data['image'] = image
    return data


def test_import_saves_a_shared_recipe_that_has_no_image(u1_s1, recipe_1_s1):
    shared = _shared_recipe(u1_s1, recipe_1_s1, None)
    with patch('cookbook.views.api.safe_request', return_value=MagicMock(json=lambda: shared)):
        response = post_import(u1_s1, url=f'https://t.example/recipe/12/?share={SHARE_UUID}')
    assert response.status_code == 200
    assert sent(response)['recipe_id']


def test_import_saves_a_shared_recipe_with_its_image(u1_s1, recipe_1_s1):
    import io

    from PIL import Image
    png = io.BytesIO()
    Image.new('RGB', (4, 4), 'red').save(png, 'PNG')
    shared = _shared_recipe(u1_s1, recipe_1_s1, 'https://t.example/media/pic.png?v=2')
    with patch('cookbook.views.api.safe_request', side_effect=[MagicMock(json=lambda: shared), MagicMock(content=png.getvalue())]) as fetch:
        response = post_import(u1_s1, url=f'https://t.example/recipe/12/?share={SHARE_UUID}')
    assert response.status_code == 200
    assert fetch.call_args_list[1].args == ('GET', 'https://t.example/media/pic.png?v=2')


def test_import_reads_a_web_page_from_its_url(u1_s1):
    page = ld_page(body='<img src="/img/a.jpg"><img src="https://cdn.example.com/b.png">')
    with patch('cookbook.views.api.safe_request', return_value=reply(page)):
        response = post_import(u1_s1, url='https://www.example.com/recipes/soup')
    assert response.status_code == 200
    body = sent(response)
    assert body['recipe']['name'] == 'Test Soup'
    assert body['recipe']['source_url'] == 'https://www.example.com/recipes/soup'
    assert body['images'] == ['https://www.example.com/img/a.jpg', 'https://cdn.example.com/b.png']


def test_import_points_out_recipes_that_were_imported_from_the_same_address(u1_s1, recipe_1_s1):
    from django_scopes import scopes_disabled
    url = 'https://www.example.com/recipes/soup'
    with scopes_disabled():
        recipe_1_s1.source_url = url
        recipe_1_s1.save()
    with patch('cookbook.views.api.safe_request', return_value=reply(ld_page())):
        response = post_import(u1_s1, url=url)
    assert [d['id'] for d in sent(response)['duplicates']] == [recipe_1_s1.id]


def test_import_forwards_the_browser_of_the_user_when_it_fetches_a_page(u1_s1):
    with patch('cookbook.views.api.safe_request', return_value=reply(ld_page())) as fetch:
        u1_s1.post(reverse(IMPORT_SOURCE_URL), {'url': 'https://www.example.com/r'}, content_type='application/json', HTTP_USER_AGENT='TestBrowser/1.0')
    assert fetch.call_args.kwargs['headers']['User-Agent'] == 'TestBrowser/1.0'


def test_import_uses_a_generic_browser_name_when_the_user_sends_none(u1_s1):
    with patch('cookbook.views.api.safe_request', return_value=reply(ld_page())) as fetch:
        post_import(u1_s1, url='https://www.example.com/r')
    assert fetch.call_args.kwargs['headers']['User-Agent'] == 'Mozilla/5.0'


@pytest.mark.parametrize("error,message", [
    (requests.exceptions.ConnectionError(), 'Connection Refused.'),
    (requests.exceptions.MissingSchema(), 'Bad URL Schema.'),
])
def test_import_reports_a_page_that_cannot_be_reached(error, message, u1_s1):
    with patch('cookbook.views.api.safe_request', side_effect=error):
        response = post_import(u1_s1, url='https://www.example.com/r')
    assert response.status_code == 400
    assert sent(response)['msg'] == message


# anything else that can go wrong while fetching a page is the user's problem to read about, not a server error
@pytest.mark.parametrize("error", [
    requests.exceptions.ReadTimeout(), requests.exceptions.TooManyRedirects(), requests.exceptions.InvalidSchema(),
    requests.exceptions.InvalidURL(), requests.exceptions.ChunkedEncodingError(),
])
def test_import_reports_every_other_network_error_too(error, u1_s1):
    with patch('cookbook.views.api.safe_request', side_effect=error):
        response = post_import(u1_s1, url='https://www.example.com/r')
    assert response.status_code == 400
    assert sent(response)['error'] is True


@pytest.mark.parametrize("url", ['not a url', 'ftp://example.com/recipe', 'http://127.0.0.1/recipe', 'http://169.254.169.254/latest/meta-data/'])
def test_import_does_not_fetch_addresses_it_must_not_and_reports_them(url, u1_s1):
    response = post_import(u1_s1, url=url)
    assert response.status_code == 400
    assert sent(response)['error'] is True


def test_import_reports_a_page_without_recipe_data(u1_s1):
    with patch('cookbook.views.api.safe_request', return_value=reply('<html><body>no recipe here</body></html>')):
        response = post_import(u1_s1, url='https://www.example.com/r')
    assert response.status_code == 400
    assert sent(response)['msg'] == 'No usable data could be found.'


def test_import_reads_html_that_is_sent_along(u1_s1):
    response = post_import(u1_s1, data=ld_page(body='<img src="https://cdn.example.com/b.png"><img src="/rel.png">'))
    assert response.status_code == 200
    assert sent(response)['recipe']['name'] == 'Test Soup'
    # without an address a relative image cannot be resolved
    assert sent(response)['images'] == ['https://cdn.example.com/b.png']


def test_import_decodes_data_that_arrives_percent_encoded(u1_s1):
    from urllib.parse import quote
    response = post_import(u1_s1, data=quote(ld_page()))
    assert response.status_code == 200
    assert sent(response)['recipe']['name'] == 'Test Soup'


def test_import_takes_the_source_url_from_html_that_names_itself(u1_s1):
    response = post_import(u1_s1, data=ld_page({**RECIPE_LD, 'url': 'https://example.com/r/9'}))
    assert sent(response)['recipe']['source_url'] == 'https://example.com/r/9'


def test_import_leaves_the_source_url_empty_for_html_that_does_not_name_itself(u1_s1):
    assert sent(post_import(u1_s1, data=ld_page()))['recipe']['source_url'] == ''


def test_import_lets_a_site_specific_replacement_rule_apply_to_html_sent_with_its_url(u1_s1):
    space = _space(u1_s1)
    with scope(space=space):
        Automation.objects.create(name='rename', type=Automation.NAME_REPLACE, param_1='.*example.com.*', param_2='test soup', param_3='Stew',
                                  created_by=auth.get_user(u1_s1), space=space)
    assert sent(post_import(u1_s1, data=ld_page(), url='https://www.example.com/r/1'))['recipe']['name'] == 'Stew'
    assert sent(post_import(u1_s1, data=ld_page(), url='https://www.other.com/r/1'))['recipe']['name'] == 'Test Soup'


@pytest.mark.parametrize("data", [
    json.dumps({k: v for k, v in RECIPE_LD.items() if k not in ('@context', '@type')}),  # neither context nor type: both are added
    json.dumps({k: v for k, v in RECIPE_LD.items() if k != '@context'}),
    json.dumps(RECIPE_LD),
    json.dumps([RECIPE_LD]),
    json.dumps(GRAPH_LD | {'@graph': [GRAPH_LD['@graph'][0], {**GRAPH_LD['@graph'][1], 'name': 'Test Soup'}]}),  # sites nest their recipe in a @graph
], ids=['no context or type', 'no context', 'complete', 'list', 'graph'])
def test_import_reads_a_recipe_sent_as_json(data, u1_s1):
    response = post_import(u1_s1, data=data)
    assert response.status_code == 200
    assert sent(response)['recipe']['name'] == 'Test Soup'


@pytest.mark.parametrize("data", ['[]', '123', '"just text"', 'null', '{"name": "unfinished', 'plain text', '<html></html>'])
def test_import_reports_data_that_holds_no_recipe(data, u1_s1):
    response = post_import(u1_s1, data=data)
    assert response.status_code == 400
    assert sent(response)['msg'] == 'No usable data could be found.'


@pytest.mark.parametrize("failure", [
    {'side_effect': requests.exceptions.ReadTimeout()},
    {'return_value': MagicMock(json=MagicMock(side_effect=ValueError('not json')))},
], ids=['unreachable', 'not json'])
def test_import_reports_a_share_link_that_cannot_be_read(failure, u1_s1):
    with patch('cookbook.views.api.safe_request', **failure):
        response = post_import(u1_s1, url=f'https://t.example/recipe/12/?share={SHARE_UUID}')
    assert response.status_code == 400
    assert sent(response)['error'] is True


def test_import_still_saves_a_shared_recipe_when_its_image_cannot_be_loaded(u1_s1, recipe_1_s1):
    shared = _shared_recipe(u1_s1, recipe_1_s1, 'https://t.example/media/pic.png')
    with patch('cookbook.views.api.safe_request', side_effect=[MagicMock(json=lambda: shared), requests.exceptions.ReadTimeout()]):
        response = post_import(u1_s1, url=f'https://t.example/recipe/12/?share={SHARE_UUID}')
    assert response.status_code == 200
    assert sent(response)['recipe_id']


# ---------------------------------------------------------------------------------------------------------------------
# Nutrition information of a page becomes properties of the recipe, per serving.
# ---------------------------------------------------------------------------------------------------------------------

NUTRITION_SLUGS = {'calories': 'property-calories', 'carbohydrateContent': 'property-carbohydrates', 'proteinContent': 'property-proteins', 'fatContent': 'property-fats'}


def _property_types(space, slugs=NUTRITION_SLUGS.values()):
    return {slug: PropertyType.objects.create(name=slug, open_data_slug=slug, space=space) for slug in slugs}


def _amounts(space, nutrients):
    with scope(space=space):
        return {p['property_type']['name']: p['property_amount'] for p in get_recipe_properties(space, nutrients)}


@pytest.mark.parametrize("nutrients,expected", [
    ({'calories': '300 kcal', 'proteinContent': '12 g', 'fatContent': '10 g', 'carbohydrateContent': '40 g'},
     {'property-calories': 300, 'property-proteins': 12, 'property-fats': 10, 'property-carbohydrates': 40}),
    # per serving
    ({'servingSize': '2', 'calories': '300 kcal', 'proteinContent': '12 g'}, {'property-calories': 150, 'property-proteins': 6}),
    ({'servingSize': 'a dozen', 'calories': '300 kcal'}, {'property-calories': 300}),
    ({'servingSize': '2 servings', 'calories': '300 kcal'}, {'property-calories': 150}),
    ({'servingSize': 4, 'calories': '300 kcal'}, {'property-calories': 75}),
    # a serving size that is an amount, not a number of servings, says what the values are for: they are not divided by it
    ({'servingSize': '100 g', 'calories': '300 kcal', 'proteinContent': '12 g'}, {'property-calories': 300, 'property-proteins': 12}),
    ({'servingSize': '250 ml', 'calories': '300 kcal'}, {'property-calories': 300}),
    ({'servingSize': '1 cup', 'calories': '300 kcal'}, {'property-calories': 300}),
    # decimals, with a point or a comma
    ({'calories': '302 kcal', 'proteinContent': '7,66g', 'fatContent': '11.5 g'}, {'property-calories': 302, 'property-proteins': 7.66, 'property-fats': 11.5}),
    ({'calories': '1,200 kcal'}, {'property-calories': 1200}),
    ({'calories': 250, 'fatContent': 7.5}, {'property-calories': 250, 'property-fats': 7.5}),
    # what is not a number, or not a known property, is left out
    ({'calories': 'n/a', 'proteinContent': '12 g'}, {'property-proteins': 12}),
    ({'sugarContent': '5 g', 'calories': '300 kcal'}, {'property-calories': 300}),
    ({}, {}),
])
def test_get_recipe_properties(nutrients, expected, u1_s1):
    space = _space(u1_s1)
    with scope(space=space):
        _property_types(space)
    assert _amounts(space, nutrients) == expected


def test_get_recipe_properties_only_uses_the_property_types_of_the_space(u1_s1):
    space = _space(u1_s1)
    with scope(space=space):
        _property_types(space, ['property-calories'])
    assert _amounts(space, {'calories': '300 kcal', 'proteinContent': '12 g'}) == {'property-calories': 300}


def test_get_from_scraper_adds_the_nutrition_of_the_page_as_properties(u1_s1):
    space = _space(u1_s1)
    with scope(space=space):
        types = _property_types(space, ['property-calories'])
    recipe = scraped(u1_s1, FakeScrape(nutrients={'calories': '300 kcal'}))
    assert recipe['properties'] == [{'property_type': {'id': types['property-calories'].id, 'name': 'property-calories'}, 'property_amount': 300}]


def test_get_from_scraper_survives_a_page_whose_nutrition_cannot_be_read(u1_s1):
    assert scraped(u1_s1, FakeScrape(nutrients=Exception('no')))['properties'] == []


@pytest.mark.parametrize("replace_type", [Automation.NAME_REPLACE, Automation.DESCRIPTION_REPLACE, Automation.INSTRUCTION_REPLACE])
def test_get_from_scraper_imports_although_a_replacement_rule_is_broken(replace_type, u1_s1):
    space = _space(u1_s1)
    with scope(space=space):
        Automation.objects.create(name='broken', type=replace_type, param_1='.*', param_2='(', param_3='x', created_by=auth.get_user(u1_s1), space=space)
    recipe = scraped(u1_s1, FakeScrape(title='Soup', description='A dish', instructions_list=['Boil it']))
    assert (recipe['name'], recipe['description'], recipe['steps'][0]['instruction']) == ('Soup', 'A dish', 'Boil it')


@pytest.mark.parametrize("replace_type", [Automation.FOOD_REPLACE, Automation.UNIT_REPLACE])
def test_get_from_scraper_still_parses_ingredients_when_a_replacement_rule_is_broken(replace_type, u1_s1):
    space = _space(u1_s1)
    with scope(space=space):
        Automation.objects.create(name='broken', type=replace_type, param_1='.*', param_2='(', param_3='x', created_by=auth.get_user(u1_s1), space=space)
    recipe = scraped(u1_s1, FakeScrape(ingredients=['2 cups flour']))
    ingredient = recipe['steps'][0]['ingredients'][0]
    assert (ingredient['amount'], ingredient['food']['name']) == (2, 'flour')
