import json
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError
from urllib.parse import parse_qs

import pytest
from django import forms
from django.urls import reverse

from cookbook.forms import AllAuthSignupForm, CustomPasswordResetForm
from cookbook.helper.hcaptcha import hCaptchaField, hCaptchaWidget

OPENER = 'cookbook.helper.hcaptcha.fields.build_opener'


class CaptchaForm(forms.Form):
    captcha = hCaptchaField()


def _siteverify_returns(payload):
    response = MagicMock()
    response.read.return_value = json.dumps(payload).encode()
    opener = MagicMock()
    opener.open.return_value = response
    return opener


class TestWidget:
    @pytest.fixture(autouse=True)
    def _sitekey(self, settings):
        settings.HCAPTCHA_SITEKEY = 'site-key-123'

    def test_renders_the_container_with_the_sitekey(self):
        html = CaptchaForm()['captcha'].as_widget()
        assert 'class="h-captcha"' in html
        assert 'data-sitekey="site-key-123"' in html

    def test_loads_the_hcaptcha_script(self):
        assert '<script src="https://hcaptcha.com/1/api.js" async defer></script>' in CaptchaForm()['captcha'].as_widget()

    def test_script_url_is_configurable(self, settings):
        settings.HCAPTCHA_JS_API_URL = 'https://example.org/api.js'
        assert 'src="https://example.org/api.js"' in CaptchaForm()['captcha'].as_widget()

    def test_reads_the_token_from_the_hcaptcha_response_field(self):
        widget = hCaptchaWidget()
        assert widget.value_from_datadict({'h-captcha-response': 'tok', 'other': 'x'}, {}, 'captcha') == 'tok'
        assert widget.value_from_datadict({'captcha': 'tok'}, {}, 'captcha') is None

    def test_default_config_becomes_data_attributes(self, settings):
        settings.HCAPTCHA_DEFAULT_CONFIG = {'theme': 'dark'}

        class Form(forms.Form):
            captcha = hCaptchaField()
        assert 'data-theme="dark"' in Form()['captcha'].as_widget()

    def test_field_kwargs_become_data_attributes(self):
        class Form(forms.Form):
            captcha = hCaptchaField(size='compact')
        assert 'data-size="compact"' in Form()['captcha'].as_widget()

    def test_url_options_go_on_the_script_url_not_on_the_container(self):
        class Form(forms.Form):
            captcha = hCaptchaField(hl='de')
        html = Form()['captcha'].as_widget()
        assert 'api.js?hl=de' in html
        assert 'data-hl' not in html


class TestFieldValidation:
    @pytest.fixture(autouse=True)
    def _secret(self, settings):
        settings.HCAPTCHA_SECRET = 'secret-abc'

    def test_missing_token_asks_the_user_to_prove_they_are_human(self):
        form = CaptchaForm(data={})
        assert not form.is_valid()
        assert form.errors['captcha'] == ['Please prove you are a human.']

    def test_accepts_a_token_hcaptcha_confirms(self):
        with patch(OPENER, return_value=_siteverify_returns({'success': True})):
            assert CaptchaForm(data={'h-captcha-response': 'tok'}).is_valid()

    def test_rejects_a_token_hcaptcha_refuses(self):
        with patch(OPENER, return_value=_siteverify_returns({'success': False})):
            form = CaptchaForm(data={'h-captcha-response': 'tok'})
            assert not form.is_valid()
            assert form.errors['captcha'] == ['hCaptcha could not be verified.']

    def test_http_error_from_hcaptcha_is_a_validation_error(self):
        opener = MagicMock()
        opener.open.side_effect = HTTPError('https://hcaptcha.com/siteverify', 500, 'boom', {}, None)
        with patch(OPENER, return_value=opener):
            form = CaptchaForm(data={'h-captcha-response': 'tok'})
            assert not form.is_valid()
            assert form.errors['captcha'] == ['hCaptcha could not be verified.']

    def test_posts_secret_and_token_to_the_verify_url(self):
        opener = _siteverify_returns({'success': True})
        with patch(OPENER, return_value=opener):
            CaptchaForm(data={'h-captcha-response': 'tok'}).is_valid()
        request = opener.open.call_args.args[0]
        assert request.full_url == 'https://hcaptcha.com/siteverify'
        assert parse_qs(request.data.decode()) == {'secret': ['secret-abc'], 'response': ['tok']}
        assert opener.open.call_args.kwargs['timeout'] == 5

    def test_verify_url_and_timeout_are_configurable(self, settings):
        settings.HCAPTCHA_VERIFY_URL = 'https://example.org/verify'
        settings.HCAPTCHA_TIMEOUT = 2
        opener = _siteverify_returns({'success': True})
        with patch(OPENER, return_value=opener):
            CaptchaForm(data={'h-captcha-response': 'tok'}).is_valid()
        assert opener.open.call_args.args[0].full_url == 'https://example.org/verify'
        assert opener.open.call_args.kwargs['timeout'] == 2

    def test_proxies_are_passed_to_the_opener(self, settings):
        settings.HCAPTCHA_PROXIES = {'https': 'http://proxy.example:3128'}
        with patch(OPENER, return_value=_siteverify_returns({'success': True})), \
                patch('cookbook.helper.hcaptcha.fields.ProxyHandler') as proxy_handler:
            CaptchaForm(data={'h-captcha-response': 'tok'}).is_valid()
        proxy_handler.assert_called_once_with({'https': 'http://proxy.example:3128'})


@pytest.mark.django_db
class TestFormsOnlyAskForACaptchaWhenConfigured:
    def test_signup_form_has_the_captcha_when_a_secret_is_set(self, settings):
        settings.HCAPTCHA_SECRET = 'secret-abc'
        assert 'captcha' in AllAuthSignupForm().fields

    def test_signup_form_drops_the_captcha_without_a_secret(self, settings):
        settings.HCAPTCHA_SECRET = ''
        assert 'captcha' not in AllAuthSignupForm().fields

    def test_password_reset_form_has_the_captcha_when_a_secret_is_set(self, settings):
        settings.HCAPTCHA_SECRET = 'secret-abc'
        assert 'captcha' in CustomPasswordResetForm().fields

    def test_password_reset_form_drops_the_captcha_without_a_secret(self, settings):
        settings.HCAPTCHA_SECRET = ''
        assert 'captcha' not in CustomPasswordResetForm().fields


@pytest.mark.django_db
class TestSignupPage:
    def test_renders_the_captcha_widget_when_configured(self, client, settings):
        settings.ENABLE_SIGNUP = True
        settings.HCAPTCHA_SITEKEY = 'site-key-123'
        settings.HCAPTCHA_SECRET = 'secret-abc'
        response = client.get(reverse('account_signup'))
        assert response.status_code == 200
        html = response.content.decode()
        assert 'class="h-captcha"' in html
        assert 'data-sitekey="site-key-123"' in html

    def test_has_no_captcha_widget_when_not_configured(self, client, settings):
        settings.ENABLE_SIGNUP = True
        settings.HCAPTCHA_SITEKEY = ''
        settings.HCAPTCHA_SECRET = ''
        response = client.get(reverse('account_signup'))
        assert response.status_code == 200
        assert 'h-captcha' not in response.content.decode()
