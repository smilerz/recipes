"""Regression coverage for how the RecipeSage importer handles recipe images.

No prior test coverage existed for this integration.
"""
import pytest
from django.contrib import auth
from django_scopes import scope, scopes_disabled

from cookbook.integration.recipesage import RecipeSage
from cookbook.models import UserSpace

PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='


def _recipe_file(image):
    return {'name': 'Image test', 'recipeYield': '4', 'image': [image],
            'recipeInstructions': [{'text': 'Mix well.'}], 'recipeIngredient': ['1 cup flour']}


def _import(space, user, file):
    request = type('R', (), {})()
    request.space = space
    request.user = user
    with scope(space=space):
        request.user_space = UserSpace.objects.get(user=user, space=space)
        return RecipeSage(request, 'RECIPESAGE').get_recipe_from_file(file)


@pytest.mark.django_db
def test_an_embedded_image_is_imported_without_an_http_request(space_1, u1_s1, monkeypatch):
    def refuse(*args, **kwargs):
        raise AssertionError('an embedded image must not be fetched over HTTP')
    monkeypatch.setattr('cookbook.integration.recipesage.safe_request', refuse)

    recipe = _import(space_1, auth.get_user(u1_s1), _recipe_file(f'data:image/png;base64,{PNG_1X1}'))

    with scopes_disabled():
        assert recipe.images.count() == 1
