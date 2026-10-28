import inspect
import uuid
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.contrib import auth
from django.contrib.auth.models import AnonymousUser, Group
from django.core.cache import cache
from django.http import HttpResponse
from django.test import RequestFactory
from django.urls import reverse
from django_scopes import scope, scopes_disabled

from cookbook.helper.permission_helper import (above_space_limit, above_space_recipe_limit, above_space_user_limit, can_view_meal_plan, can_view_recipe,
                                               create_space_for_user, get_allowed_groups, get_household_user_ids, group_required, has_group_permission,
                                               invalidate_household_cache, is_object_household, is_object_owner, is_object_shared, is_space_owner,
                                               share_link_valid, switch_user_active_space, visible_recipes_q)
from cookbook.models import Food, Recipe, RecipeBook, RecipeBookEntry, ShareLink, Space, UserSpace
from cookbook.tests.factories import HouseholdFactory, MealPlanFactory, UserFactory


def test_has_group_permission(u1_s1, a_u, space_2):
    with scopes_disabled():
        # test that a normal user has user permissions
        assert has_group_permission(auth.get_user(u1_s1), ('guest',), no_cache=True)
        assert has_group_permission(auth.get_user(u1_s1), ('user',), no_cache=True)
        assert not has_group_permission(auth.get_user(u1_s1), ('admin',), no_cache=True)

        # test that permissions are not taken from non active spaces
        us = UserSpace.objects.create(user=auth.get_user(u1_s1), space=space_2, active=False)
        us.groups.add(Group.objects.get(name='admin'))
        assert not has_group_permission(auth.get_user(u1_s1), ('admin',), no_cache=True)

        # disable all spaces and enable space 2 permission to check if permission is now valid
        auth.get_user(u1_s1).userspace_set.update(active=False)
        us.active = True
        us.save()
        assert has_group_permission(auth.get_user(u1_s1), ('admin',), no_cache=True)

        # test that group permission checks fail if more than one userspace is active
        auth.get_user(u1_s1).userspace_set.update(active=True)
        assert not has_group_permission(auth.get_user(u1_s1), ('user',), no_cache=True)

        # test that anonymous users don't have any permissions
        assert not has_group_permission(auth.get_user(a_u), ('guest',), no_cache=True)
        assert not has_group_permission(auth.get_user(a_u), ('user',), no_cache=True)
        assert not has_group_permission(auth.get_user(a_u), ('admin',), no_cache=True)


def test_has_group_permission_does_not_walk_the_call_stack(u1_s1):
    """The check runs several times for every request; inspect.stack() reads the source of every frame of a deep stack to get a constant name."""
    with patch.object(inspect, 'stack', side_effect=AssertionError('walked the call stack')):
        assert has_group_permission(auth.get_user(u1_s1), ('user',), no_cache=True)
        assert has_group_permission(auth.get_user(u1_s1), ('user',))


def test_is_owner(u1_s1, u2_s1, u1_s2, a_u, space_1, recipe_1_s1):
    with scopes_disabled():
        s = Space.objects.create(name='Test', created_by=auth.get_user(u1_s1))

        assert is_object_owner(auth.get_user(u1_s1), s)
        assert not is_object_owner(auth.get_user(u2_s1), s)
        assert not is_object_owner(auth.get_user(u1_s2), s)
        assert not is_object_owner(auth.get_user(a_u), s)

        rb = RecipeBook.objects.create(name='Test', created_by=auth.get_user(u1_s1), space=space_1)

        assert is_object_owner(auth.get_user(u1_s1), rb)
        assert not is_object_owner(auth.get_user(u2_s1), rb)
        assert not is_object_owner(auth.get_user(u1_s2), rb)
        assert not is_object_owner(auth.get_user(a_u), rb)

        rbe = RecipeBookEntry.objects.create(book=rb, recipe=recipe_1_s1)

        assert is_object_owner(auth.get_user(u1_s1), rbe)
        assert not is_object_owner(auth.get_user(u2_s1), rbe)
        assert not is_object_owner(auth.get_user(u1_s2), rbe)
        assert not is_object_owner(auth.get_user(a_u), rbe)


