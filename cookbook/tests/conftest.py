import copy
import inspect
import random
import uuid

import pytest
from django.contrib import auth
from django_scopes import scopes_disabled
from pytest_factoryboy import register

from cookbook.connectors.connector_manager import ConnectorManager
from cookbook.models import Food, Ingredient, Recipe, Step, Unit
from cookbook.tests.factories import HouseholdFactory, SpaceFactory, UserFactory

register(SpaceFactory, 'space_1')
register(SpaceFactory, 'space_2')


# register(FoodFactory, space=LazyFixture('space_2'))
# TODO refactor clients to be factories

# hack from https://github.com/raphaelm/django-scopes to disable scopes for all fixtures
# does not work on yield fixtures as only one yield can be used per fixture (i think)


@pytest.hookimpl(hookwrapper=True)
def pytest_fixture_setup(fixturedef, request):
    if inspect.isgeneratorfunction(fixturedef.func):
        yield
    else:
        with scopes_disabled():
            yield


@pytest.fixture(scope='session')
def django_db_setup(django_db_setup, django_db_blocker):
    """
    Force-terminate stale DB connections after all tests so teardown can DROP the test database.

    ConnectorManager runs a background worker thread with its own DB connection
    (django.db.connection is thread-local). pytest_sessionfinish fires AFTER all
    fixture teardown is complete (pytest's own docs: "called after whole test run
    finished") - by then the real django_db_setup's DROP DATABASE has already run,
    so stopping the worker there is too late to prevent it from racing the DROP.
    Stop it HERE instead, before terminating any other stray backends, so its
    connection is deterministically closed before DROP DATABASE ever runs.

    Only client connections are terminated: a role without pg_signal_autovacuum_worker is not allowed to terminate an
    autovacuum worker that happens to be attached to the test database, and the whole teardown errors if it tries.
    """
    yield
    with django_db_blocker.unblock():
        if ConnectorManager.is_initialized():
            ConnectorManager().stop()

        from django.db import connections
        for alias in connections:
            conn = connections[alias]
            if conn.vendor == 'postgresql':
                with conn.cursor() as cursor:
                    cursor.execute(
                        "SELECT pg_terminate_backend(pid) "
                        "FROM pg_stat_activity "
                        "WHERE datname = %s AND pid <> pg_backend_pid() AND backend_type = 'client backend'",
                        [conn.settings_dict['NAME']]
                    )


@pytest.fixture(autouse=True)
def enable_db_access_for_all_tests(db):
    from django.core.cache import cache
    cache.clear()


# ---------------------- OBJECT FIXTURES ---------------------

def get_random_recipe(space_1, u1_s1):
    r = Recipe.objects.create(
        name=str(uuid.uuid4()),
        waiting_time=20,
        working_time=20,
        servings=4,
        created_by=auth.get_user(u1_s1),
        space=space_1,
        internal=True,
    )

    s1 = Step.objects.create(name=str(uuid.uuid4()),
                             instruction=str(uuid.uuid4()), space=space_1, )
    s2 = Step.objects.create(name=str(uuid.uuid4()),
                             instruction=str(uuid.uuid4()), space=space_1, )

    r.steps.add(s1)
    r.steps.add(s2)

    for x in range(5):
        s1.ingredients.add(
            Ingredient.objects.create(
                amount=1,
                food=Food.objects.get_or_create(
                    name=str(uuid.uuid4()), space=space_1)[0],
                unit=Unit.objects.create(
                    name=str(uuid.uuid4()), space=space_1, ),
                note=str(uuid.uuid4()),
                space=space_1,
            )
        )

        s2.ingredients.add(
            Ingredient.objects.create(
                amount=1,
                food=Food.objects.get_or_create(
                    name=str(uuid.uuid4()), space=space_1)[0],
                unit=Unit.objects.create(
                    name=str(uuid.uuid4()), space=space_1, ),
                note=str(uuid.uuid4()),
                space=space_1,
            )
        )

    return r


def get_random_json_recipe():
    return {
        "name": str(uuid.uuid4()),
        "description": str(uuid.uuid4()),
        "keywords": [{"name": str(uuid.uuid4())}, {"name": str(uuid.uuid4())}],
        "steps": [
            {
                "instruction": str(uuid.uuid4()),
                "ingredients": [
                    {"food": {"name": str(uuid.uuid4())}, "unit": {"name": str(
                        uuid.uuid4())}, "amount": random.randint(0, 10)},
                    {"food": {"name": str(uuid.uuid4())}, "unit": {"name": str(
                        uuid.uuid4())}, "amount": random.randint(0, 10)},
                ],
            }
        ],
        "working_time": random.randint(0, 120),
        "waiting_time": random.randint(0, 120),
    }


