import json
from unittest.mock import patch

import pytest
from django.urls import reverse

from cookbook.models import AiProvider
from cookbook.tests.factories import FoodFactory, RecipeFactory


@pytest.fixture()
def ai_provider(space_1):
    return AiProvider.objects.create(
        name='test_provider',
        space=space_1,
        api_key='test-key',
        model_name='test-model',
    )


@pytest.fixture()
def food_1(space_1):
    return FoodFactory.create(space=space_1)


@pytest.fixture()
def recipe_1(space_1):
    return RecipeFactory.create(space=space_1)


@pytest.fixture()
def ai_space(space_1):
    space_1.ai_enabled = True
    space_1.ai_credits_balance = 100
    space_1.save()
    return space_1


class TestFoodAiProperties:
    FOOD_DETAIL_URL = 'api:food-aiproperties'

    def test_bad_request_error_returns_400(self, ai_space, ai_provider, food_1, u1_s1):
        """When litellm raises BadRequestError, the endpoint should return 400 with the error message."""
        from litellm import BadRequestError

        mock_error = BadRequestError(
            message='Test error message from AI',
            model='test-model',
            llm_provider='test',
        )

        with patch('cookbook.views.api.completion', side_effect=mock_error):
            url = reverse(self.FOOD_DETAIL_URL, args=[food_1.pk]) + f'?provider={ai_provider.pk}'
            r = u1_s1.post(url, json.dumps({}), content_type='application/json')

        assert r.status_code == 400
        data = json.loads(r.content)
        assert data['error'] is True
        assert 'Test error message from AI' in data['msg']

    def test_missing_provider_returns_400(self, ai_space, food_1, u1_s1):
        """When no provider is specified, the endpoint should return 400."""
        url = reverse(self.FOOD_DETAIL_URL, args=[food_1.pk])
        r = u1_s1.post(url, json.dumps({}), content_type='application/json')

        assert r.status_code == 400

    def test_ai_disabled_returns_400(self, space_1, ai_provider, food_1, u1_s1):
        """When AI is disabled for the space, the endpoint should return 400."""
        space_1.ai_enabled = False
        space_1.save()

        url = reverse(self.FOOD_DETAIL_URL, args=[food_1.pk]) + f'?provider={ai_provider.pk}'
        r = u1_s1.post(url, json.dumps({}), content_type='application/json')

        assert r.status_code == 400


class TestRecipeAiProperties:
    RECIPE_DETAIL_URL = 'api:recipe-aiproperties'

    def test_bad_request_error_returns_400(self, ai_space, ai_provider, recipe_1, u1_s1):
        """When litellm raises BadRequestError, the endpoint should return 400 with the error message."""
        from litellm import BadRequestError

        mock_error = BadRequestError(
            message='Test error message from AI',
            model='test-model',
            llm_provider='test',
        )

        with patch('cookbook.views.api.completion', side_effect=mock_error):
            url = reverse(self.RECIPE_DETAIL_URL, args=[recipe_1.pk]) + f'?provider={ai_provider.pk}'
            r = u1_s1.post(url, json.dumps({}), content_type='application/json')

        assert r.status_code == 400
        data = json.loads(r.content)
        assert data['error'] is True
        assert 'Test error message from AI' in data['msg']

    def test_missing_provider_returns_400(self, ai_space, recipe_1, u1_s1):
        """When no provider is specified, the endpoint should return 400."""
        url = reverse(self.RECIPE_DETAIL_URL, args=[recipe_1.pk])
        r = u1_s1.post(url, json.dumps({}), content_type='application/json')

        assert r.status_code == 400

    def test_ai_disabled_returns_400(self, space_1, ai_provider, recipe_1, u1_s1):
        """When AI is disabled for the space, the endpoint should return 400."""
        space_1.ai_enabled = False
        space_1.save()

        url = reverse(self.RECIPE_DETAIL_URL, args=[recipe_1.pk]) + f'?provider={ai_provider.pk}'
        r = u1_s1.post(url, json.dumps({}), content_type='application/json')

        assert r.status_code == 400
