import os
from unittest.mock import patch

import pytest
import regex
from django.contrib import auth
from django.core.cache import caches
from django.test import RequestFactory
from django_scopes import scope
from recipe_scrapers import scrape_html

from cookbook.helper.automation_helper import AutomationEngine
from cookbook.helper.recipe_url_import import get_from_scraper
from cookbook.models import Automation

DATA_DIR = "cookbook/tests/other/test_data/"


@pytest.mark.parametrize("arg", [
    ['Match', True],
    ['mAtCh', True],
    ['No Match', False],
    ['Màtch', False],
])
def test_food_automation(u1_s1, arg):
    target_name = "Matched Automation"
    user = auth.get_user(u1_s1)
    space = user.userspace_set.first().space
    request = RequestFactory()
    request.user = user
    request.space = space
    automation = AutomationEngine(request, False)

    with scope(space=space):
        Automation.objects.get_or_create(name='food test', type=Automation.FOOD_ALIAS, param_1=arg[0], param_2=target_name, created_by=user, space=space)
        assert (automation.apply_food_automation(arg[0]) == target_name) is True


@pytest.mark.parametrize("arg", [
    ['Match', True],
    ['mAtCh', True],
    ['No Match', False],
    ['Màtch', False],
])
def test_keyword_automation(u1_s1, arg):
    target_name = "Matched Automation"
    user = auth.get_user(u1_s1)
    space = user.userspace_set.first().space
    request = RequestFactory()
    request.user = user
    request.space = space
    automation = AutomationEngine(request, False)

    with scope(space=space):
        Automation.objects.get_or_create(name='keyword test', type=Automation.KEYWORD_ALIAS, param_1=arg[0], param_2=target_name, created_by=user, space=space)
        assert (automation.apply_keyword_automation(arg[0]) == target_name) is True


@pytest.mark.parametrize("arg", [
    ['Match', True],
    ['mAtCh', True],
    ['No Match', False],
    ['Màtch', False],
])
def test_unit_automation(u1_s1, arg):
    target_name = "Matched Automation"
    user = auth.get_user(u1_s1)
    space = user.userspace_set.first().space
    request = RequestFactory()
    request.user = user
    request.space = space
    automation = AutomationEngine(request, False)

    with scope(space=space):
        Automation.objects.get_or_create(name='unit test', type=Automation.UNIT_ALIAS, param_1=arg[0], param_2=target_name, created_by=user, space=space)
        assert (automation.apply_unit_automation(arg[0]) == target_name) is True


@pytest.mark.parametrize(
    "arg", [
        [[1, 'egg', 'white'], '', [1, '', 'egg', 'white']],
        [[1, 'Egg', 'white'], '', [1, '', 'Egg', 'white']],
        [[1, 'êgg', 'white'], '', [1, 'êgg', 'white']],
        [[1, 'egg', 'white'], 'whole', [1, 'whole', 'egg', 'white']],
    ]
)
def test_never_unit_automation(u1_s1, arg):
    user = auth.get_user(u1_s1)
    space = user.userspace_set.first().space
    request = RequestFactory()
    request.user = user
    request.space = space
    automation = AutomationEngine(request, False)

    with scope(space=space):
        Automation.objects.get_or_create(name='never unit test', type=Automation.NEVER_UNIT, param_1='egg', param_2=arg[1], created_by=user, space=space)
        tokens, automation_applied = automation.apply_never_unit_automation(arg[0])
        assert tokens == arg[2]


