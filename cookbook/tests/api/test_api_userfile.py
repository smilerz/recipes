import json

from django.contrib import auth
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test.client import BOUNDARY, MULTIPART_CONTENT, encode_multipart
from django.urls import reverse

from cookbook.models import Step, UserFile

LIST_URL = 'api:userfile-list'
DETAIL_URL = 'api:userfile-detail'


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


def test_ordering_file_size_kb(u1_s1, space_1):
    """Characterization: file_size_kb ordering (plain-field path, no Lower())."""
    user = auth.get_user(u1_s1)
    small = UserFile.objects.create(name='char_small', file=SimpleUploadedFile('s.txt', b'x' * 1000), created_by=user, space=space_1)
    large = UserFile.objects.create(name='char_large', file=SimpleUploadedFile('l.txt', b'x' * 9000), created_by=user, space=space_1)

    asc = json.loads(u1_s1.get(f'{reverse(LIST_URL)}?ordering=file_size_kb').content)
    ids_asc = [r['id'] for r in asc['results']]
    assert ids_asc.index(small.id) < ids_asc.index(large.id)

    desc = json.loads(u1_s1.get(f'{reverse(LIST_URL)}?ordering=-file_size_kb').content)
    ids_desc = [r['id'] for r in desc['results']]
    assert ids_desc.index(large.id) < ids_desc.index(small.id)


def test_crop_data_write_and_read(u1_s1, space_1):
    """crop_data is writable via PATCH and readable back (#42 restoration:
    Food/avatar image crop-position support dropped during a chain rebaseline).
    UserFileViewSet only accepts multipart (file uploads), so crop_data goes
    over the wire as a JSON-encoded string, same as a real upload form."""
    user = auth.get_user(u1_s1)
    uf = UserFile.objects.create(name='cropped', file=_make_file('c.txt'), created_by=user, space=space_1)

    body = encode_multipart(BOUNDARY, {'crop_data': json.dumps({'x': 10, 'y': 20, 'width': 50, 'height': 50})})
    r = u1_s1.patch(reverse(DETAIL_URL, args=[uf.id]), body, content_type=MULTIPART_CONTENT)
    assert r.status_code == 200
    assert json.loads(r.content)['crop_data'] == {'x': 10, 'y': 20, 'width': 50, 'height': 50}

    assert json.loads(u1_s1.get(reverse(DETAIL_URL, args=[uf.id])).content)['crop_data'] == {'x': 10, 'y': 20, 'width': 50, 'height': 50}


def test_crop_data_update_via_json_patch(u1_s1, space_1):
    """The recrop editor (updateUserFileCropData in useFileApi.ts) sends a plain
    JSON PATCH with only crop_data - no file, so it can't go through multipart.
    UserFileViewSet only accepted MultiPartParser, so this path 415'd for every
    UserFileField consumer (avatar recrop, space logo recrop, food image recrop),
    not just food images (#42)."""
    user = auth.get_user(u1_s1)
    uf = UserFile.objects.create(name='cropped', file=_make_file('c.txt'), created_by=user, space=space_1)

    r = u1_s1.patch(reverse(DETAIL_URL, args=[uf.id]), {'crop_data': {'x': 5, 'y': 5, 'width': 90, 'height': 90}},
                     content_type='application/json')
    assert r.status_code == 200
    assert json.loads(r.content)['crop_data'] == {'x': 5, 'y': 5, 'width': 90, 'height': 90}


def test_crop_data_rejects_unknown_fields(u1_s1, space_1):
    user = auth.get_user(u1_s1)
    uf = UserFile.objects.create(name='cropped', file=_make_file('c.txt'), created_by=user, space=space_1)

    body = encode_multipart(BOUNDARY, {'crop_data': json.dumps({'bogus': 1})})
    r = u1_s1.patch(reverse(DETAIL_URL, args=[uf.id]), body, content_type=MULTIPART_CONTENT)
    assert r.status_code == 400


def test_delete_userfile_referenced_by_step_is_blocked(u1_s1, space_1):
    """A user file attached to a recipe step is PROTECTed: deleting it must
    return a clean 4xx (403), not a 500, and the file must survive."""
    user = auth.get_user(u1_s1)
    uf = UserFile.objects.create(name='attached', file=_make_file('a.txt'), created_by=user, space=space_1)
    Step.objects.create(space=space_1, file=uf)

    r = u1_s1.delete(reverse(DETAIL_URL, args=[uf.id]))
    assert r.status_code == 403

    # delete was blocked (not a 500 / partial); the file is still retrievable
    assert u1_s1.get(reverse(DETAIL_URL, args=[uf.id])).status_code == 200
