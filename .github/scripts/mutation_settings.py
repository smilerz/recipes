"""Test settings for mutation runs.

Same as the normal test settings, but the SQLite test database is a file, so pytest's `--reuse-db`
can build it once (running every migration takes about a minute) and each of the hundreds of
mutant runs reuses it instead of rebuilding an in-memory one. Run with `--ds=mutation_settings`
and this directory on PYTHONPATH.
"""
import os

from recipes.test_settings import *  # noqa: F401,F403

DATABASES['default']['TEST'] = {  # noqa: F405
    'SERIALIZE': False,
    'NAME': os.environ.get('MUTATION_TEST_DB', '/tmp/mutation-test.sqlite3'),
}
