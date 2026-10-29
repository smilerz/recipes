import json

import pytest
from django.contrib import auth
from django.urls import reverse
from django_scopes import scopes_disabled

from cookbook.models import RecipeBook, RecipeBookEntry
from cookbook.tests.factories import CookLogFactory

LIST_URL = 'api:recipebookentry-list'
DETAIL_URL = 'api:recipebookentry-detail'


@pytest.fixture
def obj_1(space_1, u1_s1, recipe_1_s1):
    b = RecipeBook.objects.create(name='test_1', created_by=auth.get_user(u1_s1), space=space_1)

    return RecipeBookEntry.objects.create(book=b, recipe=recipe_1_s1)


@pytest.fixture
def obj_2(space_1, u1_s1, recipe_1_s1):
    b = RecipeBook.objects.create(name='test_1', created_by=auth.get_user(u1_s1), space=space_1)
    return RecipeBookEntry.objects.create(book=b, recipe=recipe_1_s1)


@pytest.mark.parametrize("arg", [
    ['a_u', 403],
    ['g1_s1', 200],
    ['u1_s1', 200],
    ['a1_s1', 200],
])
def test_list_permission(arg, request):
    c = request.getfixturevalue(arg[0])
    assert c.get(reverse(LIST_URL)).status_code == arg[1]


def test_list_space(obj_1, obj_2, u1_s1, u1_s2, space_2):
    assert json.loads(u1_s1.get(reverse(LIST_URL)).content)['count'] == 2
    assert json.loads(u1_s2.get(reverse(LIST_URL)).content)['count'] == 0

    obj_1.book.space = space_2
    obj_1.book.save()

    assert json.loads(u1_s1.get(reverse(LIST_URL)).content)['count'] == 1
    assert json.loads(u1_s2.get(reverse(LIST_URL)).content)['count'] == 0


@pytest.mark.parametrize("arg", [
    ['a_u', 403],
    ['g1_s1', 404],
    ['u1_s1', 200],
    ['a1_s1', 404],
    ['g1_s2', 404],
    ['u1_s2', 404],
    ['a1_s2', 404],
])
def test_update(arg, request, obj_1, recipe_2_s1):
    c = request.getfixturevalue(arg[0])
    r = c.patch(
        reverse(
            DETAIL_URL,
            args={obj_1.id}
        ),
        {'recipe': recipe_2_s1.pk},
        content_type='application/json'
    )
    response = json.loads(r.content)
    assert r.status_code == arg[1]
    if r.status_code == 200:
        assert response['recipe'] == recipe_2_s1.pk


@pytest.mark.parametrize("arg", [
    ['a_u', 403],
    ['g1_s1', 404],
    ['u1_s1', 201],
    ['a1_s1', 404],
])
def test_add(arg, request, u1_s2, obj_1, recipe_2_s1):
    c = request.getfixturevalue(arg[0])
    r = c.post(
        reverse(LIST_URL),
        {'book': obj_1.book.pk, 'recipe': recipe_2_s1.pk},
        content_type='application/json'
    )
    response = json.loads(r.content)
    assert r.status_code == arg[1]
    if r.status_code == 201:
        assert response['recipe'] == recipe_2_s1.pk
        r = c.get(reverse(DETAIL_URL, args={response['id']}))
        assert r.status_code == 200
        r = u1_s2.get(reverse(DETAIL_URL, args={response['id']}))
        assert r.status_code == 404


def test_add_duplicate(u1_s1, obj_1):
    r = u1_s1.post(
        reverse(LIST_URL),
        {'book': obj_1.book.pk, 'recipe': obj_1.recipe.pk},
        content_type='application/json'
    )
    assert r.status_code == 400


# D08: book cards read rating + last_cooked off the recipe payload, but those are per-user
# queryset annotations (with_rating / with_last_cooked). The bare recipe FK the entry
# serializer used carried neither, so card_showRating / card_showLastCooked could never
# render on a book. The entry viewset must annotate the recipe it serializes.
def test_recipe_content_includes_rating_and_last_cooked(u1_s1, obj_1, space_1):
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        CookLogFactory.create(recipe=obj_1.recipe, created_by=user, rating=4, space=space_1)

    r = u1_s1.get(reverse(LIST_URL))
    assert r.status_code == 200
    content = json.loads(r.content)['results'][0]['recipe_content']
    assert float(content['rating']) == 4.0
    assert content['last_cooked'] is not None


def test_delete(u1_s1, u1_s2, obj_1):
    r = u1_s2.delete(
        reverse(
            DETAIL_URL,
            args={obj_1.id}
        )
    )
    assert r.status_code == 404

    r = u1_s1.delete(
        reverse(
            DETAIL_URL,
            args={obj_1.id}
        )
    )

    assert r.status_code == 204
    with scopes_disabled():
        assert RecipeBookEntry.objects.count() == 0


def _private_recipe_of_another_user(space_1, u2_s1):
    from cookbook.tests.factories import RecipeFactory
    with scopes_disabled():
        return RecipeFactory(space=space_1, created_by=auth.get_user(u2_s1), private=True)


def test_update_cannot_move_an_entry_into_a_book_the_user_does_not_own(obj_1, u1_s1, u2_s1, space_1):
    with scopes_disabled():
        other_book = RecipeBook.objects.create(name='not_shared', created_by=auth.get_user(u2_s1), space=space_1)

    r = u1_s1.patch(reverse(DETAIL_URL, args=[obj_1.id]), {'book': other_book.id, 'recipe': obj_1.recipe_id}, content_type='application/json')

    assert r.status_code == 404
    with scopes_disabled():
        obj_1.refresh_from_db()
        assert obj_1.book_id != other_book.id