@pytest.mark.parametrize("source", [
    ['.*', True],
    ['.*allrecipes.*', True],
    ['.*google.*', False],
])
@pytest.mark.parametrize(
    "arg", [
        [Automation.DESCRIPTION_REPLACE],
        [Automation.INSTRUCTION_REPLACE],
        [Automation.NAME_REPLACE],
        [Automation.FOOD_REPLACE],
        [Automation.UNIT_REPLACE],
    ]
)
def test_regex_automation(u1_s1, arg, source):
    user = auth.get_user(u1_s1)
    space = user.userspace_set.first().space
    request = RequestFactory()
    request.user = user
    request.space = space
    automation = AutomationEngine(request, use_cache=False, source='https://www.allrecipes.com/recipe/24010/easy-chicken-marsala/')
    middle = 'test_remove_phrase'
    beginning = 'remove_test phrase'
    fail = 'test remove_phrase'
    target = 'test phrase'

    with scope(space=space):
        Automation.objects.get_or_create(name='regex middle test', type=arg[0], param_1=source[0], param_2='_remove_', param_3=' ', created_by=user, space=space)
        Automation.objects.get_or_create(name='regex beginning test', type=arg[0], param_1=source[0], param_2='^remove_', param_3='', created_by=user, space=space)
        assert (automation.apply_regex_replace_automation(middle, arg[0]) == target) == source[1]
        assert (automation.apply_regex_replace_automation(beginning, arg[0]) == target) == source[1]
        assert (automation.apply_regex_replace_automation(fail, arg[0]) == target) == False


@pytest.mark.parametrize(
    "arg", [
        ['second first', 'first second'],
        ['longer string second first longer string', 'longer string first second longer string'],
        ['second fails first', 'second fails first'],
    ]
)
def test_transpose_automation(u1_s1, arg):
    user = auth.get_user(u1_s1)
    space = user.userspace_set.first().space
    request = RequestFactory()
    request.user = user
    request.space = space
    automation = AutomationEngine(request, False)

    with scope(space=space):
        Automation.objects.get_or_create(name='transpose words test', type=Automation.TRANSPOSE_WORDS, param_1='second', param_2='first', created_by=user, space=space)
        assert automation.apply_transpose_automation(arg[0]) == arg[1]


def test_url_import_regex_replace(u1_s1):
    # TODO this does not test import with multiple steps - do any sites import with this pattern?  It doesn't look like the url_importer supports it
    user = auth.get_user(u1_s1)
    space = user.userspace_set.first().space
    request = RequestFactory()
    request.user = user
    request.space = space
    recipe = 'regex_recipe.html'
    types = [Automation.DESCRIPTION_REPLACE, Automation.INSTRUCTION_REPLACE, Automation.NAME_REPLACE, Automation.FOOD_REPLACE, Automation.UNIT_REPLACE]
    find_text = "_remove"
    target_text = "Test"

    if 'cookbook' in os.getcwd():
        test_file = os.path.join(os.getcwd(), 'other', 'test_data', recipe)
        # TODO this catch doesn't really work depending on from where you start the test, must check for duplicate path sections
    else:
        test_file = os.path.join(os.getcwd(), 'cookbook', 'tests', 'other', 'test_data', recipe)
    with open(test_file, 'r', encoding='UTF-8') as d:
        scrape = scrape_html(html=d.read(), org_url="https://testrecipe.test", supported_only=False)
    with scope(space=space):
        for t in types:
            Automation.objects.get_or_create(name=t, type=t, param_1='.*', param_2=find_text, param_3='', created_by=user, space=space)
        recipe_json = get_from_scraper(scrape, request)
    assert recipe_json['name'] == target_text
    assert recipe_json['description'] == target_text
    assert recipe_json['steps'][0]['instruction'] == target_text
    assert recipe_json['steps'][0]['ingredients'][0]['food']['name'] == target_text
    assert recipe_json['steps'][0]['ingredients'][0]['food']['name'] == target_text
    assert recipe_json['steps'][0]['ingredients'][1]['unit']['name'] == target_text
    assert recipe_json['steps'][0]['ingredients'][1]['unit']['name'] == target_text


# ---------------------------------------------------------------------------------------------------------------------
# Regex replacement automations (NAME_REPLACE and the like). A rule has a source pattern that is matched against the address
# of the import, a pattern to replace and a replacement; rules of the right type, space and source are applied in their order.
# ---------------------------------------------------------------------------------------------------------------------

REPLACE_TYPES = [Automation.DESCRIPTION_REPLACE, Automation.INSTRUCTION_REPLACE, Automation.NAME_REPLACE, Automation.FOOD_REPLACE, Automation.UNIT_REPLACE]
SOURCE = 'https://www.example.com/recipes/soup'


