import json

import pytest
from django.contrib import auth
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse

from cookbook.models import UserFile

LIST_URL = 'api:userfile-list'


def _make_file(filename):
    return SimpleUploadedFile(filename, b'x', content_type='text/plain')


def test_ordering_name(u1_s1, space_1):
    user = auth.get_user(u1_s1)
    UserFile.objects.create(name='zzz_file', file=_make_file('zzz.txt'), created_by=user, space=space_1)
    UserFile.objects.create(name='aaa_file', file=_make_file('aaa.txt'), created_by=user, space=space_1)

    asc = json.loads(u1_s1.get(f'{reverse(LIST_URL)}?ordering=name').content)
    assert asc['results'][0]['name'] == 'aaa_file'

    desc = json.loads(u1_s1.get(f'{reverse(LIST_URL)}?ordering=-name').content)
    assert desc['results'][0]['name'] == 'zzz_file'
