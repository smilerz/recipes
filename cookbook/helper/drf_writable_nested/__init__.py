# Vendored copy of drf-writable-nested 0.7.2 (https://github.com/beda-software/drf-writable-nested),
# BSD 2-Clause, Copyright beda.software - see LICENSE.md in this directory. It is kept in-tree because the
# upstream project releases rarely and 38 serializers depend on it. Apart from import tidying for flake8,
# the code is unmodified upstream.
from .mixins import NestedCreateMixin, NestedUpdateMixin, UniqueFieldsMixin
from .serializers import WritableNestedModelSerializer

__all__ = ['NestedCreateMixin', 'NestedUpdateMixin', 'UniqueFieldsMixin', 'WritableNestedModelSerializer']

__title__ = 'DRF writable nested'
__version__ = '0.7.2'
__author__ = 'beda.software'
__license__ = 'BSD 2-Clause'
__copyright__ = 'Copyright 2014-2025 beda.software'

# Version synonym
VERSION = __version__