@pytest.fixture
def no_regex_state(monkeypatch):
    """The engine keeps its rules in a cache; start every test without it (and without a leftover store on the class)."""
    monkeypatch.setattr(AutomationEngine, 'regex_replace', {t: None for t in REPLACE_TYPES}, raising=False)
    caches['default'].clear()
    yield
    caches['default'].clear()


def _space_of(client):
    return auth.get_user(client).userspace_set.first().space


def _engine(client, source=SOURCE, use_cache=False):
    request = RequestFactory()
    request.user = auth.get_user(client)
    request.space = _space_of(client)
    return AutomationEngine(request, use_cache=use_cache, source=source)


def _rule(client, replace_type=Automation.NAME_REPLACE, source='.*', find='soup', replace='Stew', **extra):
    space = _space_of(client)
    with scope(space=space):
        return Automation.objects.create(name=f'{replace_type} {find}', type=replace_type, param_1=source, param_2=find, param_3=replace,
                                         created_by=auth.get_user(client), space=space, **extra)


def _apply(client, text, engine, replace_type=Automation.NAME_REPLACE):
    with scope(space=_space_of(client)):
        return engine.apply_regex_replace_automation(text, replace_type)


@pytest.mark.parametrize("use_cache", [False, True])
@pytest.mark.parametrize("find,replace,text,expected", [
    ('soup', 'Stew', 'Soup of the day', 'Stew of the day'),  # the pattern to replace ignores case
    ('soup', 'Stew', 'SOUP and soup', 'Stew and Stew'),  # and every occurrence is replaced
    (r'(\w+) (\w+)', r'\2 \1', 'big soup', 'soup big'),  # the replacement can refer to groups
    (r' \(.*\)', '', 'Soup (vegan)', 'Soup'),  # no replacement deletes
    ('stew', 'x', 'Soup', 'Soup'),  # no match, no change
])
def test_regex_replacement(find, replace, text, expected, use_cache, u1_s1, no_regex_state):
    _rule(u1_s1, find=find, replace=replace)
    assert _apply(u1_s1, text, _engine(u1_s1, use_cache=use_cache)) == expected


@pytest.mark.parametrize("use_cache", [False, True])
@pytest.mark.parametrize("source_pattern,source,applied", [
    ('.*', SOURCE, True),
    ('.*example.com.*', SOURCE, True),
    ('https://www.example.com/.*', SOURCE, True),
    ('.*other.com.*', SOURCE, False),
    # the pattern may match anywhere in the address, so a bare host name or a part of the path is enough
    ('example.com', SOURCE, True),
    ('/recipes/', SOURCE, True),
    ('^https://www.example.com', SOURCE, True),  # and can still be anchored
    ('^example.com', SOURCE, False),
    # and it ignores case, like host names do
    ('.*EXAMPLE.*', SOURCE, True),
    ('EXAMPLE.COM', SOURCE, True),
    # only the first 512 characters of the address are looked at
    ('.*END$', 'https://www.example.com/' + 'a' * 600 + 'END', False),
    ('.*', None, True),  # no address: only a rule that matches anything applies
    ('.*example.*', None, False),
])
def test_regex_replacement_only_for_matching_sources(source_pattern, source, applied, use_cache, u1_s1, no_regex_state):
    _rule(u1_s1, source=source_pattern)
    assert (_apply(u1_s1, 'Soup', _engine(u1_s1, source, use_cache)) == 'Stew') is applied


@pytest.mark.parametrize("use_cache", [False, True])
def test_regex_replacement_applies_rules_in_their_order(use_cache, u1_s1, no_regex_state):
    _rule(u1_s1, find='soup', replace='Stew', order=1)
    _rule(u1_s1, find='stew', replace='Ragout', order=2)
    assert _apply(u1_s1, 'Soup', _engine(u1_s1, use_cache=use_cache)) == 'Ragout'


@pytest.mark.parametrize("use_cache", [False, True])
def test_regex_replacement_applies_the_rule_listed_first_first(use_cache, u1_s1, no_regex_state):
    _rule(u1_s1, find='stew', replace='Ragout', order=1)
    _rule(u1_s1, find='soup', replace='Stew', order=2)
    assert _apply(u1_s1, 'Soup', _engine(u1_s1, use_cache=use_cache)) == 'Stew'


