import json
from datetime import datetime, timedelta, timezone

import pytest
from django.contrib import auth
from django.urls import reverse
from django.utils import timezone as django_timezone
from django_scopes import scope, scopes_disabled

from cookbook.models import Keyword, Recipe, SearchFields
from cookbook.tests.factories import CookLogFactory, FoodFactory, IngredientFactory, KeywordFactory, RecipeBookEntryFactory, RecipeFactory, UnitFactory, ViewLogFactory
from cookbook.tests.other.conftest import _make_recipe_with_step, requires_postgres

LIST_URL = 'api:recipe-list'


def _get_ids(client, params=''):
    """Helper: GET recipe list and return set of result IDs."""
    r = json.loads(client.get(reverse(LIST_URL) + f'?{params}').content)
    return {x['id'] for x in r['results']}, r['count']


@pytest.fixture
def setup_recipes(space_1):
    """Create 3 recipes with a step each + 5 background."""
    r1, r2, r3 = [_make_recipe_with_step(space_1) for _ in range(3)]
    bg = RecipeFactory.create_batch(5, space=space_1, steps__count=0, keywords__count=0)
    return r1, r2, r3, bg


class TestHTTPFoodFilter:

    def test_food_or_via_api(self, setup_recipes, u1_s1, space_1):
        r1, r2, r3, bg = setup_recipes
        with scopes_disabled():
            food = FoodFactory.create(space=space_1)
            r1.steps.first().ingredients.add(IngredientFactory.create(food=food, space=space_1))
        ids, count = _get_ids(u1_s1, f'foods_or={food.id}')
        assert r1.id in ids
        assert count == 1


class TestHTTPKeywordFilter:

    def test_keyword_or_via_api(self, setup_recipes, u1_s1, space_1):
        r1, r2, r3, bg = setup_recipes
        with scopes_disabled():
            kw = KeywordFactory.create(space=space_1)
            r1.keywords.add(kw)
        ids, count = _get_ids(u1_s1, f'keywords_or={kw.id}')
        assert r1.id in ids
        assert count == 1


class TestHTTPBookFilter:

    def test_book_or_via_api(self, setup_recipes, u1_s1, space_1):
        r1, r2, r3, bg = setup_recipes
        with scopes_disabled():
            book = RecipeBookEntryFactory.create(recipe=r1).book
        ids, count = _get_ids(u1_s1, f'books_or={book.id}')
        assert r1.id in ids
        assert count == 1


class TestHTTPUnitFilter:

    def test_units_via_api(self, setup_recipes, u1_s1, space_1):
        r1, r2, r3, bg = setup_recipes
        with scopes_disabled():
            unit = UnitFactory.create(space=space_1)
            r1.steps.first().ingredients.add(IngredientFactory.create(unit=unit, space=space_1))
        ids, count = _get_ids(u1_s1, f'units={unit.id}')
        assert r1.id in ids
        assert count == 1


class TestHTTPRatingFilter:

    def test_rating_gte_via_api(self, setup_recipes, u1_s1, space_1):
        r1, r2, r3, bg = setup_recipes
        user = auth.get_user(u1_s1)
        CookLogFactory.create(recipe=r1, created_by=user, rating=5.0, space=space_1)
        ids, count = _get_ids(u1_s1, 'rating_gte=4')
        assert r1.id in ids
        assert r2.id not in ids


class TestHTTPTextSearch:

    def test_query_via_api(self, u1_s1, space_1):
        with scopes_disabled():
            r = RecipeFactory.create(space=space_1, name='UniqueFindableTestName123')
            user = auth.get_user(u1_s1)
            user.searchpreference.icontains.set(SearchFields.objects.all())
            user.searchpreference.save()
        ids, count = _get_ids(u1_s1, 'query=UniqueFindableTestName123')
        assert r.id in ids


class TestHTTPInternalFilter:

    def test_internal_filter_via_api(self, setup_recipes, u1_s1, space_1):
        r1, r2, r3, bg = setup_recipes
        with scope(space=space_1):
            Recipe.objects.filter(id=r1.id).update(internal=False)
        ids, count = _get_ids(u1_s1, 'internal=true')
        assert r1.id not in ids


# ========================== FUZZY LOOKUPS (list endpoints) ==========================

UNACCENTED = "abcdef ghijklmn opqrst uvwxyz"
ACCENTED = "àbçđêf ğĦìĵķĽmñ öPqŕşŧ úvŵxyž"


def _get_list_ids(client, list_url, params=''):
    """Helper: GET a model list endpoint and return set of result IDs."""
    r = json.loads(client.get(reverse(list_url) + f'?{params}').content)
    return {x['id'] for x in r['results']}


