import json
from io import BytesIO
from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from litellm.exceptions import Timeout
from PIL import Image

from cookbook.models import AiProvider, PropertyType
from cookbook.tests.factories import FoodFactory, RecipeFactory, StepFactory


@pytest.fixture
def ai_provider(space_1):
    return AiProvider.objects.create(
        name='test_provider',
        space=space_1,
        api_key='test-key',
        model_name='test-model',
    )


@pytest.fixture
def food_1(space_1):
    return FoodFactory.create(space=space_1)


@pytest.fixture
def recipe_1(space_1):
    return RecipeFactory.create(space=space_1)


@pytest.fixture
def ai_space(space_1, ai_provider):
    space_1.ai_provider = ai_provider
    space_1.save()
    return space_1


TIMEOUT_SIDE_EFFECT = Timeout(
    message='Request timed out after 120 seconds',
    model='test-model',
    llm_provider='test',
)


SECRET_ERROR_TEXT = 'db password is hunter2'
GENERIC_ERROR_SIDE_EFFECT = Exception(SECRET_ERROR_TEXT)


@pytest.mark.django_db
class TestFoodAiPropertiesTimeout:

    @patch('cookbook.views.api.completion')
    def test_timeout_returns_408(self, mock_completion, ai_space, food_1, a1_s1):
        mock_completion.side_effect = TIMEOUT_SIDE_EFFECT
        PropertyType.objects.create(name='test_prop', space=ai_space)

        url = reverse('api:food-aiproperties', kwargs={'pk': food_1.pk})
        response = a1_s1.post(
            f'{url}?provider={ai_space.ai_provider.pk}',
            json.dumps({'name': food_1.name}),
            content_type='application/json',
        )

        assert response.status_code == 408
        data = json.loads(response.content)
        assert data['error'] is True
        assert 'timed out' in data['msg'].lower()

    @patch('cookbook.views.api.completion')
    def test_unexpected_error_does_not_leak_exception_text(self, mock_completion, ai_space, food_1, a1_s1):
        mock_completion.side_effect = GENERIC_ERROR_SIDE_EFFECT
        PropertyType.objects.create(name='test_prop', space=ai_space)

        url = reverse('api:food-aiproperties', kwargs={'pk': food_1.pk})
        response = a1_s1.post(
            f'{url}?provider={ai_space.ai_provider.pk}',
            json.dumps({'name': food_1.name}),
            content_type='application/json',
        )

        assert response.status_code == 500
        assert SECRET_ERROR_TEXT not in response.content.decode()


@pytest.mark.django_db
class TestRecipeAiPropertiesTimeout:

    @patch('cookbook.views.api.completion')
    def test_timeout_returns_408(self, mock_completion, ai_space, recipe_1, a1_s1):
        mock_completion.side_effect = TIMEOUT_SIDE_EFFECT
        PropertyType.objects.create(name='test_prop', space=ai_space)

        url = reverse('api:recipe-aiproperties', kwargs={'pk': recipe_1.pk})
        response = a1_s1.post(
            f'{url}?provider={ai_space.ai_provider.pk}',
            json.dumps({'name': recipe_1.name}),
            content_type='application/json',
        )

        assert response.status_code == 408
        data = json.loads(response.content)
        assert data['error'] is True
        assert 'timed out' in data['msg'].lower()

    @patch('cookbook.views.api.completion')
    def test_unexpected_error_does_not_leak_exception_text(self, mock_completion, ai_space, recipe_1, a1_s1):
        mock_completion.side_effect = GENERIC_ERROR_SIDE_EFFECT
        PropertyType.objects.create(name='test_prop', space=ai_space)

        url = reverse('api:recipe-aiproperties', kwargs={'pk': recipe_1.pk})
        response = a1_s1.post(
            f'{url}?provider={ai_space.ai_provider.pk}',
            json.dumps({'name': recipe_1.name}),
            content_type='application/json',
        )

        assert response.status_code == 500
        assert SECRET_ERROR_TEXT not in response.content.decode()


@pytest.mark.django_db
class TestAiStepSortTimeout:

    @patch('cookbook.views.api.completion')
    def test_timeout_returns_408(self, mock_completion, ai_space, recipe_1, a1_s1):
        mock_completion.side_effect = TIMEOUT_SIDE_EFFECT
        step1 = StepFactory.create(space=ai_space, ingredients__count=0)
        step2 = StepFactory.create(space=ai_space, ingredients__count=0)
        recipe_1.steps.add(step1, step2)

        url = reverse('api_ai_step_sort')
        response = a1_s1.post(
            f'{url}?provider={ai_space.ai_provider.pk}',
            json.dumps({'name': recipe_1.name}),
            content_type='application/json',
        )

        assert response.status_code == 408
        data = json.loads(response.content)
        assert data['error'] is True
        assert 'timed out' in data['msg'].lower()

    @patch('cookbook.views.api.completion')
    def test_unexpected_error_does_not_leak_exception_text(self, mock_completion, ai_space, recipe_1, a1_s1):
        mock_completion.side_effect = GENERIC_ERROR_SIDE_EFFECT
        step1 = StepFactory.create(space=ai_space, ingredients__count=0)
        step2 = StepFactory.create(space=ai_space, ingredients__count=0)
        recipe_1.steps.add(step1, step2)

        url = reverse('api_ai_step_sort')
        response = a1_s1.post(
            f'{url}?provider={ai_space.ai_provider.pk}',
            json.dumps({'name': recipe_1.name}),
            content_type='application/json',
        )

        assert response.status_code == 500
        assert SECRET_ERROR_TEXT not in response.content.decode()


@pytest.mark.django_db
class TestAiImportTimeout:

    @patch('cookbook.views.api.completion')
    def test_timeout_returns_408(self, mock_completion, ai_space, a1_s1):
        mock_completion.side_effect = TIMEOUT_SIDE_EFFECT

        # Create a small valid PNG image for the file upload
        img = Image.new('RGB', (1, 1), color='red')
        buf = BytesIO()
        img.save(buf, format='PNG')
        buf.seek(0)
        test_file = SimpleUploadedFile('test.png', buf.read(), content_type='image/png')

        url = reverse('api_ai_import')
        response = a1_s1.post(
            url,
            {
                'ai_provider_id': ai_space.ai_provider.pk,
                'text': '',
                'recipe_id': '',
                'file': test_file,
            },
        )

        assert response.status_code == 408
        data = json.loads(response.content)
        assert data['error'] is True
        assert 'timed out' in data['msg'].lower()

    @patch('cookbook.views.api.scrape_html')
    @patch('cookbook.views.api.completion')
    def test_unexpected_error_does_not_leak_stack_trace(self, mock_completion, mock_scrape_html, ai_space, a1_s1):
        mock_completion.return_value.choices = [type('C', (), {'message': type('M', (), {'content': '{}'})()})]
        mock_scrape_html.side_effect = GENERIC_ERROR_SIDE_EFFECT

        img = Image.new('RGB', (1, 1), color='red')
        buf = BytesIO()
        img.save(buf, format='PNG')
        buf.seek(0)
        test_file = SimpleUploadedFile('test.png', buf.read(), content_type='image/png')

        url = reverse('api_ai_import')
        response = a1_s1.post(
            url,
            {
                'ai_provider_id': ai_space.ai_provider.pk,
                'text': '',
                'recipe_id': '',
                'file': test_file,
            },
        )

        assert response.status_code == 400
        assert SECRET_ERROR_TEXT not in response.content.decode()
        assert 'Traceback (most recent call last)' not in response.content.decode()
