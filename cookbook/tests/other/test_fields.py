"""Tests for cookbook.fields.AutoOneToOneField, vendored from django-annoying."""
from django.contrib.auth.models import User
from django_scopes import scopes_disabled

from cookbook.models import UserPreference


def _user_without_preference(username):
    # a post_save signal creates the preference with the user, so remove it to reach the "missing row" case,
    # and re-fetch the user because Django caches the signal-created preference on the original instance
    user = User.objects.create_user(username)
    UserPreference.objects.filter(user=user).delete()
    return User.objects.get(pk=user.pk)


def test_reverse_access_creates_the_missing_row():
    with scopes_disabled():
        user = _user_without_preference('auto-pref-missing')
        assert not UserPreference.objects.filter(user=user).exists()

        preference = user.userpreference

        assert UserPreference.objects.filter(user=user).count() == 1
        assert preference.user == user


def test_repeated_access_returns_the_same_object_without_creating_another():
    with scopes_disabled():
        user = _user_without_preference('auto-pref-cached')

        first = user.userpreference
        second = user.userpreference

        assert first is second
        assert UserPreference.objects.filter(user=user).count() == 1


def test_an_existing_row_is_returned_not_replaced():
    with scopes_disabled():
        user = User.objects.create_user('auto-pref-existing')
        existing = UserPreference.objects.get(user=user)

        assert User.objects.get(pk=user.pk).userpreference.pk == existing.pk
        assert UserPreference.objects.filter(user=user).count() == 1
