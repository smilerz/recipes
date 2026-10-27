import os
from unittest.mock import patch

import pytest
import regex
from django.contrib import auth
from django.core.cache import caches
from django.test import RequestFactory
from django_scopes import scope
from recipe_scrapers import scrape_html

from cookbook.helper.automation_helper import REGEX_TIMEOUT, AutomationEngine
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
def empty_rule_cache():
    """The engine keeps its rules in a cache; start every test without it."""
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
def test_regex_replacement(find, replace, text, expected, use_cache, u1_s1, empty_rule_cache):
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
def test_regex_replacement_only_for_matching_sources(source_pattern, source, applied, use_cache, u1_s1, empty_rule_cache):
    _rule(u1_s1, source=source_pattern)
    assert (_apply(u1_s1, 'Soup', _engine(u1_s1, source, use_cache)) == 'Stew') is applied


@pytest.mark.parametrize("use_cache", [False, True])
def test_regex_replacement_applies_rules_in_their_order(use_cache, u1_s1, empty_rule_cache):
    _rule(u1_s1, find='soup', replace='Stew', order=1)
    _rule(u1_s1, find='stew', replace='Ragout', order=2)
    assert _apply(u1_s1, 'Soup', _engine(u1_s1, use_cache=use_cache)) == 'Ragout'


@pytest.mark.parametrize("use_cache", [False, True])
def test_regex_replacement_applies_the_rule_listed_first_first(use_cache, u1_s1, empty_rule_cache):
    _rule(u1_s1, find='stew', replace='Ragout', order=1)
    _rule(u1_s1, find='soup', replace='Stew', order=2)
    assert _apply(u1_s1, 'Soup', _engine(u1_s1, use_cache=use_cache)) == 'Stew'


@pytest.mark.parametrize("use_cache", [False, True])
def test_regex_replacement_ignores_disabled_rules(use_cache, u1_s1, empty_rule_cache):
    _rule(u1_s1, disabled=True)
    assert _apply(u1_s1, 'Soup', _engine(u1_s1, use_cache=use_cache)) == 'Soup'


@pytest.mark.parametrize("use_cache", [False, True])
def test_regex_replacement_only_applies_rules_of_the_asked_type(use_cache, u1_s1, empty_rule_cache):
    _rule(u1_s1, replace_type=Automation.DESCRIPTION_REPLACE)
    engine = _engine(u1_s1, use_cache=use_cache)
    assert _apply(u1_s1, 'Soup', engine, Automation.NAME_REPLACE) == 'Soup'
    assert _apply(u1_s1, 'Soup', engine, Automation.DESCRIPTION_REPLACE) == 'Stew'


@pytest.mark.parametrize("use_cache", [False, True])
def test_regex_replacement_ignores_the_rules_of_other_spaces(use_cache, u1_s1, u1_s2, empty_rule_cache):
    _rule(u1_s2)
    assert _apply(u1_s1, 'Soup', _engine(u1_s1, use_cache=use_cache)) == 'Soup'
    assert _apply(u1_s2, 'Soup', _engine(u1_s2, use_cache=use_cache)) == 'Stew'


def test_regex_replacement_with_a_cache_does_not_hand_one_spaces_rules_to_another(u1_s1, u1_s2, empty_rule_cache):
    """
    The rules a space uses are cached for 30 seconds. Another process starts with nothing in memory but shares that cache, so what is in
    the cache for one space must hold that space's rules for that type and nothing else.
    """
    _rule(u1_s1, replace_type=Automation.NAME_REPLACE, find='secret', replace='LEAKED')
    _rule(u1_s2, replace_type=Automation.DESCRIPTION_REPLACE, find='x', replace='y')
    _apply(u1_s1, 'secret', _engine(u1_s1, use_cache=True), Automation.NAME_REPLACE)
    _apply(u1_s2, 'x', _engine(u1_s2, use_cache=True), Automation.DESCRIPTION_REPLACE)

    assert _apply(u1_s2, 'secret', _engine(u1_s2, use_cache=True), Automation.NAME_REPLACE) == 'secret'


