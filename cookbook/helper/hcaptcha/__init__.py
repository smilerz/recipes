# Vendored from django-hCaptcha 0.2.0 (BSD-3-Clause, (c) 2020 Andrej Zbin, see LICENSE.md), which has had no release
# since January 2022. Behaviour and the HCAPTCHA_* settings are unchanged; the only edits are that the settings are
# read where they are used instead of when the module is imported, and that the app no longer needs to be installed
# (the widget template lives in cookbook/templates/hcaptcha/).
from cookbook.helper.hcaptcha.fields import hCaptchaField
from cookbook.helper.hcaptcha.widgets import hCaptchaWidget

__all__ = ['hCaptchaField', 'hCaptchaWidget']
