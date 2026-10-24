"""Regression coverage for the MealMaster importer's ingredient handling.

No prior test coverage existed for this integration.
"""
import pytest
from django.contrib import auth
from django_scopes import scope, scopes_disabled

from cookbook.integration.mealmaster import MealMaster
from cookbook.models import Food, UserSpace

RECIPE = """MMMMM----- Recipe via Meal-Master (tm) v8.01

      Title: Plain Cake
 Categories: Dessert
      Yield: 4 servings

   2 cups flour
   1 tablespoon sugar

  Mix well and bake.
MMMMM"""


def _import(space, user, text):
    request = type('R', (), {})()
    request.space = space
    request.user = user
    with scope(space=space):
        request.user_space = UserSpace.objects.get(user=user, space=space)
        return MealMaster(request, 'MEALMASTER').get_recipe_from_file(text)


@pytest.mark.django_db
def test_foods_are_named_after_the_ingredient_not_the_whole_line(space_1, u1_s1):
    _import(space_1, auth.get_user(u1_s1), RECIPE)

    with scopes_disabled():
        assert set(Food.objects.filter(space=space_1).values_list('name', flat=True)) == {'flour', 'sugar'}