def test_is_space_owner(u1_s1, u2_s1, space_1, space_2):
    with scopes_disabled():
        f = Food.objects.create(name='Test', space=space_1)
        space_1.created_by = auth.get_user(u1_s1)
        space_1.save()

        assert is_space_owner(auth.get_user(u1_s1), f)
        assert is_space_owner(space_1.created_by, f)
        assert not is_space_owner(auth.get_user(u2_s1), f)

        f.space = space_2
        f.save()

        assert not is_space_owner(auth.get_user(u1_s1), f)
        assert not is_space_owner(space_1.created_by, f)
        assert not is_space_owner(auth.get_user(u2_s1), f)


def test_switch_user_active_space(u1_s1, u1_s2, space_1, space_2):
    with scopes_disabled():
        # can switch to already active space
        assert switch_user_active_space(auth.get_user(u1_s1), space_1) == auth.get_user(u1_s1).userspace_set.filter(active=True).get()

        # cannot switch to a space the user does not belong to
        assert switch_user_active_space(auth.get_user(u1_s1), space_2) is None

        # can join another space and be member of two spaces
        us = UserSpace.objects.create(user=auth.get_user(u1_s1), space=space_2, active=False)
        assert len(auth.get_user(u1_s1).userspace_set.all()) == 2

        # can switch into newly created space
        assert switch_user_active_space(auth.get_user(u1_s1), space_2) == us


# ---------------------------------------------------------------------------------------------------------------------
# Share links: a link opens exactly one recipe, only with its own secret, and not once it is blocked or used up.
# ---------------------------------------------------------------------------------------------------------------------

def _share_link(recipe, **kwargs):
    with scopes_disabled():
        return ShareLink.objects.create(recipe=recipe, created_by=recipe.created_by, space=recipe.space, **kwargs)


def test_share_link_valid_accepts_the_secret_of_the_recipes_own_link(recipe_1_s1):
    link = _share_link(recipe_1_s1)
    with scopes_disabled():
        assert share_link_valid(recipe_1_s1, link.uuid)


def test_share_link_valid_refuses_a_secret_that_belongs_to_no_link(recipe_1_s1):
    _share_link(recipe_1_s1)
    with scopes_disabled():
        assert not share_link_valid(recipe_1_s1, uuid.uuid4())


def test_share_link_valid_refuses_something_that_is_not_a_secret_at_all(recipe_1_s1):
    _share_link(recipe_1_s1)
    with scopes_disabled():
        assert not share_link_valid(recipe_1_s1, 'not-a-uuid')


def test_share_link_valid_refuses_the_link_of_another_recipe(recipe_1_s1, recipe_2_s1):
    link = _share_link(recipe_1_s1)
    _share_link(recipe_2_s1)
    with scopes_disabled():
        assert not share_link_valid(recipe_2_s1, link.uuid)


def test_share_link_valid_refuses_a_link_that_is_blocked_for_abuse(recipe_1_s1):
    link = _share_link(recipe_1_s1, abuse_blocked=True)
    with scopes_disabled():
        assert not share_link_valid(recipe_1_s1, link.uuid)


def test_share_link_valid_counts_a_view_but_not_an_answer_from_the_cache(recipe_1_s1):
    link = _share_link(recipe_1_s1)
    with scopes_disabled():
        assert share_link_valid(recipe_1_s1, link.uuid)
        assert share_link_valid(recipe_1_s1, link.uuid)  # answered from the cache
        link.refresh_from_db()
        assert link.request_count == 1

        cache.clear()
        assert share_link_valid(recipe_1_s1, link.uuid)
        link.refresh_from_db()
        assert link.request_count == 2


@pytest.mark.parametrize("limit,views,space_has_no_limit,valid", [
    (0, 100, False, True),  # no limit set
    (2, 0, False, True),
    (2, 2, False, True),  # the limit is reached, not yet passed
    (2, 3, False, False),
    (1, 2, False, False),
    (2, 3, True, True),  # a space can be exempt
])
def test_share_link_valid_applies_the_sharing_limit(limit, views, space_has_no_limit, valid, recipe_1_s1, space_1, settings):
    settings.SHARING_LIMIT = limit
    space_1.no_sharing_limit = space_has_no_limit
    space_1.save()
    link = _share_link(recipe_1_s1, request_count=views)
    with scopes_disabled():
        assert share_link_valid(recipe_1_s1, link.uuid) is valid