@pytest.mark.parametrize("use_cache", [False, True])
@pytest.mark.parametrize("rule", [
    {'find': '('},  # not a valid pattern
    {'source': '('},  # a source pattern that is not valid
], ids=['invalid pattern', 'invalid source pattern'])
def test_regex_replacement_skips_a_rule_that_cannot_be_applied(rule, use_cache, u1_s1, empty_rule_cache):
    _rule(u1_s1, **rule, order=1)
    _rule(u1_s1, find='soup', replace='Stew', order=2)
    # a broken rule is skipped, and the rules after it still apply
    assert _apply(u1_s1, 'Soup', _engine(u1_s1, use_cache=use_cache)) == 'Stew'


@pytest.mark.parametrize("use_cache", [False, True])
def test_regex_replacement_skips_a_rule_that_takes_too_long(use_cache, u1_s1, empty_rule_cache):
    real_sub = regex.sub

    def sub(pattern, *args, **kwargs):
        if pattern == 'slow':
            raise TimeoutError('the pattern took too long')  # what the regex module raises when a pattern runs into the time limit
        return real_sub(pattern, *args, **kwargs)

    _rule(u1_s1, find='slow', order=1)
    _rule(u1_s1, find='soup', replace='Stew', order=2)
    with patch.object(regex, 'sub', side_effect=sub):
        assert _apply(u1_s1, 'Soup', _engine(u1_s1, use_cache=use_cache)) == 'Stew'


@pytest.mark.parametrize("use_cache", [False, True])
@pytest.mark.parametrize("rule", [
    {'find': 'soup', 'replace': r'\g<nothing>'},  # a replacement that refers to a group the pattern does not have
    {'source': None},  # a rule that was saved without its source pattern
    {'find': None},  # or without its pattern
], ids=['unknown group', 'no source pattern', 'no pattern'])
def test_regex_replacement_skips_a_rule_that_is_incomplete(rule, use_cache, u1_s1, empty_rule_cache):
    _rule(u1_s1, **rule, order=1)
    _rule(u1_s1, find='soup', replace='Stew', order=2)
    assert _apply(u1_s1, 'Soup', _engine(u1_s1, use_cache=use_cache)) == 'Stew'


@pytest.mark.parametrize("use_cache", [False, True])
def test_regex_replacement_without_a_replacement_deletes(use_cache, u1_s1, empty_rule_cache):
    _rule(u1_s1, find='soup', replace=None)
    assert _apply(u1_s1, 'Hot soup', _engine(u1_s1, use_cache=use_cache)) == 'Hot '


@pytest.mark.parametrize("use_cache", [False, True])
def test_regex_replacement_does_not_try_a_broken_rule_again_for_every_string(use_cache, u1_s1, empty_rule_cache):
    """An import applies the rules to every ingredient, step and keyword; a rule that failed once must not cost its time again each time."""
    real_sub = regex.sub
    calls = []

    def sub(pattern, *args, **kwargs):
        calls.append(pattern)
        return real_sub(pattern, *args, **kwargs)

    _rule(u1_s1, find='(', order=1)  # not a valid pattern
    _rule(u1_s1, find='soup', replace='Stew', order=2)
    engine = _engine(u1_s1, use_cache=use_cache)
    with patch.object(regex, 'sub', side_effect=sub):
        results = [_apply(u1_s1, text, engine) for text in ('Soup', 'Hot soup', 'Soup soup')]
    assert results == ['Stew', 'Hot Stew', 'Stew Stew']
    assert calls.count('(') == 1


# ---------------------------------------------------------------------------------------------------------------------
# Alias, never-unit and transpose rules. Every rule type works through the database or, with use_cache, through a copy kept
# in memory and in the cache for 30 seconds; the two have to give the same answer.
# ---------------------------------------------------------------------------------------------------------------------

def _alias(client, rule_type, find, target, **extra):
    space = _space_of(client)
    with scope(space=space):
        return Automation.objects.create(name=f'{rule_type} {find}', type=rule_type, param_1=find, param_2=target,
                                         created_by=auth.get_user(client), space=space, **extra)


def _delete_all_rules(client):
    with scope(space=_space_of(client)):
        Automation.objects.all().delete()


ALIASES = [
    (Automation.KEYWORD_ALIAS, 'apply_keyword_automation'),
    (Automation.UNIT_ALIAS, 'apply_unit_automation'),
    (Automation.FOOD_ALIAS, 'apply_food_automation'),
]


