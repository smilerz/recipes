from unittest.mock import patch

from django.contrib.auth.models import AnonymousUser
from django.db.utils import OperationalError
from django.test import RequestFactory

from cookbook.helper.scope_middleware import ScopeMiddleware


def test_oauth_db_error_during_api_auth_falls_through_gracefully():
    """A transient DB error while validating an OAuth2 bearer token (e.g. a dropped
    Postgres connection) must not crash the request with a raw 500 — it should be
    treated the same as any other authentication failure and fall through to the
    unauthenticated path."""
    request = RequestFactory().get('/api/shopping-list-entry/', HTTP_AUTHORIZATION='Bearer sometoken')
    request.user = AnonymousUser()

    def get_response(req):
        return req

    with patch(
        'cookbook.helper.scope_middleware.OAuth2Authentication.authenticate',
        side_effect=OperationalError('SSL connection has been closed unexpectedly'),
    ):
        response = ScopeMiddleware(get_response)(request)

    assert response.space is None