def test_share_link_valid_does_not_count_a_view_it_refused(recipe_1_s1, settings):
    settings.SHARING_LIMIT = 1
    link = _share_link(recipe_1_s1, request_count=5)
    with scopes_disabled():
        assert not share_link_valid(recipe_1_s1, link.uuid)
        link.refresh_from_db()
        assert link.request_count == 5


# ---------------------------------------------------------------------------------------------------------------------
# Households: who counts as sharing a household with the owner of something.
# ---------------------------------------------------------------------------------------------------------------------

def _join(user, space, household=None):
    return UserSpace.objects.create(user=user, space=space, household=household, active=True)


def _owners_userspace(client, space):
    return auth.get_user(client).userspace_set.get(space=space)


def test_is_object_household_is_true_for_the_owner_and_members_of_the_owners_household(u1_s1, space_1, recipe_1_s1):
    with scopes_disabled():
        household = HouseholdFactory(space=space_1)
        owner_userspace = _owners_userspace(u1_s1, space_1)
        owner_userspace.household = household
        owner_userspace.save()
        member = UserFactory(space=space_1)
        _join(member, space_1, household)

        assert is_object_household(auth.get_user(u1_s1), recipe_1_s1)
        assert is_object_household(member, recipe_1_s1)


def test_is_object_household_is_false_for_everyone_else(u1_s1, space_1, space_2, recipe_1_s1):
    with scopes_disabled():
        household = HouseholdFactory(space=space_1)
        owner_userspace = _owners_userspace(u1_s1, space_1)
        owner_userspace.household = household
        owner_userspace.save()

        in_another_household = UserFactory(space=space_1)
        _join(in_another_household, space_1, HouseholdFactory(space=space_1))
        without_household = UserFactory(space=space_1)
        _join(without_household, space_1)
        in_another_space = UserFactory(space=space_2)
        _join(in_another_space, space_2, HouseholdFactory(space=space_2))
        # a row in another space that points at this household must not make its user a member
        pointing_across_spaces = UserFactory(space=space_2)
        _join(pointing_across_spaces, space_2, household)

        for stranger in (in_another_household, without_household, in_another_space, pointing_across_spaces, AnonymousUser()):
            assert not is_object_household(stranger, recipe_1_s1)


def test_is_object_household_is_false_when_the_owner_has_no_household(u1_s1, u2_s1, space_1, recipe_1_s1):
    # two people who both have no household do not share one
    with scopes_disabled():
        assert not _owners_userspace(u1_s1, space_1).household_id
        assert not is_object_household(auth.get_user(u2_s1), recipe_1_s1)


def test_household_user_ids_list_only_the_members_of_that_household(space_1, space_2):
    with scopes_disabled():
        household = HouseholdFactory(space=space_1)
        a, b, in_other_household, across_spaces, loner = (UserFactory(space=space_1) for _ in range(5))
        userspace_a = _join(a, space_1, household)
        _join(b, space_1, household)
        _join(in_other_household, space_1, HouseholdFactory(space=space_1))
        _join(across_spaces, space_2, household)  # a row in another space that points at this household
        loner_userspace = _join(loner, space_1)

        assert set(get_household_user_ids(userspace_a)) == {a.id, b.id}
        assert set(get_household_user_ids(loner_userspace)) == {loner.id}
        assert get_household_user_ids(None) == []


# ---------------------------------------------------------------------------------------------------------------------
# Groups
# ---------------------------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("required,allowed", [
    (['guest'], {'guest', 'user', 'admin'}),
    (['user'], {'user', 'admin'}),
    (['admin'], {'admin'}),
    (['guest', 'admin'], {'guest', 'user', 'admin'}),
    (('user',), {'user', 'admin'}),
])
def test_get_allowed_groups_adds_the_higher_groups(required, allowed):
    assert set(get_allowed_groups(required)) == allowed


@pytest.mark.parametrize("fixture,guest,user,admin", [
    ('g1_s1', True, False, False),
    ('u1_s1', True, True, False),
    ('a1_s1', True, True, True),
    ('ng1_s1', False, False, False),  # a user who belongs to no space
    ('a_u', False, False, False),
])
def test_a_group_includes_the_groups_above_it(fixture, guest, user, admin, request):
    member = auth.get_user(request.getfixturevalue(fixture))
    answers = tuple(has_group_permission(member, [group], no_cache=True) for group in ('guest', 'user', 'admin'))
    assert answers == (guest, user, admin)


