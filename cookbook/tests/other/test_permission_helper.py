import inspect
import uuid
from unittest.mock import patch

import pytest
from django.contrib import auth
from django.contrib.auth.models import AnonymousUser, Group
from django.core.cache import cache
from django_scopes import scopes_disabled

from cookbook.helper.permission_helper import (get_household_user_ids, has_group_permission, is_object_household, is_object_owner,
                                               is_space_owner, share_link_valid, switch_user_active_space)
from cookbook.models import Food, RecipeBook, RecipeBookEntry, ShareLink, Space, UserSpace
from cookbook.tests.factories import HouseholdFactory, UserFactory


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