def _call(client, engine, method, *args):
    with scope(space=_space_of(client)):
        return getattr(engine, method)(*args)


@pytest.mark.parametrize("use_cache", [False, True])
@pytest.mark.parametrize("rule_type,method", ALIASES)
class TestAliasRules:

    @pytest.mark.parametrize("text", ['tomato', 'TOMATO', 'Tomato', '  tomato  '])
    def test_an_alias_matches_in_any_case_and_ignores_surrounding_space(self, text, rule_type, method, use_cache, u1_s1, empty_rule_cache):
        _alias(u1_s1, rule_type, 'Tomato', 'Tomatoes')
        assert _call(u1_s1, _engine(u1_s1, use_cache=use_cache), method, text) == 'Tomatoes'

    def test_without_an_alias_the_text_comes_back_trimmed(self, rule_type, method, use_cache, u1_s1, empty_rule_cache):
        _alias(u1_s1, rule_type, 'tomato', 'Tomatoes')
        assert _call(u1_s1, _engine(u1_s1, use_cache=use_cache), method, '  potato ') == 'potato'

    def test_an_alias_needs_the_whole_text_to_match(self, rule_type, method, use_cache, u1_s1, empty_rule_cache):
        _alias(u1_s1, rule_type, 'tomato', 'Tomatoes')
        assert _call(u1_s1, _engine(u1_s1, use_cache=use_cache), method, 'tomato paste') == 'tomato paste'

    def test_disabled_aliases_and_those_of_other_spaces_are_ignored(self, rule_type, method, use_cache, u1_s1, u1_s2, empty_rule_cache):
        _alias(u1_s1, rule_type, 'tomato', 'Disabled', disabled=True)
        _alias(u1_s2, rule_type, 'tomato', 'Other space')
        assert _call(u1_s1, _engine(u1_s1, use_cache=use_cache), method, 'tomato') == 'tomato'

    def test_the_first_alias_by_order_wins(self, rule_type, method, use_cache, u1_s1, empty_rule_cache):
        _alias(u1_s1, rule_type, 'tomato', 'Second', order=2)
        _alias(u1_s1, rule_type, 'tomato', 'First', order=1)
        assert _call(u1_s1, _engine(u1_s1, use_cache=use_cache), method, 'tomato') == 'First'

    def test_a_cache_keeps_the_aliases_for_later_calls_and_other_engines(self, rule_type, method, use_cache, u1_s1, empty_rule_cache):
        _alias(u1_s1, rule_type, 'tomato', 'Tomatoes')
        engine = _engine(u1_s1, use_cache=use_cache)
        assert _call(u1_s1, engine, method, 'tomato') == 'Tomatoes'
        _delete_all_rules(u1_s1)
        kept = 'Tomatoes' if use_cache else 'tomato'
        assert _call(u1_s1, engine, method, 'tomato') == kept  # the same engine
        assert _call(u1_s1, _engine(u1_s1, use_cache=use_cache), method, 'tomato') == kept  # another one, as in the next request


@pytest.mark.parametrize("use_cache", [False, True])
@pytest.mark.parametrize("alias_type,replace_type,method", [
    (Automation.UNIT_ALIAS, Automation.UNIT_REPLACE, 'apply_unit_automation'),
    (Automation.FOOD_ALIAS, Automation.FOOD_REPLACE, 'apply_food_automation'),
])
class TestAliasesAndReplacementRules:

    def test_an_alias_is_the_final_answer(self, alias_type, replace_type, method, use_cache, u1_s1, empty_rule_cache):
        _alias(u1_s1, alias_type, 'tomato', 'Tomatoes')
        _rule(u1_s1, replace_type=replace_type, find='Tomatoes', replace='Changed')
        assert _call(u1_s1, _engine(u1_s1, use_cache=use_cache), method, 'tomato') == 'Tomatoes'

    def test_a_text_without_an_alias_goes_through_the_replacement_rules(self, alias_type, replace_type, method, use_cache, u1_s1, empty_rule_cache):
        _alias(u1_s1, alias_type, 'tomato', 'Tomatoes')
        _rule(u1_s1, replace_type=replace_type, find='potato', replace='Spud')
        assert _call(u1_s1, _engine(u1_s1, use_cache=use_cache), method, 'potato') == 'Spud'