def test_any_of_several_groups_is_enough(g1_s1):
    member = auth.get_user(g1_s1)
    assert has_group_permission(member, ['admin', 'guest'], no_cache=True)
    assert not has_group_permission(member, ['admin', 'user'], no_cache=True)


def test_has_group_permission_remembers_its_answer_for_a_moment(u1_s1):
    member = auth.get_user(u1_s1)
    assert not has_group_permission(member, ['admin'])
    member.userspace_set.first().groups.add(Group.objects.get(name='admin'))
    assert not has_group_permission(member, ['admin'])  # still the answer from a moment ago
    assert has_group_permission(member, ['admin'], no_cache=True)  # no_cache asks the database
    assert has_group_permission(member, ['admin'])  # and leaves the new answer behind


def test_the_cached_answer_belongs_to_the_user_and_the_groups_asked_for(u1_s1, g1_s1):
    assert has_group_permission(auth.get_user(u1_s1), ['user'])
    assert not has_group_permission(auth.get_user(g1_s1), ['user'])
    assert has_group_permission(auth.get_user(g1_s1), ['guest'])
    assert not has_group_permission(auth.get_user(u1_s1), ['admin'])


# ---------------------------------------------------------------------------------------------------------------------
# Ownership
# ---------------------------------------------------------------------------------------------------------------------

def test_is_object_owner(u1_s1, u2_s1, a_u):
    owner, other = auth.get_user(u1_s1), auth.get_user(u2_s1)
    thing = SimpleNamespace(get_owner=lambda: owner)
    assert is_object_owner(owner, thing)
    assert not is_object_owner(other, thing)
    assert not is_object_owner(auth.get_user(a_u), thing)
    assert is_object_owner(other, SimpleNamespace(get_owner=lambda: 'orphan'))  # an object nobody owns belongs to everybody
    assert not is_object_owner(other, SimpleNamespace(get_owner=lambda: 'someone else'))
    assert not is_object_owner(owner, SimpleNamespace())  # no owner to ask


def test_is_space_owner_with_a_space_that_has_an_owner(u1_s1, u2_s1, a_u, space_1):
    space_1.created_by = auth.get_user(u1_s1)
    space_1.save()
    thing = SimpleNamespace(get_space=lambda: space_1)
    assert is_space_owner(auth.get_user(u1_s1), thing)
    assert not is_space_owner(auth.get_user(u2_s1), thing)
    assert not is_space_owner(auth.get_user(a_u), thing)
    assert not is_space_owner(auth.get_user(u1_s1), SimpleNamespace())


def test_is_object_shared(u1_s1, u2_s1, a_u):
    shared_with = auth.get_user(u1_s1)
    thing = SimpleNamespace(get_shared=lambda: [shared_with])
    assert is_object_shared(shared_with, thing)
    assert not is_object_shared(auth.get_user(u2_s1), thing)
    assert not is_object_shared(auth.get_user(a_u), thing)


# ---------------------------------------------------------------------------------------------------------------------
# The cache of household members
# ---------------------------------------------------------------------------------------------------------------------

def _household(space, *clients):
    with scopes_disabled():
        household = HouseholdFactory(space=space)
        for client in clients:
            UserSpace.objects.filter(user=auth.get_user(client), space=space).update(household=household)
        for user_space in UserSpace.objects.filter(space=space, household=household):
            invalidate_household_cache(user_space)
    return household


def _household_keys(user_space):
    key = f'household_user_ids_{user_space.space_id}'
    return [f'{key}_{user_space.household_id}_user_{user_space.user_id}', f'{key}_user_{user_space.user_id}']


def test_invalidate_household_cache_forgets_every_member_of_the_household_and_nobody_else(space_1):
    with scopes_disabled():
        household, other_household = HouseholdFactory(space=space_1), HouseholdFactory(space=space_1)
        members = [UserSpace.objects.create(user=UserFactory(space=space_1), space=space_1, household=household, active=True) for _ in range(2)]
        outsider = UserSpace.objects.create(user=UserFactory(space=space_1), space=space_1, household=other_household, active=True)
        alone = UserSpace.objects.create(user=UserFactory(space=space_1), space=space_1, active=True)
        everyone = members + [outsider, alone]
        for user_space in everyone:
            get_household_user_ids(user_space)
        assert all(cache.get(_household_keys(us)[0 if us.household_id else 1]) is not None for us in everyone)

        invalidate_household_cache(members[0])

        assert all(cache.get(_household_keys(member)[0]) is None for member in members)
        assert cache.get(_household_keys(outsider)[0]) is not None
        assert cache.get(_household_keys(alone)[1]) is not None

        invalidate_household_cache(alone)
        assert cache.get(_household_keys(alone)[1]) is None
        assert cache.get(_household_keys(outsider)[0]) is not None


