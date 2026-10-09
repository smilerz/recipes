from urllib.parse import urlencode

from django import forms
from django.conf import settings


class hCaptchaWidget(forms.Widget):
    template_name = 'hcaptcha/forms/widgets/hcaptcha_widget.html'

    def __init__(self, *args, **kwargs):
        self.extra_url = {}
        super().__init__(*args, **kwargs)

    def value_from_datadict(self, data, files, name):
        return data.get('h-captcha-response')

    def build_attrs(self, base_attrs, extra_attrs=None):
        attrs = super().build_attrs(base_attrs, extra_attrs)
        attrs['data-sitekey'] = getattr(settings, 'HCAPTCHA_SITEKEY', '10000000-ffff-ffff-ffff-000000000001')
        return attrs

    def get_context(self, name, value, attrs):
        context = super().get_context(name, value, attrs)
        context['api_url'] = getattr(settings, 'HCAPTCHA_JS_API_URL', 'https://hcaptcha.com/1/api.js')
        if self.extra_url:
            context['api_url'] += '?' + urlencode(self.extra_url)
        return context