def _set_fuzzy_prefs(user, *, lookup=False, trigram=False, unaccent=False):
    pref = user.searchpreference
    pref.lookup = lookup
    if trigram:
        pref.trigram.set(SearchFields.objects.all())
    else:
        pref.trigram.set([])
    if unaccent:
        pref.unaccent.set(SearchFields.objects.all())
    else:
        pref.unaccent.set([])
    pref.save()


class TestFuzzyLookupFood:
    """Test fuzzy/trigram query on food list endpoint."""

    @requires_postgres
    def test_food_trigram_finds_match(self, u1_s1, space_1):
        with scopes_disabled():
            food = FoodFactory.create(name=UNACCENTED, space=space_1)
            user = auth.get_user(u1_s1)
            _set_fuzzy_prefs(user, trigram=True)
        ids = _get_list_ids(u1_s1, 'api:food-list', f'query={UNACCENTED}')
        assert food.id in ids

    @requires_postgres
    def test_food_trigram_with_unaccent(self, u1_s1, space_1):
        with scopes_disabled():
            food = FoodFactory.create(name=ACCENTED, space=space_1)
            user = auth.get_user(u1_s1)
            _set_fuzzy_prefs(user, trigram=True, unaccent=True)
        ids = _get_list_ids(u1_s1, 'api:food-list', f'query={UNACCENTED}')
        assert food.id in ids


class TestFuzzyLookupKeyword:
    """Test fuzzy/trigram query on keyword list endpoint."""

    @requires_postgres
    def test_keyword_trigram_finds_match(self, u1_s1, space_1):
        with scopes_disabled():
            kw = KeywordFactory.create(name=UNACCENTED, space=space_1)
            user = auth.get_user(u1_s1)
            _set_fuzzy_prefs(user, trigram=True)
        ids = _get_list_ids(u1_s1, 'api:keyword-list', f'query={UNACCENTED}')
        assert kw.id in ids

    @requires_postgres
    def test_keyword_trigram_with_unaccent(self, u1_s1, space_1):
        with scopes_disabled():
            kw = KeywordFactory.create(name=ACCENTED, space=space_1)
            user = auth.get_user(u1_s1)
            _set_fuzzy_prefs(user, trigram=True, unaccent=True)
        ids = _get_list_ids(u1_s1, 'api:keyword-list', f'query={UNACCENTED}')
        assert kw.id in ids


class TestFuzzyLookupUnit:
    """Test fuzzy/trigram query on unit list endpoint."""

    @requires_postgres
    def test_unit_trigram_finds_match(self, u1_s1, space_1):
        with scopes_disabled():
            unit = UnitFactory.create(name=UNACCENTED, space=space_1)
            user = auth.get_user(u1_s1)
            _set_fuzzy_prefs(user, trigram=True)
        ids = _get_list_ids(u1_s1, 'api:unit-list', f'query={UNACCENTED}')
        assert unit.id in ids

    @requires_postgres
    def test_unit_trigram_with_unaccent(self, u1_s1, space_1):
        with scopes_disabled():
            unit = UnitFactory.create(name=ACCENTED, space=space_1)
            user = auth.get_user(u1_s1)
            _set_fuzzy_prefs(user, trigram=True, unaccent=True)
        ids = _get_list_ids(u1_s1, 'api:unit-list', f'query={UNACCENTED}')
        assert unit.id in ids


class TestHTTPDuplicateQueryParams:
    """Duplicate query params must not crash scalar fields or drop list values."""

    def test_duplicate_scalar_does_not_crash(self, setup_recipes, u1_s1):
        r = u1_s1.get(reverse(LIST_URL) + '?query=a&query=b')
        assert r.status_code == 200

    def test_duplicate_scalar_last_wins(self, setup_recipes, u1_s1, space_1):
        with scopes_disabled():
            RecipeFactory.create(space=space_1, name='DupScalarFirst', description='',
                                 steps__count=0, keywords__count=0)
            r_b = RecipeFactory.create(space=space_1, name='DupScalarSecond', description='',
                                       steps__count=0, keywords__count=0)
        ids, _ = _get_ids(u1_s1, 'query=DupScalarFirst&query=DupScalarSecond')
        assert r_b.id in ids

    def test_duplicate_list_filter_preserves_all_values(self, setup_recipes, u1_s1, space_1):
        r1, r2, r3, bg = setup_recipes
        with scopes_disabled():
            kw_a = KeywordFactory.create(space=space_1)
            kw_b = KeywordFactory.create(space=space_1)
            r1.keywords.add(kw_a)
            r2.keywords.add(kw_b)
        ids, _ = _get_ids(u1_s1, f'keywords={kw_a.id}&keywords={kw_b.id}')
        assert r1.id in ids
        assert r2.id in ids