def test_update_can_move_an_entry_into_another_book_of_the_user(obj_1, u1_s1, space_1):
    with scopes_disabled():
        target = RecipeBook.objects.create(name='target', created_by=auth.get_user(u1_s1), space=space_1)

    r = u1_s1.patch(reverse(DETAIL_URL, args=[obj_1.id]), {'book': target.id, 'recipe': obj_1.recipe_id}, content_type='application/json')

    assert r.status_code == 200
    with scopes_disabled():
        obj_1.refresh_from_db()
        assert obj_1.book_id == target.id


def test_create_refuses_a_private_recipe_of_another_user(obj_1, u1_s1, u2_s1, space_1):
    secret = _private_recipe_of_another_user(space_1, u2_s1)

    r = u1_s1.post(reverse(LIST_URL), {'book': obj_1.book_id, 'recipe': secret.id}, content_type='application/json')

    assert r.status_code == 404
    assert secret.name not in r.content.decode()
    with scopes_disabled():
        assert not RecipeBookEntry.objects.filter(recipe=secret).exists()


def test_update_refuses_a_private_recipe_of_another_user(obj_1, u1_s1, u2_s1, space_1):
    secret = _private_recipe_of_another_user(space_1, u2_s1)

    r = u1_s1.patch(reverse(DETAIL_URL, args=[obj_1.id]), {'book': obj_1.book_id, 'recipe': secret.id}, content_type='application/json')

    assert r.status_code == 404
    with scopes_disabled():
        obj_1.refresh_from_db()
        assert obj_1.recipe_id != secret.id


def test_list_hides_entries_whose_recipe_the_user_cannot_see(u1_s1, u2_s1, space_1):
    from cookbook.tests.factories import RecipeBookEntryFactory, RecipeBookFactory, RecipeFactory
    user1, user2 = auth.get_user(u1_s1), auth.get_user(u2_s1)
    with scopes_disabled():
        book = RecipeBookFactory(space=space_1, created_by=user2)
        book.shared.add(user1)
        public = RecipeFactory(space=space_1, created_by=user2, private=False)
        secret = RecipeFactory(space=space_1, created_by=user2, private=True, name='U2-PRIVATE-SECRET-RECIPE')
        shared_with_user1 = RecipeFactory(space=space_1, created_by=user2, private=True)
        shared_with_user1.shared.add(user1)
        own_private = RecipeFactory(space=space_1, created_by=user1, private=True)
        for recipe in (public, secret, shared_with_user1, own_private):
            RecipeBookEntryFactory(book=book, recipe=recipe)

    r = u1_s1.get(reverse(LIST_URL))
    listed = {e['recipe'] for e in json.loads(r.content)['results']}

    assert listed == {public.id, shared_with_user1.id, own_private.id}
    assert 'U2-PRIVATE-SECRET-RECIPE' not in r.content.decode()
    # the owner of the book sees their own private recipes, but not a private recipe of the user who added it
    assert {e['recipe'] for e in json.loads(u2_s1.get(reverse(LIST_URL)).content)['results']} == {public.id, secret.id, shared_with_user1.id}


# ---------------------------------------------------------------------------------------------------------------------
# make now badge: the recipes of the entries tell whether the household can make them now, only when asked for
# ---------------------------------------------------------------------------------------------------------------------

@pytest.fixture
def stocked_and_not(space_1, u1_s1):
    from cookbook.models import Food, UserSpace
    from cookbook.tests.factories import HouseholdFactory, InventoryEntryFactory, InventoryLocationFactory, RecipeFactory
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        stocked, other = RecipeFactory(space=space_1, name='stocked'), RecipeFactory(space=space_1, name='other')
        book = RecipeBook.objects.create(name='book', created_by=user, space=space_1)
        for recipe in (stocked, other):
            RecipeBookEntry.objects.create(book=book, recipe=recipe)
        household = HouseholdFactory(space=space_1)
        UserSpace.objects.filter(space=space_1, user=user).update(household=household)
        location = InventoryLocationFactory(space=space_1, household=household)
        for food in Food.objects.filter(ingredient__step__recipe=stocked.id):
            InventoryEntryFactory(space=space_1, food=food, inventory_location=location, amount=1, created_by=user)
    return book


def _makenow_by_recipe(response):
    return {e['recipe_content']['name']: e['recipe_content']['makenow'] for e in json.loads(response.content)['results']}


def test_entries_say_nothing_about_make_now_unless_asked(u1_s1, stocked_and_not):
    r = u1_s1.get(reverse(LIST_URL))
    assert r.status_code == 200
    assert set(_makenow_by_recipe(r).values()) == {None}


def test_entries_mark_the_recipes_that_can_be_made(u1_s1, stocked_and_not):
    r = u1_s1.get(reverse(LIST_URL) + '?makenow_badge=true')
    assert r.status_code == 200
    assert _makenow_by_recipe(r) == {'stocked': True, 'other': False}


def test_entries_of_one_book_are_marked_too(u1_s1, stocked_and_not):
    r = u1_s1.get(reverse(LIST_URL) + f'?book={stocked_and_not.id}&makenow_badge=true')
    assert _makenow_by_recipe(r) == {'stocked': True, 'other': False}
