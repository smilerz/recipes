import json

import pytest
from django.contrib import auth
from django.contrib.auth.models import User
from django.urls import reverse
from django_scopes import scopes_disabled

from cookbook.models import UserSpace

LIST_URL = 'api:userspace-list'
DETAIL_URL = 'api:userspace-detail'
CREATE_USER_URL = 'api:userspace-create-user'


@pytest.mark.parametrize("arg", [
    ['a_u', 403, 0],
    ['g1_s1', 200, 1],  # sees only own user space
    ['u1_s1', 200, 1],
    ['a1_s1', 200, 4],  # admins can see all other members
    ['a2_s1', 200, 4],
])
def test_list_permission(arg, request, space_1, g1_s1, u1_s1, a1_s1, a2_s1):
    space_1.created_by = auth.get_user(a1_s1)
    space_1.save()

    c = request.getfixturevalue(arg[0])
    result = c.get(reverse(LIST_URL))
    assert result.status_code == arg[1]
    if arg[1] == 200:
        assert len(json.loads(result.content)['results']) == arg[2]


def test_list_all_personal(space_2, u1_s1):
    result = u1_s1.get(reverse('api:userspace-all-personal'))
    assert result.status_code == 200
    assert len(json.loads(result.content)) == 1

    UserSpace.objects.create(user=auth.get_user(u1_s1), space=space_2)

    result = u1_s1.get(reverse('api:userspace-all-personal'))
    assert result.status_code == 200
    assert len(json.loads(result.content)) == 2


@pytest.mark.parametrize("arg", [
    ['a_u', 403],
    ['g1_s1', 403],
    ['u1_s1', 403],
    ['a1_s1', 200],
    ['g1_s2', 403],
    ['u1_s2', 403],
    ['a1_s2', 403],
])
def test_update(arg, request, space_1, u1_s1, a1_s1):
    with scopes_disabled():
        space_1.created_by = auth.get_user(a1_s1)
        space_1.save()

        user_space = auth.get_user(u1_s1).userspace_set.first()

        c = request.getfixturevalue(arg[0])
        r = c.patch(
            reverse(
                DETAIL_URL,
                args={user_space.id}
            ),
            {'groups': [{'id': 3, 'name': 'admin'}]},
            content_type='application/json'
        )
        response = json.loads(r.content)
        assert r.status_code == arg[1]
        if r.status_code == 200:
            assert response['groups'] == [{'id': 3, 'name': 'admin'}]


@pytest.mark.parametrize("arg", [
    ['a_u', 403],
    ['g1_s1', 403],
    ['u1_s1', 403],
    ['a1_s1', 403],
])
def test_add(arg, request, u1_s1, space_1):
    c = request.getfixturevalue(arg[0])
    r = c.post(
        reverse(LIST_URL),
        {'user': {'id': auth.get_user(u1_s1).id, 'space': space_1.id}},
        content_type='application/json'
    )
    assert r.status_code == arg[1]


def test_delete_user(u1_s1, u2_s1, u1_s2, a1_s1, space_1):
    space_1.created_by = auth.get_user(a1_s1)
    space_1.save()

    r = u2_s1.delete(
        reverse(
            DETAIL_URL,
            args={auth.get_user(u1_s1).userspace_set.first().id}
        )
    )
    assert r.status_code == 404

    r = u1_s2.delete(
        reverse(
            DETAIL_URL,
            args={auth.get_user(u1_s1).userspace_set.first().id}
        )
    )
    assert r.status_code == 404

    r = u1_s1.delete(
        reverse(
            DETAIL_URL,
            args={auth.get_user(u1_s1).userspace_set.first().id}
        )
    )
    assert r.status_code == 204


def test_delete_admin(u1_s1, u2_s1, u1_s2, a1_s1, space_1):
    space_1.created_by = auth.get_user(a1_s1)
    space_1.save()

    r = a1_s1.delete(
        reverse(
            DETAIL_URL,
            args={auth.get_user(u1_s1).userspace_set.first().id}
        )
    )
    assert r.status_code == 204


def test_delete_space_owner_blocked(a1_s1, space_1):
    """Deleting the space owner's own UserSpace is forbidden and must return
    a clean 403, not a 500 (pattern-012)."""
    owner = auth.get_user(a1_s1)
    with scopes_disabled():
        space_1.created_by = owner
        space_1.save()
        owner_userspace = owner.userspace_set.get(space=space_1)

    r = a1_s1.delete(reverse(DETAIL_URL, args={owner_userspace.id}))
    assert r.status_code == 403