# ---------------------------------------------------------------------------------------------------------------------
# Query string parameters, sent the way the frontend sends them. The filter tests above and in test_recipe_search_filters.py
# hand their settings straight to RecipeSearch, so a parameter that is never read from the query string went unnoticed.
# ---------------------------------------------------------------------------------------------------------------------

def _recipe(space, client, **kwargs):
    with scopes_disabled():
        return RecipeFactory.create(space=space, created_by=auth.get_user(client), steps__count=0, keywords__count=0, **kwargs)


def _ordered_ids(client, params=''):
    """The ids of the recipe list in the order the API returned them."""
    r = json.loads(client.get(reverse(LIST_URL) + f'?{params}').content)
    return [x['id'] for x in r['results']]


class TestHTTPTimeRanges:

    @pytest.fixture
    def timed(self, space_1, u1_s1):
        # (working, waiting) -> total 20, 60, 95
        return [_recipe(space_1, u1_s1, working_time=w, waiting_time=t) for w, t in ((10, 10), (30, 30), (5, 90))]

    @pytest.mark.parametrize("params,expected", [
        ('waiting_time_gte=30', {1, 2}),
        ('waiting_time_lte=30', {0, 1}),
        ('waiting_time_gte=20&waiting_time_lte=40', {1}),
        ('waiting_time_gte=0', {0, 1, 2}),  # an explicit 0 is a boundary, not "not given"
        ('waiting_time_lte=0', set()),
        ('total_time_gte=60', {1, 2}),
        ('total_time_lte=60', {0, 1}),  # the sum counts: recipe 2 works only 5 minutes but takes 95
        ('total_time_gte=30&total_time_lte=70', {1}),
        ('total_time_lte=19', set()),
    ])
    def test_time_bounds(self, params, expected, timed, u1_s1):
        assert _get_ids(u1_s1, params)[0] == {timed[i].id for i in expected}


class TestHTTPDateFilters:

    @pytest.fixture
    def dated(self, space_1, u1_s1):
        noon = datetime(2020, 3, 1, 12, 0, tzinfo=timezone.utc)
        recipes = [_recipe(space_1, u1_s1, created_at=noon + delta) for delta in (timedelta(0), timedelta(hours=1), timedelta(days=1))]
        with scopes_disabled():
            for recipe, delta in zip(recipes, (timedelta(0), timedelta(hours=1), timedelta(days=1))):
                Recipe.objects.filter(pk=recipe.pk).update(updated_at=noon + delta + timedelta(days=100))
        return recipes

    @pytest.mark.parametrize("params,expected", [
        ('createdon=2020-03-01', {0, 1}),
        ('createdon=2020-03-02', {2}),
        ('createdon=2020-03-05', set()),
        ('updatedon=2020-06-09', {0, 1}),
        ('updatedon=2020-06-10', {2}),
        ('updatedon=2020-01-01', set()),
    ])
    def test_exact_dates(self, params, expected, dated, u1_s1):
        assert _get_ids(u1_s1, params)[0] == {dated[i].id for i in expected}


class TestHTTPStepsFilter:

    def test_steps_by_one_or_more_ids(self, space_1, u1_s1):
        recipes = [_make_recipe_with_step(space_1) for _ in range(3)]
        with scopes_disabled():
            step_ids = [r.steps.first().id for r in recipes]
        assert _get_ids(u1_s1, f'steps={step_ids[0]}')[0] == {recipes[0].id}
        assert _get_ids(u1_s1, f'steps={step_ids[0]}&steps={step_ids[2]}')[0] == {recipes[0].id, recipes[2].id}