# ---------------------------------------------------------------------------------------------------------------------
# The decorator for plain views
# ---------------------------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("fixture,required,allowed", [
    ('u1_s1', ('user',), True),
    ('u1_s1', ('guest',), True),
    ('u1_s1', ('admin',), False),
    ('g1_s1', ('user',), False),
    ('a1_s1', ('user',), True),
    ('a_u', ('guest',), False),
    ('g1_s1', ('admin', 'guest'), True),
])
def test_group_required_lets_members_in_and_sends_the_rest_to_the_no_permission_page(fixture, required, allowed, request):
    @group_required(*required)
    def view(request):
        return HttpResponse('ok')

    http_request = RequestFactory().get('/somewhere/')
    http_request.user = auth.get_user(request.getfixturevalue(fixture))
    response = view(http_request)

    if allowed:
        assert (response.status_code, response.content) == (200, b'ok')
    else:
        assert response.status_code == 302
        assert response['Location'] == reverse('view_no_perm') + '?next=/somewhere/'


# ---------------------------------------------------------------------------------------------------------------------
# Who may see a recipe or a meal plan
# ---------------------------------------------------------------------------------------------------------------------

def test_a_private_recipe_is_seen_by_its_creator_and_those_it_is_shared_with(u1_s1, u2_s1, recipe_1_s1):
    creator, other = auth.get_user(u1_s1), auth.get_user(u2_s1)
    recipe_1_s1.private = True
    recipe_1_s1.save()
    assert can_view_recipe(creator, recipe_1_s1)
    assert not can_view_recipe(other, recipe_1_s1)
    with scopes_disabled():
        assert list(Recipe.objects.filter(visible_recipes_q(other)).distinct()) == []

    recipe_1_s1.shared.add(other)
    assert can_view_recipe(other, recipe_1_s1)
    with scopes_disabled():
        assert list(Recipe.objects.filter(visible_recipes_q(other)).distinct()) == [recipe_1_s1]
        assert list(Recipe.objects.filter(visible_recipes_q(creator)).distinct()) == [recipe_1_s1]


def test_a_recipe_that_is_not_private_is_seen_by_everyone(u2_s1, recipe_1_s1):
    assert not recipe_1_s1.private
    assert can_view_recipe(auth.get_user(u2_s1), recipe_1_s1)
    with scopes_disabled():
        assert list(Recipe.objects.filter(visible_recipes_q(auth.get_user(u2_s1))).distinct()) == [recipe_1_s1]


def test_a_meal_plan_is_seen_by_its_creator_and_the_household_of_the_viewer(u1_s1, u2_s1, space_1, recipe_1_s1):
    plan = MealPlanFactory(space=space_1, created_by=auth.get_user(u1_s1), recipe=recipe_1_s1)

    def viewer(client):
        with scopes_disabled():
            return SimpleNamespace(user=auth.get_user(client), user_space=UserSpace.objects.get(user=auth.get_user(client), space=space_1))

    assert can_view_meal_plan(viewer(u1_s1), plan)
    assert not can_view_meal_plan(viewer(u2_s1), plan)
    _household(space_1, u1_s1, u2_s1)
    assert can_view_meal_plan(viewer(u2_s1), plan)


# ---------------------------------------------------------------------------------------------------------------------
# Limits of a space
# ---------------------------------------------------------------------------------------------------------------------

RECIPE_LIMIT_MESSAGE = 'You have reached the maximum number of recipes for your space.'
USER_LIMIT_MESSAGE = 'You have more users than allowed in your space.'