@pytest.mark.parametrize("use_cache", [False, True])
def test_regex_replacement_ignores_disabled_rules(use_cache, u1_s1, no_regex_state):
    _rule(u1_s1, disabled=True)
    assert _apply(u1_s1, 'Soup', _engine(u1_s1, use_cache=use_cache)) == 'Soup'


@pytest.mark.parametrize("use_cache", [False, True])
def test_regex_replacement_only_applies_rules_of_the_asked_type(use_cache, u1_s1, no_regex_state):
    _rule(u1_s1, replace_type=Automation.DESCRIPTION_REPLACE)
    engine = _engine(u1_s1, use_cache=use_cache)
    assert _apply(u1_s1, 'Soup', engine, Automation.NAME_REPLACE) == 'Soup'
    assert _apply(u1_s1, 'Soup', engine, Automation.DESCRIPTION_REPLACE) == 'Stew'


@pytest.mark.parametrize("use_cache", [False, True])
def test_regex_replacement_ignores_the_rules_of_other_spaces(use_cache, u1_s1, u1_s2, no_regex_state):
    _rule(u1_s2)
    assert _apply(u1_s1, 'Soup', _engine(u1_s1, use_cache=use_cache)) == 'Soup'
    assert _apply(u1_s2, 'Soup', _engine(u1_s2, use_cache=use_cache)) == 'Stew'


def test_regex_replacement_with_a_cache_does_not_hand_one_spaces_rules_to_another(u1_s1, u1_s2, monkeypatch, no_regex_state):
    """
    The rules a space uses are cached for 30 seconds. A second process starts with nothing in memory but shares that cache, so what is in
    the cache for one space must hold that space's rules for that type and nothing else.
    """
    _rule(u1_s1, replace_type=Automation.NAME_REPLACE, find='secret', replace='LEAKED')
    _rule(u1_s2, replace_type=Automation.DESCRIPTION_REPLACE, find='x', replace='y')
    _apply(u1_s1, 'secret', _engine(u1_s1, use_cache=True), Automation.NAME_REPLACE)
    _apply(u1_s2, 'x', _engine(u1_s2, use_cache=True), Automation.DESCRIPTION_REPLACE)

    monkeypatch.setattr(AutomationEngine, 'regex_replace', {t: None for t in REPLACE_TYPES}, raising=False)  # a new process
    assert _apply(u1_s2, 'secret', _engine(u1_s2, use_cache=True), Automation.NAME_REPLACE) == 'secret'


@pytest.mark.parametrize("use_cache", [False, True])
@pytest.mark.parametrize("rule", [
    {'find': '('},  # not a valid pattern
    {'source': '('},  # a source pattern that is not valid
], ids=['invalid pattern', 'invalid source pattern'])
def test_regex_replacement_skips_a_rule_that_cannot_be_applied(rule, use_cache, u1_s1, no_regex_state):
    _rule(u1_s1, **rule, order=1)
    _rule(u1_s1, find='soup', replace='Stew', order=2)
    # a broken rule is skipped, and the rules after it still apply
    assert _apply(u1_s1, 'Soup', _engine(u1_s1, use_cache=use_cache)) == 'Stew'


@pytest.mark.parametrize("use_cache", [False, True])
def test_regex_replacement_skips_a_rule_that_takes_too_long(use_cache, u1_s1, no_regex_state):
    real_sub = regex.sub

    def sub(pattern, *args, **kwargs):
        if pattern == 'slow':
            raise TimeoutError('the pattern took too long')  # what the regex module raises when a pattern runs into the time limit
        return real_sub(pattern, *args, **kwargs)

    _rule(u1_s1, find='slow', order=1)
    _rule(u1_s1, find='soup', replace='Stew', order=2)
    with patch.object(regex, 'sub', side_effect=sub):
        assert _apply(u1_s1, 'Soup', _engine(u1_s1, use_cache=use_cache)) == 'Stew'