class TestHTTPPinnedAndFlagged:

    def test_new_puts_recipes_created_in_the_last_week_first(self, space_1, u1_s1):
        now = django_timezone.now()
        old = _recipe(space_1, u1_s1, name='Aardvark stew', created_at=now - timedelta(days=30))
        fresh = _recipe(space_1, u1_s1, name='Zebra stew', created_at=now - timedelta(days=1))
        assert _ordered_ids(u1_s1) == [old.id, fresh.id]  # by name
        assert _ordered_ids(u1_s1, 'new=true') == [fresh.id, old.id]
        assert _ordered_ids(u1_s1, 'new=false') == [old.id, fresh.id]

    def test_num_recent_puts_the_recipes_viewed_last_first(self, space_1, u1_s1):
        first = _recipe(space_1, u1_s1, name='Alpha stew')
        last = _recipe(space_1, u1_s1, name='Zulu stew')
        with scopes_disabled():
            ViewLogFactory.create(recipe=last, created_by=auth.get_user(u1_s1), space=space_1)
        assert _ordered_ids(u1_s1) == [first.id, last.id]  # nothing is pinned by default
        assert _ordered_ids(u1_s1, 'num_recent=1') == [last.id, first.id]

    def test_unrated_returns_what_the_user_has_not_rated(self, space_1, u1_s1):
        rated = _recipe(space_1, u1_s1)
        unrated = _recipe(space_1, u1_s1)
        with scopes_disabled():
            CookLogFactory.create(recipe=rated, created_by=auth.get_user(u1_s1), rating=5, space=space_1)
        assert _get_ids(u1_s1)[0] == {rated.id, unrated.id}
        assert _get_ids(u1_s1, 'unrated=false')[0] == {rated.id, unrated.id}
        assert _get_ids(u1_s1, 'unrated=true')[0] == {unrated.id}
        assert _get_ids(u1_s1, 'unrated=true&rating_gte=3')[0] == {unrated.id}  # a rating bound does not empty the result

    def test_sorting_by_rating(self, space_1, u1_s1):
        low = _recipe(space_1, u1_s1, name='Alpha stew')
        high = _recipe(space_1, u1_s1, name='Bravo stew')
        none = _recipe(space_1, u1_s1, name='Charlie stew')
        with scopes_disabled():
            CookLogFactory.create(recipe=low, created_by=auth.get_user(u1_s1), rating=1, space=space_1)
            CookLogFactory.create(recipe=high, created_by=auth.get_user(u1_s1), rating=5, space=space_1)
        assert _ordered_ids(u1_s1, 'sort_order=rating') == [low.id, high.id, none.id]
        assert _ordered_ids(u1_s1, 'sort_order=-rating') == [high.id, low.id, none.id]
        assert _ordered_ids(u1_s1, 'sort_order=-name') == [none.id, high.id, low.id]


class TestHTTPIncludeChildrenDefault:

    def test_a_parent_keyword_finds_recipes_with_its_children_unless_told_not_to(self, space_1, u1_s1):
        with scopes_disabled():
            parent = Keyword.add_root(name='parent keyword', space=space_1)
            child = parent.add_child(name='child keyword', space=space_1)
        with_child = _recipe(space_1, u1_s1)
        with_parent = _recipe(space_1, u1_s1)
        with scopes_disabled():
            with_child.keywords.add(child)
            with_parent.keywords.add(parent)
        both = {with_child.id, with_parent.id}
        assert _get_ids(u1_s1, f'keywords_or={parent.id}')[0] == both
        assert _get_ids(u1_s1, f'keywords_or={parent.id}&include_children=true')[0] == both
        assert _get_ids(u1_s1, f'keywords_or={parent.id}&include_children=false')[0] == {with_parent.id}


class TestHTTPRandomOrder:

    @pytest.fixture
    def many(self, space_1, u1_s1):
        return [_recipe(space_1, u1_s1, name=f'recipe {n:02d}') for n in range(12)]

    def test_a_seed_gives_one_order_and_another_seed_another(self, many, u1_s1):
        by_name = _ordered_ids(u1_s1)
        alpha = _ordered_ids(u1_s1, 'random=true&seed=alpha')
        assert alpha == _ordered_ids(u1_s1, 'random=true&seed=alpha')
        assert alpha != _ordered_ids(u1_s1, 'random=true&seed=beta')
        assert alpha != by_name
        assert sorted(alpha) == sorted(by_name)

    def test_random_false_and_a_seed_alone_keep_the_name_order(self, many, u1_s1):
        by_name = _ordered_ids(u1_s1)
        assert _ordered_ids(u1_s1, 'random=false&seed=alpha') == by_name
        assert _ordered_ids(u1_s1, 'seed=alpha') == by_name

    @pytest.mark.parametrize("sort_order", ['random', '-random'])
    def test_sort_order_random_is_the_random_flag(self, sort_order, many, u1_s1):
        by_name = _ordered_ids(u1_s1)
        shuffled = _ordered_ids(u1_s1, f'sort_order={sort_order}&seed=alpha')
        assert shuffled == _ordered_ids(u1_s1, 'random=true&seed=alpha')
        assert shuffled != by_name

    @pytest.mark.parametrize("seed", ['bad seed', 'x;y', 'a' * 65])
    def test_a_seed_that_is_not_letters_digits_dash_or_underscore_is_refused_with_a_reason(self, seed, many, u1_s1):
        response = u1_s1.get(reverse(LIST_URL), {'seed': seed})
        assert response.status_code == 400
        assert response.json()['detail'] == 'Parameter seed must be 1-64 letters, digits, "_" or "-"'

    def test_a_blank_seed_is_ignored_like_any_blank_parameter(self, many, u1_s1):
        assert _ordered_ids(u1_s1, 'random=false&seed=') == _ordered_ids(u1_s1)

    @pytest.mark.parametrize("seed", ['a', 'a-b_C1', 'a' * 64])
    def test_a_seed_of_allowed_characters_is_accepted(self, seed, many, u1_s1):
        assert u1_s1.get(reverse(LIST_URL), {'random': 'true', 'seed': seed}).status_code == 200
