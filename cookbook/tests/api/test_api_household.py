import pytest
from django.contrib import auth
from django.urls import reverse
from django_scopes import scopes_disabled

from cookbook.models import Household, InventoryLocation

LIST_URL = 'api:household-list'
DETAIL_URL = 'api:household-detail'


# feat-edit-inventory-location-id-tc03 / feat-inventory-booking-tc08: GET /api/household/
# 403'd for non-owner space members (permission_classes required CustomIsSpaceOwner for
# EVERY action, including list/retrieve), making the Household picker unusable in both
# the InventoryLocation create form and the inventory-booking dialog for anyone but the
# literal space owner. Regular users need to at least list their space's households to
# use pantry/inventory features; only mutating households should stay owner-only.
@pytest.mark.parametrize("arg", [
    ['a_u', 403],
    ['g1_s1', 403],
    ['u1_s1', 200],
    ['a1_s1', 200],
])
def test_list_permission(arg, request):
    c = request.getfixturevalue(arg[0])
    assert c.get(reverse(LIST_URL)).status_code == arg[1]


def test_non_owner_can_read_but_not_write(u1_s1, space_1):
    """A regular (non-owner) space member can list/retrieve households, but still
    cannot create/update/delete them - only read access was loosened."""
    with scopes_disabled():
        hh = Household.objects.create(name='Existing HH', space=space_1)

    assert u1_s1.get(reverse(LIST_URL)).status_code == 200
    assert u1_s1.get(reverse(DETAIL_URL, args={hh.id})).status_code == 200

    assert u1_s1.post(reverse(LIST_URL), {'name': 'New HH'}, content_type='application/json').status_code == 403
    assert u1_s1.patch(reverse(DETAIL_URL, args={hh.id}), {'name': 'Renamed'}, content_type='application/json').status_code == 403
    assert u1_s1.delete(reverse(DETAIL_URL, args={hh.id})).status_code == 403


def test_delete_household_referenced_by_inventory_location_is_blocked(u1_s1, space_1):
    """A household referenced by an InventoryLocation (PROTECT) must return a
    clean 4xx (403), not a 500, and the household must survive.

    u1_s1 is made the space owner so the request passes CustomIsSpaceOwner and
    reaches the delete (the defect is the unhandled ProtectedError, not perms).
    """
    user = auth.get_user(u1_s1)
    with scopes_disabled():
        space_1.created_by = user
        space_1.save()
        hh = Household.objects.create(name='Protected HH', space=space_1)
        InventoryLocation.objects.create(name='Pantry', household=hh, created_by=user, space=space_1)

    r = u1_s1.delete(reverse(DETAIL_URL, args={hh.id}))
    assert r.status_code == 403

    # delete was blocked (not a 500 / partial); the household is still retrievable
    assert u1_s1.get(reverse(DETAIL_URL, args={hh.id})).status_code == 200
