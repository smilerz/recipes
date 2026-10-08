"""Characterization tests for HelperFunctions.match_or_fuzzymatch.

The expected values were captured from the original implementation (the thefuzz library) so a change of
fuzzy-matching library cannot silently alter which Cooklang metadata keys get matched, or their scores.
"""
import copy

import pytest

from cookbook.helper.HelperFunctions import match_or_fuzzymatch

META = {
    'title': ['name', 'recipe name'],
    'description': ['summary', 'about'],
    'servings': ['serves', 'yield'],
    'source': ['url', 'link'],
}


@pytest.mark.parametrize('query, expected', [
    ('Title', ('title', 100)),  # exact key, case-insensitive
    ('SERVES', ('servings', 100)),  # exact alternative term
    ('yield!', ('servings', 100)),  # punctuation is ignored when fuzzy matching
    ('rezept name', ('title', 100)),  # token order/partial match
    ('sourse url', ('source', 100)),
    ('servigns', ('servings', 88)),  # typo
    ('descripton', ('description', 90)),
    ('sumary', ('description', 83)),
    ('unrelated words here', ('source', 67)),  # nothing close: still the best (low) score, not None
])
def test_match_or_fuzzymatch(query, expected):
    assert match_or_fuzzymatch(query, copy.deepcopy(META)) == expected


def test_scores_are_whole_numbers():
    key, score = match_or_fuzzymatch('servigns', copy.deepcopy(META))
    assert isinstance(score, int)


@pytest.mark.parametrize('query, expected', [
    ('servés', ('servings', 89)),
    ('sérvés', ('servings', 75)),
    ('déscription', ('description', 95)),
    ('tïtle recipe', ('title', 89)),
    ('naïve résumé', ('title', 75)),
])
def test_accented_characters_are_dropped_before_comparing(query, expected):
    """The original library deleted characters in the 128-255 range before scoring, so accents change the score."""
    assert match_or_fuzzymatch(query, copy.deepcopy(META)) == expected
