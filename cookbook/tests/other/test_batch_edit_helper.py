"""The batch edit helpers write ids straight into a join table. They must never link rows that
aren't visible in the current space, whatever the caller passes in."""
import pytest
from django_scopes import ScopeError, scope, scopes_disabled

from cookbook.helper.batch_edit_helper import add_to_relation, set_relation
from cookbook.models import Food
from cookbook.tests.factories import FoodFactory

THROUGH = Food.substitute.through


def _links(food):
    with scopes_disabled():
        return set(THROUGH.objects.filter(from_food_id=food.id).values_list('to_food_id', flat=True))


@pytest.fixture
def foods(space_1, space_2):
    with scopes_disabled():
        return {'base': FoodFactory(space=space_1), 'own': FoodFactory(space=space_1), 'foreign': FoodFactory(space=space_2)}


@pytest.mark.django_db
def test_add_to_relation_skips_related_ids_from_another_space(space_1, foods):
    with scope(space=space_1):
        add_to_relation(THROUGH, 'from_food_id', [foods['base'].id], 'to_food_id', [foods['own'].id, foods['foreign'].id])

    assert _links(foods['base']) == {foods['own'].id}


@pytest.mark.django_db
def test_add_to_relation_skips_base_ids_from_another_space(space_1, foods):
    with scope(space=space_1):
        add_to_relation(THROUGH, 'from_food_id', [foods['base'].id, foods['foreign'].id], 'to_food_id', [foods['own'].id])

    assert _links(foods['base']) == {foods['own'].id}
    assert _links(foods['foreign']) == set()


@pytest.mark.django_db
def test_set_relation_skips_related_ids_from_another_space(space_1, foods):
    with scope(space=space_1):
        set_relation(THROUGH, 'from_food_id', [foods['base'].id], 'to_food_id', [foods['own'].id, foods['foreign'].id])

    assert _links(foods['base']) == {foods['own'].id}


@pytest.mark.django_db
def test_add_to_relation_without_an_active_scope_fails_loudly(foods):
    with pytest.raises(ScopeError):
        add_to_relation(THROUGH, 'from_food_id', [foods['base'].id], 'to_food_id', [foods['own'].id])


@pytest.mark.django_db
def test_set_relation_with_only_foreign_ids_keeps_existing_links(space_1, foods):
    with scope(space=space_1):
        add_to_relation(THROUGH, 'from_food_id', [foods['base'].id], 'to_food_id', [foods['own'].id])

        set_relation(THROUGH, 'from_food_id', [foods['base'].id], 'to_food_id', [foods['foreign'].id])

    assert _links(foods['base']) == {foods['own'].id}