@pytest.mark.parametrize("use_cache", [False, True])
class TestNeverUnitRules:

    @pytest.mark.parametrize("unit,tokens,expected", [
        ('', [1, 'egg', 'white'], [1, '', 'egg', 'white']),
        ('whole', [1, 'egg', 'white'], [1, 'whole', 'egg', 'white']),
        ('', [1, 'EGG', 'white'], [1, '', 'EGG', 'white']),
        ('', [1, 'cup', 'flour'], [1, 'cup', 'flour']),
    ])
    def test_the_word_is_moved_to_the_food_and_a_unit_can_be_put_in_its_place(self, unit, tokens, expected, use_cache, u1_s1, empty_rule_cache):
        _alias(u1_s1, Automation.NEVER_UNIT, 'egg', unit)
        assert _call(u1_s1, _engine(u1_s1, use_cache=use_cache), 'apply_never_unit_automation', tokens)[0] == expected

    def test_it_reports_whether_it_applied(self, use_cache, u1_s1, empty_rule_cache):
        _alias(u1_s1, Automation.NEVER_UNIT, 'egg', '')
        engine = _engine(u1_s1, use_cache=use_cache)
        assert _call(u1_s1, engine, 'apply_never_unit_automation', [1, 'egg', 'white'])[1] is True
        assert _call(u1_s1, engine, 'apply_never_unit_automation', [1, 'cup', 'flour'])[1] is False

    def test_a_unit_that_is_an_alias_of_the_word_counts_too(self, use_cache, u1_s1, empty_rule_cache):
        _alias(u1_s1, Automation.UNIT_ALIAS, 'eggs', 'egg')
        _alias(u1_s1, Automation.NEVER_UNIT, 'egg', '')
        tokens = _call(u1_s1, _engine(u1_s1, use_cache=use_cache), 'apply_never_unit_automation', [2, 'eggs', 'white'])[0]
        assert tokens == [2, '', 'eggs', 'white']

    def test_disabled_rules_and_those_of_other_spaces_are_ignored(self, use_cache, u1_s1, u1_s2, empty_rule_cache):
        _alias(u1_s1, Automation.NEVER_UNIT, 'egg', '', disabled=True)
        _alias(u1_s2, Automation.NEVER_UNIT, 'egg', '')
        assert _call(u1_s1, _engine(u1_s1, use_cache=use_cache), 'apply_never_unit_automation', [1, 'egg', 'white'])[0] == [1, 'egg', 'white']

    def test_a_cache_keeps_the_rules_for_later_calls(self, use_cache, u1_s1, empty_rule_cache):
        _alias(u1_s1, Automation.NEVER_UNIT, 'egg', '')
        engine = _engine(u1_s1, use_cache=use_cache)
        assert _call(u1_s1, engine, 'apply_never_unit_automation', [1, 'egg', 'white'])[1] is True
        _delete_all_rules(u1_s1)
        assert _call(u1_s1, engine, 'apply_never_unit_automation', [1, 'egg', 'white'])[1] is use_cache