def _recipe_mismatches(expected, actual, path=''):
    """
    Where `expected` is not contained in `actual`, as (path, expected, actual) tuples.
    Dicts must be subsets (the actual one may have more keys, and database ids are ignored), every element of an expected list needs a
    matching element in the actual list, and anything else must be equal.
    """
    if isinstance(expected, dict):
        if not isinstance(actual, dict):
            return [(path, expected, actual)]
        mismatches = []
        for key, value in expected.items():
            if key == 'id':
                continue
            if key not in actual:
                mismatches.append((f'{path}.{key}', value, '<missing>'))
            else:
                mismatches += _recipe_mismatches(value, actual[key], f'{path}.{key}')
        return mismatches
    if isinstance(expected, list):
        if not isinstance(actual, list):
            return [(path, expected, actual)]
        return [(f'{path}[{n}]', item, '<no matching element>')
                for n, item in enumerate(expected) if not any(not _recipe_mismatches(item, other) for other in actual)]
    return [] if expected == actual else [(path, expected, actual)]


def validate_recipe(expected, recipe):
    """
    Fail unless everything in `expected` is in `recipe`. The recipe may have more (ids, defaults), but a value that differs, a missing key
    or a list element without a match is a failure, at any depth.
    """
    mismatches = _recipe_mismatches(expected, recipe)
    assert not mismatches, '\n' + '\n'.join(f'{path}: expected {exp!r:.300} but got {act!r:.300}' for path, exp, act in mismatches)


def transpose(text, number=2):
    # select random token
    tokens = text.split()
    positions = list(i for i, e in enumerate(tokens) if len(e) > 1)

    if positions:

        token_pos = random.choice(positions)

        # select random positions in token
        positions = random.sample(range(len(tokens[token_pos])), number)

        # swap the positions
        lt = list(tokens[token_pos])
        for first, second in zip(positions[::2], positions[1::2]):
            lt[first], lt[second] = lt[second], lt[first]

        # replace original tokens with swapped
        tokens[token_pos] = ''.join(lt)

    # return text with the swapped token
    return ' '.join(tokens)


@pytest.fixture
def recipe_1_s1(space_1, u1_s1):
    return get_random_recipe(space_1, u1_s1)


@pytest.fixture
def recipe_2_s1(space_1, u1_s1):
    return get_random_recipe(space_1, u1_s1)


@pytest.fixture
def ext_recipe_1_s1(space_1, u1_s1):
    r = get_random_recipe(space_1, u1_s1)
    r.internal = False
    r.link = 'test'
    r.save()
    return r


def get_random_food(space_1, u1_s1):
    return Food.objects.get_or_create(name=str(uuid.uuid4()), space=space_1)[0]


def get_random_unit(space_1, u1_s1):
    return Unit.objects.get_or_create(name=str(uuid.uuid4()), space=space_1)[0]


# ---------------------- USER FIXTURES -----------------------
# maybe better with factories but this is very explict so ...

def create_user(client, space, **kwargs):
    c = copy.deepcopy(client)
    with scopes_disabled():
        group = kwargs.pop('group', None)
        user = UserFactory(space=space, groups=group)

        c.force_login(user)
        return c


@pytest.fixture()
def a_u(client):
    return copy.deepcopy(client)


@pytest.fixture()
def ng1_s1(client, space_1):
    return create_user(client, space_1)


@pytest.fixture()
def ng1_s2(client, space_2):
    return create_user(client, space_2)


# guests
@pytest.fixture()
def g1_s1(client, space_1):
    return create_user(client, space_1, group='guest')


@pytest.fixture()
def g2_s1(client, space_1):
    return create_user(client, space_1, group='guest')


@pytest.fixture()
def g1_s2(client, space_2):
    return create_user(client, space_2, group='guest')


@pytest.fixture()
def g2_s2(client, space_2):
    return create_user(client, space_2, group='guest')


# users
@pytest.fixture()
def u1_s1(client, space_1):
    return create_user(client, space_1, group='user')


@pytest.fixture()
def u2_s1(client, space_1):
    return create_user(client, space_1, group='user')


@pytest.fixture()
def u1_s2(client, space_2):
    return create_user(client, space_2, group='user')


@pytest.fixture()
def u2_s2(client, space_2):
    return create_user(client, space_2, group='user')


# admins
@pytest.fixture()
def a1_s1(client, space_1):
    return create_user(client, space_1, group='admin')


@pytest.fixture()
def a2_s1(client, space_1):
    return create_user(client, space_1, group='admin')


@pytest.fixture()
def a1_s2(client, space_2):
    return create_user(client, space_2, group='admin')


@pytest.fixture()
def a2_s2(client, space_2):
    return create_user(client, space_2, group='admin')


@pytest.fixture()
def s1_s1(client, space_1):
    client = create_user(client, space_1, group='admin')
    user = auth.get_user(client)
    user.is_superuser = True
    user.save()
    return client


@pytest.fixture()
def household_1(space_1):
    with scopes_disabled():
        return HouseholdFactory(space=space_1)
