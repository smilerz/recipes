import pytest
from django.test import override_settings

from cookbook.models import Recipe
from cookbook.provider.local import Local


@override_settings(LOCAL_STORAGE_PATHS=['/tmp/allowed'])
def test_is_path_allowed():
    # Normal allowed path
    assert Local.is_path_allowed('/tmp/allowed/recipe.pdf')
    # Path outside
    assert not Local.is_path_allowed('/etc/passwd')
    # Attempt to traverse out
    assert not Local.is_path_allowed('/tmp/allowed/../forbidden/recipe.pdf')


@override_settings(LOCAL_STORAGE_PATHS=['/tmp/allowed'])
def test_get_file_restriction():
    recipe = Recipe(file_path='/etc/passwd')
    with pytest.raises(Exception, match='Path not allowed'):
        Local.get_file(recipe)


@override_settings(LOCAL_STORAGE_PATHS=['/tmp/allow'])
def test_path_prefix_attack():
    # Path that starts with allowed prefix but is a different directory
    assert not Local.is_path_allowed('/tmp/allowed_secret/file.txt')
    assert Local.is_path_allowed('/tmp/allow/file.txt')