@pytest.mark.parametrize("use_cache", [False, True])
class TestTransposeRules:

    @pytest.mark.parametrize("text,expected", [
        ('second first', 'first second'),
        ('Second First', 'First Second'),  # the capitals stay as they were written
        ('SECOND, first', 'first SECOND'),
        ('longer string second first longer string', 'longer string first second longer string'),
        ('second fails first', 'second fails first'),
        ('first second', 'first second'),  # already the right way round
        ('second', 'second'),
    ])
    def test_two_words_are_swapped_when_they_follow_each_other(self, text, expected, use_cache, u1_s1, empty_rule_cache):
        _alias(u1_s1, Automation.TRANSPOSE_WORDS, 'second', 'first')
        assert _call(u1_s1, _engine(u1_s1, use_cache=use_cache), 'apply_transpose_automation', text) == expected

    def test_the_rule_is_not_case_sensitive(self, use_cache, u1_s1, empty_rule_cache):
        _alias(u1_s1, Automation.TRANSPOSE_WORDS, 'Second', 'FIRST')
        assert _call(u1_s1, _engine(u1_s1, use_cache=use_cache), 'apply_transpose_automation', 'second first') == 'first second'

    @pytest.mark.parametrize("first,second,text,expected", [
        ('c++', 'sauce', 'c++ sauce', 'sauce c++'),
        ('a(', 'b', 'a( b', 'b a('),  # not a valid pattern, but a valid word
        ('a.b', 'c', 'a.b c', 'c a.b'),
        ('a.b', 'c', 'axb c', 'axb c'),  # the dot is a dot and not any character
        ('a|b', 'c', 'a c', 'a c'),  # and the bar is not an alternative
    ])
    def test_the_words_are_taken_literally(self, first, second, text, expected, use_cache, u1_s1, empty_rule_cache):
        _alias(u1_s1, Automation.TRANSPOSE_WORDS, first, second)
        assert _call(u1_s1, _engine(u1_s1, use_cache=use_cache), 'apply_transpose_automation', text) == expected

    def test_disabled_rules_and_those_of_other_spaces_are_ignored(self, use_cache, u1_s1, u1_s2, empty_rule_cache):
        _alias(u1_s1, Automation.TRANSPOSE_WORDS, 'second', 'first', disabled=True)
        _alias(u1_s2, Automation.TRANSPOSE_WORDS, 'second', 'first')
        assert _call(u1_s1, _engine(u1_s1, use_cache=use_cache), 'apply_transpose_automation', 'second first') == 'second first'

    def test_several_rules_all_apply(self, use_cache, u1_s1, empty_rule_cache):
        _alias(u1_s1, Automation.TRANSPOSE_WORDS, 'second', 'first')
        _alias(u1_s1, Automation.TRANSPOSE_WORDS, 'salt', 'pepper')
        assert _call(u1_s1, _engine(u1_s1, use_cache=use_cache), 'apply_transpose_automation', 'second first and salt pepper') == 'first second and pepper salt'

    def test_a_cache_keeps_the_rules_for_later_calls(self, use_cache, u1_s1, empty_rule_cache):
        _alias(u1_s1, Automation.TRANSPOSE_WORDS, 'second', 'first')
        engine = _engine(u1_s1, use_cache=use_cache)
        assert _call(u1_s1, engine, 'apply_transpose_automation', 'second first') == 'first second'
        _delete_all_rules(u1_s1)
        assert _call(u1_s1, engine, 'apply_transpose_automation', 'second first') == ('first second' if use_cache else 'second first')


# ---------------------------------------------------------------------------------------------------------------------
# What the regex rules promise about their cache, their time limit and the length of the address they look at.
# ---------------------------------------------------------------------------------------------------------------------

def test_regex_rules_are_read_from_the_cache_by_the_same_engine_and_by_another_one(u1_s1, empty_rule_cache):
    _rule(u1_s1, find='soup', replace='Stew')
    engine = _engine(u1_s1, use_cache=True)
    assert _apply(u1_s1, 'Soup', engine) == 'Stew'
    _delete_all_rules(u1_s1)
    assert _apply(u1_s1, 'Soup', engine) == 'Stew'
    assert _apply(u1_s1, 'Soup', _engine(u1_s1, use_cache=True)) == 'Stew'
    assert _apply(u1_s1, 'Soup', _engine(u1_s1, use_cache=False)) == 'Soup'


@pytest.mark.parametrize("use_cache", [False, True])
def test_regex_rules_run_with_the_time_limit(use_cache, u1_s1, empty_rule_cache):
    _rule(u1_s1, find='soup', replace='Stew')
    with patch.object(regex, 'search', wraps=regex.search) as search, patch.object(regex, 'sub', wraps=regex.sub) as sub:
        assert _apply(u1_s1, 'Soup', _engine(u1_s1, use_cache=use_cache)) == 'Stew'
    assert search.call_args.kwargs['timeout'] == REGEX_TIMEOUT
    assert sub.call_args.kwargs['timeout'] == REGEX_TIMEOUT


@pytest.mark.parametrize("source,applied", [
    ('a' * 511 + 'X' + 'tail', True),  # the 512th character is the last one looked at
    ('a' * 512 + 'X', False),
])
def test_regex_rules_look_at_the_first_512_characters_of_the_address(source, applied, u1_s1, empty_rule_cache):
    _rule(u1_s1, source='X$', find='soup', replace='Stew')
    assert (_apply(u1_s1, 'Soup', _engine(u1_s1, source=source)) == 'Stew') is applied
