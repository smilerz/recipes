import inspect
import json
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import ProxyHandler, Request, build_opener

from django import forms
from django.conf import settings
from django.utils.translation import gettext_lazy as _

from cookbook.helper.hcaptcha.widgets import hCaptchaWidget


class hCaptchaField(forms.Field):
    widget = hCaptchaWidget
    default_error_messages = {
        'error_hcaptcha': _('hCaptcha could not be verified.'),
        'invalid_hcaptcha': _('hCaptcha could not be verified.'),
        'required': _('Please prove you are a human.'),
    }

    def __init__(self, **kwargs):
        superclass_parameters = inspect.signature(super().__init__).parameters
        superclass_kwargs = {}
        widget_settings = dict(getattr(settings, 'HCAPTCHA_DEFAULT_CONFIG', {}))
        for key, value in kwargs.items():
            if key in superclass_parameters:
                superclass_kwargs[key] = value
            else:
                widget_settings[key] = value

        widget_url_settings = {}
        for prop in filter(lambda p: p in widget_settings, ('onload', 'render', 'hl')):
            widget_url_settings[prop] = widget_settings[prop]
            del widget_settings[prop]
        self.widget_settings = widget_settings

        super().__init__(**superclass_kwargs)

        self.widget.extra_url = widget_url_settings

    def widget_attrs(self, widget):
        attrs = super().widget_attrs(widget)
        for key, value in self.widget_settings.items():
            attrs['data-%s' % key] = value
        return attrs

    def validate(self, value):
        super().validate(value)
        opener = build_opener(ProxyHandler(getattr(settings, 'HCAPTCHA_PROXIES', {})))
        post_data = urlencode({
            'secret': getattr(settings, 'HCAPTCHA_SECRET', '0x0000000000000000000000000000000000000000'),
            'response': value,
        }).encode()
        request = Request(getattr(settings, 'HCAPTCHA_VERIFY_URL', 'https://hcaptcha.com/siteverify'), post_data)
        try:
            response = opener.open(request, timeout=getattr(settings, 'HCAPTCHA_TIMEOUT', 5))
        except HTTPError:
            raise forms.ValidationError(self.error_messages['error_hcaptcha'], code='error_hcaptcha')

        response_data = json.loads(response.read().decode("utf-8"))

        if not response_data.get('success'):
            raise forms.ValidationError(self.error_messages['invalid_hcaptcha'], code='invalid_hcaptcha')
