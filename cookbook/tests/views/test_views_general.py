import pytest
from django.urls import reverse


# @pytest.mark.parametrize("arg", [
#     ['a_u', 302],
#     ['g1_s1', 302],
#     ['u1_s1', 302],
#     ['a1_s1', 302],
# ])
# def test_index(arg, request, ext_recipe_1_s1):
#     c = request.getfixturevalue(arg[0])
#     assert c.get(reverse('index')).status_code == arg[1]
#
#
# @pytest.mark.parametrize("arg", [
#     ['a_u', 302],
#     ['g1_s1', 200],
#     ['u1_s1', 200],
#     ['a1_s1', 200],
# ])
# def test_search(arg, request, ext_recipe_1_s1):
#     c = request.getfixturevalue(arg[0])
#     assert c.get(reverse('view_search')).status_code == arg[1]
#
#
# @pytest.mark.parametrize("arg", [
#     ['a_u', 302],
#     ['g1_s1', 302],
#     ['u1_s1', 200],
#     ['a1_s1', 200],
# ])
# def test_books(arg, request, ext_recipe_1_s1):
#     c = request.getfixturevalue(arg[0])
#     assert c.get(reverse('view_books')).status_code == arg[1]
#
#
# @pytest.mark.parametrize("arg", [
#     ['a_u', 302],
#     ['g1_s1', 302],
#     ['u1_s1', 200],
#     ['a1_s1', 200],
# ])
# def test_plan(arg, request, ext_recipe_1_s1):
#     c = request.getfixturevalue(arg[0])
#     assert c.get(reverse('view_plan')).status_code == arg[1]
#
#
# @pytest.mark.parametrize("arg", [
#     ['a_u', 302],
#     ['g1_s1', 302],
#     ['u1_s1', 200],
#     ['a1_s1', 200],
# ])
# def test_shopping(arg, request, ext_recipe_1_s1):
#     c = request.getfixturevalue(arg[0])
#     assert c.get(reverse('view_shopping')).status_code == arg[1]
#
#
# @pytest.mark.parametrize("arg", [
#     ['a_u', 302],
#     ['g1_s1', 200],
#     ['u1_s1', 200],
#     ['a1_s1', 200],
# ])
# def test_settings(arg, request, ext_recipe_1_s1):
#     c = request.getfixturevalue(arg[0])
#     assert c.get(reverse('view_settings')).status_code == arg[1]
#
#
# @pytest.mark.parametrize("arg", [
#     ['a_u', 302],
#     ['g1_s1', 200],
#     ['u1_s1', 200],
#     ['a1_s1', 200],
# ])
# def test_history(arg, request, ext_recipe_1_s1):
#     c = request.getfixturevalue(arg[0])
#     assert c.get(reverse('view_history')).status_code == arg[1]


@pytest.mark.parametrize("arg", [
    ['a_u', 302],
    ['g1_s1', 302],
    ['u1_s1', 302],
    ['a1_s1', 302],
])
def test_system(arg, request, ext_recipe_1_s1):
    c = request.getfixturevalue(arg[0])
    assert c.get(reverse('view_system')).status_code == arg[1]


@pytest.mark.parametrize("arg", [
    ['a_u', 302],
    ['g1_s1', 302],
    ['u1_s1', 302],
    ['a1_s1', 302],
])
def test_setup(arg, request, ext_recipe_1_s1):
    c = request.getfixturevalue(arg[0])
    assert c.get(reverse('view_setup')).status_code == arg[1]


@pytest.mark.parametrize("arg", [
    ['a_u', 200],
    ['g1_s1', 200],
    ['u1_s1', 200],
    ['a1_s1', 200],
])
def test_markdown_doc(arg, request, ext_recipe_1_s1):
    c = request.getfixturevalue(arg[0])
    assert c.get(reverse('docs_markdown')).status_code == arg[1]


@pytest.mark.parametrize("arg", [
    ['a_u', 302],
    ['g1_s1', 200],
    ['u1_s1', 200],
    ['a1_s1', 200],
])
def test_api_info(arg, request, ext_recipe_1_s1):
    c = request.getfixturevalue(arg[0])
    assert c.get(reverse('docs_api')).status_code == arg[1]


@pytest.mark.parametrize("arg", [
    ['a_u', 302],
    ['g1_s1', 200],
    ['u1_s1', 200],
    ['a1_s1', 200],
])
def test_api_swagger(arg, request, ext_recipe_1_s1):
    c = request.getfixturevalue(arg[0])
    assert c.get(reverse('docs_swagger')).status_code == arg[1]


@pytest.mark.parametrize("url_name", ['docs_api', 'docs_swagger'])
def test_docs_send_a_visitor_to_the_login_page_and_back(url_name, a_u):
    url = reverse(url_name)
    response = a_u.get(url)
    assert response.status_code == 302
    assert response['Location'] == reverse('account_login') + '?next=' + url


# The views that are for users only (export file, telegram bot, sync) send everybody else to the no permission page.
def test_the_no_permission_page_sends_a_visitor_to_the_login_page(a_u):
    response = a_u.get(reverse('view_no_perm'))
    assert response.status_code == 302
    assert response['Location'] == reverse('account_login') + '?next=/search/'


def test_the_no_permission_page_tells_a_logged_in_user_that_they_may_not_see_the_page(g1_s1):
    assert g1_s1.get(reverse('view_no_perm')).status_code == 200


@pytest.mark.parametrize("fixture", ['a_u', 'g1_s1'])
def test_a_view_for_users_only_sends_others_to_the_no_permission_page(fixture, request):
    response = request.getfixturevalue(fixture).get(reverse('view_export_file', args=[1]))
    assert response.status_code == 302
    assert response['Location'].startswith(reverse('view_no_perm'))