@pytest.mark.parametrize("limit,above", [(0, False), (3, False), (2, True), (1, True)])
def test_a_space_is_above_its_recipe_limit_when_it_has_that_many_recipes(limit, above, space_1, recipe_1_s1, recipe_2_s1):
    space_1.max_recipes = limit  # two recipes exist; 0 means no limit
    with scope(space=space_1):
        assert above_space_recipe_limit(space_1) == ((True, RECIPE_LIMIT_MESSAGE) if above else (False, ''))


@pytest.mark.parametrize("limit,above", [(0, False), (3, False), (2, False), (1, True)])
def test_a_space_is_above_its_user_limit_when_it_has_more_users(limit, above, space_1, u1_s1, u2_s1):
    space_1.max_users = limit  # two users exist; having as many as allowed is fine
    assert above_space_user_limit(space_1) == ((True, USER_LIMIT_MESSAGE) if above else (False, ''))


@pytest.mark.parametrize("recipes,users,expected", [
    (0, 0, (False, '')),
    (2, 0, (True, RECIPE_LIMIT_MESSAGE)),
    (0, 1, (True, USER_LIMIT_MESSAGE)),
    (2, 1, (True, RECIPE_LIMIT_MESSAGE + ' ' + USER_LIMIT_MESSAGE)),
    (3, 2, (False, '')),
])
def test_above_space_limit_reports_both_limits(recipes, users, expected, space_1, u1_s1, u2_s1, recipe_1_s1, recipe_2_s1):
    space_1.max_recipes, space_1.max_users = recipes, users
    with scope(space=space_1):
        assert above_space_limit(space_1) == expected


# ---------------------------------------------------------------------------------------------------------------------
# Spaces of a user
# ---------------------------------------------------------------------------------------------------------------------

def test_switching_space_activates_that_one_and_deactivates_the_others(u1_s1, u2_s1, space_1, space_2):
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        second = UserSpace.objects.create(user=user, space=space_2, active=False)
        result = switch_user_active_space(user, space_2)
        assert result == second
        assert [(us.space_id, us.active) for us in UserSpace.objects.filter(user=user).order_by('space_id')] == [(space_1.id, False), (space_2.id, True)]
        assert UserSpace.objects.get(user=auth.get_user(u2_s1), space=space_1).active  # other users keep theirs


def test_switching_to_the_active_space_changes_nothing_and_to_a_foreign_space_gives_nothing(u1_s1, space_1, space_2):
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        assert switch_user_active_space(user, space_1) == UserSpace.objects.get(user=user, space=space_1)
        assert UserSpace.objects.get(user=user, space=space_1).active
        assert switch_user_active_space(user, space_2) is None
        assert UserSpace.objects.get(user=user, space=space_1).active


@pytest.fixture
def new_user():
    with scopes_disabled():
        return UserFactory(space=SpaceFactory_for_new_user())


def SpaceFactory_for_new_user():
    from cookbook.tests.factories import SpaceFactory
    return SpaceFactory()


def test_a_space_is_made_for_a_user_with_the_default_settings(new_user, settings):
    settings.SPACE_DEFAULT_MAX_FILES, settings.SPACE_DEFAULT_MAX_RECIPES, settings.SPACE_DEFAULT_MAX_USERS = 11, 7, 3
    settings.SPACE_DEFAULT_ALLOW_SHARING, settings.SPACE_AI_ENABLED, settings.SPACE_AI_CREDITS_MONTHLY = False, True, 123

    user_space = create_space_for_user(new_user)

    space = user_space.space
    assert space.name == f"{new_user.username}'s Space"
    assert space.created_by == new_user
    assert (space.max_file_storage_mb, space.max_recipes, space.max_users) == (11, 7, 3)
    assert (space.allow_sharing, space.ai_enabled, space.ai_credits_monthly, space.space_setup_completed) == (False, True, 123, False)
    assert (user_space.user, user_space.active) == (new_user, True)
    assert [group.name for group in user_space.groups.all()] == ['admin']


def test_a_space_can_be_named_and_a_name_that_is_taken_gets_a_number(new_user):
    assert create_space_for_user(new_user, 'Family').space.name == 'Family'
    second = create_space_for_user(new_user, 'Family').space.name
    assert second != 'Family' and second.startswith('Family #') and second[len('Family #'):].isdigit()


def test_only_the_first_space_of_a_user_is_active(new_user):
    first = create_space_for_user(new_user, 'First')
    second = create_space_for_user(new_user, 'Second')
    assert (first.active, second.active) == (True, False)