def test_batch_update_ignores_household_from_another_space(u1_s1, space_1, space_2):
    from cookbook.tests.factories import HouseholdFactory
    user = auth.get_user(u1_s1)
    space_1.created_by = user
    space_1.save()
    with scopes_disabled():
        user_space = UserSpace.objects.get(user=user, space=space_1)
        foreign_household = HouseholdFactory(space=space_2)

    r = u1_s1.put(reverse('api:userspace-batch-update'), {'user_spaces': [user_space.id], 'household': foreign_household.id}, content_type='application/json')

    assert r.status_code == 400
    with scopes_disabled():
        user_space.refresh_from_db()
        assert user_space.household_id != foreign_household.id


def test_batch_update_sets_household_from_the_same_space(u1_s1, space_1):
    from cookbook.tests.factories import HouseholdFactory
    user = auth.get_user(u1_s1)
    space_1.created_by = user
    space_1.save()
    with scopes_disabled():
        user_space = UserSpace.objects.get(user=user, space=space_1)
        household = HouseholdFactory(space=space_1)

    r = u1_s1.put(reverse('api:userspace-batch-update'), {'user_spaces': [user_space.id], 'household': household.id}, content_type='application/json')

    assert r.status_code == 200
    with scopes_disabled():
        user_space.refresh_from_db()
        assert user_space.household_id == household.id


STRONG = 'Tr0ub4dor-and-3-horses'


def make_owner(space, client):
    space.created_by = auth.get_user(client)
    space.save()


def post(client, **overrides):
    data = {'username': 'newcook', 'password': STRONG, 'group': 'user'}
    data.update(overrides)
    return client.post(reverse(CREATE_USER_URL), data, content_type='application/json')


@pytest.mark.parametrize("arg", [
    ['a_u', 403],
    ['g1_s1', 403],
    ['u1_s1', 403],
    ['a1_s1', 201],
])
def test_create_user_permission(arg, request, space_1, a1_s1, u1_s1, g1_s1):
    make_owner(space_1, a1_s1)
    c = request.getfixturevalue(arg[0])
    assert post(c).status_code == arg[1]


def test_created_user_can_log_in_and_joins_the_requesters_space(space_1, space_2, a1_s1, client):
    make_owner(space_1, a1_s1)
    response = post(a1_s1, username='newcook', group='user')
    assert response.status_code == 201

    with scopes_disabled():
        user = User.objects.get(username='newcook')
        assert user.check_password(STRONG)
        user_space = UserSpace.objects.get(user=user)
        assert user_space.space == space_1
        assert user_space.active
        assert list(user_space.groups.values_list('name', flat=True)) == ['user']
    assert client.login(username='newcook', password=STRONG)


def test_admin_of_another_space_cannot_create_into_this_space(space_1, space_2, a1_s1, a1_s2):
    make_owner(space_1, a1_s1)
    response = post(a1_s2)
    assert response.status_code == 201
    with scopes_disabled():
        assert UserSpace.objects.get(user__username='newcook').space == space_2


@pytest.mark.parametrize("password", [
    'password',  # common
    '12345678901',  # numeric only
    'short1A',  # too short
    'newcook99',  # too similar to the username
])
def test_weak_password_is_rejected_and_nothing_is_created(password, space_1, a1_s1):
    make_owner(space_1, a1_s1)
    response = post(a1_s1, password=password)
    assert response.status_code == 400
    assert 'password' in json.loads(response.content)
    with scopes_disabled():
        assert not User.objects.filter(username='newcook').exists()


def test_duplicate_username_is_rejected(space_1, a1_s1, u1_s1):
    make_owner(space_1, a1_s1)
    existing = auth.get_user(u1_s1).username
    response = post(a1_s1, username=existing)
    assert response.status_code == 400
    assert 'username' in json.loads(response.content)


def test_unknown_group_is_rejected(space_1, a1_s1):
    make_owner(space_1, a1_s1)
    assert post(a1_s1, group='superuser').status_code == 400


def test_space_user_limit_is_enforced(space_1, a1_s1, u1_s1):
    make_owner(space_1, a1_s1)
    with scopes_disabled():
        space_1.max_users = UserSpace.objects.filter(space=space_1).count()
        space_1.save()
    response = post(a1_s1)
    assert response.status_code == 400
    with scopes_disabled():
        assert not User.objects.filter(username='newcook').exists()


def test_only_the_space_owner_can_create_an_admin(space_1, a1_s1, a2_s1):
    make_owner(space_1, a1_s1)
    assert post(a2_s1, group='admin').status_code == 403
    assert post(a2_s1, group='user').status_code == 201
    assert post(a1_s1, username='newadmin', group='admin').status_code == 201
