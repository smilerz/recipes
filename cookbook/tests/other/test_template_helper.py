from dataclasses import dataclass
from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from bs4 import BeautifulSoup

from cookbook.helper.template_helper import _resolve_unit_name, _resolve_food_name, _plural_name_tag, IngredientObject, render_instructions
from cookbook.templatetags.custom_tags import markdown as markdown_filter


@dataclass
class MockUnit:
    name: str
    plural_name: str = None

    def __str__(self):
        return self.name


@dataclass
class MockFood:
    name: str
    plural_name: str = None

    def __str__(self):
        return self.name


@dataclass
class MockIngredient:
    amount: Decimal
    no_amount: bool = False
    unit: MockUnit = None
    food: MockFood = None
    note: str = ""


class TestResolveUnitName:
    """Tests for _resolve_unit_name helper."""

    def test_no_unit(self):
        ing = MockIngredient(amount=Decimal(1), unit=None)
        assert _resolve_unit_name(ing) == ""

    def test_unit_no_plural(self):
        ing = MockIngredient(amount=Decimal(0), unit=MockUnit("kg"))
        assert _resolve_unit_name(ing) == "kg"

    def test_unit_no_plural_amount_1(self):
        ing = MockIngredient(amount=Decimal(1), unit=MockUnit("kg"))
        assert _resolve_unit_name(ing) == "kg"

    def test_unit_no_plural_amount_2(self):
        ing = MockIngredient(amount=Decimal(2), unit=MockUnit("kg"))
        assert _resolve_unit_name(ing) == "kg"

    def test_unit_empty_plural(self):
        ing = MockIngredient(amount=Decimal(2), unit=MockUnit("kg", ""))
        assert _resolve_unit_name(ing) == "kg"

    def test_plural_unit_amount_0(self):
        ing = MockIngredient(amount=Decimal(0), unit=MockUnit("slice", "slices"))
        assert _resolve_unit_name(ing) == "slices"

    def test_plural_unit_amount_1(self):
        ing = MockIngredient(amount=Decimal(1), unit=MockUnit("slice", "slices"))
        assert _resolve_unit_name(ing) == "slice"

    def test_plural_unit_amount_1_point_0(self):
        ing = MockIngredient(amount=Decimal("1.0"), unit=MockUnit("slice", "slices"))
        assert _resolve_unit_name(ing) == "slice"

    def test_plural_unit_amount_1_point_5(self):
        ing = MockIngredient(amount=Decimal("1.5"), unit=MockUnit("slice", "slices"))
        assert _resolve_unit_name(ing) == "slices"

    def test_plural_unit_amount_half(self):
        ing = MockIngredient(amount=Decimal("0.5"), unit=MockUnit("slice", "slices"))
        assert _resolve_unit_name(ing) == "slices"

    def test_plural_unit_negative(self):
        ing = MockIngredient(amount=Decimal(-1), unit=MockUnit("slice", "slices"))
        assert _resolve_unit_name(ing) == "slices"

    def test_no_amount_singular(self):
        ing = MockIngredient(amount=Decimal(0), no_amount=True, unit=MockUnit("slice", "slices"))
        assert _resolve_unit_name(ing) == "slice"

    def test_no_amount_singular_amount_2(self):
        ing = MockIngredient(amount=Decimal(2), no_amount=True, unit=MockUnit("slice", "slices"))
        assert _resolve_unit_name(ing) == "slice"


class TestResolveFoodName:
    """Tests for _resolve_food_name helper."""

    def test_no_food(self):
        ing = MockIngredient(amount=Decimal(1), food=None)
        assert _resolve_food_name(ing) == ""

    def test_food_no_plural(self):
        ing = MockIngredient(amount=Decimal(2), food=MockFood("apple"))
        assert _resolve_food_name(ing) == "apple"

    def test_food_empty_plural(self):
        ing = MockIngredient(amount=Decimal(2), food=MockFood("apple", ""))
        assert _resolve_food_name(ing) == "apple"

    def test_plural_food_amount_0(self):
        ing = MockIngredient(amount=Decimal(0), food=MockFood("apple", "apples"))
        assert _resolve_food_name(ing) == "apples"

    def test_plural_food_amount_half(self):
        ing = MockIngredient(amount=Decimal("0.5"), food=MockFood("apple", "apples"))
        assert _resolve_food_name(ing) == "apples"

    def test_plural_food_amount_1(self):
        ing = MockIngredient(amount=Decimal(1), food=MockFood("apple", "apples"))
        assert _resolve_food_name(ing) == "apple"

    def test_plural_food_amount_1_point_0(self):
        ing = MockIngredient(amount=Decimal("1.0"), food=MockFood("apple", "apples"))
        assert _resolve_food_name(ing) == "apple"

    def test_plural_food_amount_2_point_5(self):
        ing = MockIngredient(amount=Decimal("2.5"), food=MockFood("apple", "apples"))
        assert _resolve_food_name(ing) == "apples"

    def test_plural_food_negative(self):
        ing = MockIngredient(amount=Decimal(-1), food=MockFood("apple", "apples"))
        assert _resolve_food_name(ing) == "apples"

    def test_no_amount_singular(self):
        ing = MockIngredient(amount=Decimal(0), no_amount=True, food=MockFood("apple", "apples"))
        assert _resolve_food_name(ing) == "apple"

    def test_no_amount_with_unit(self):
        ing = MockIngredient(amount=Decimal(0), no_amount=True,
                             unit=MockUnit("slice", "slices"),
                             food=MockFood("apple", "apples"))
        assert _resolve_food_name(ing) == "apple"

    def test_unit_and_food_amount_0(self):
        ing = MockIngredient(amount=Decimal(0),
                             unit=MockUnit("kg"),
                             food=MockFood("apple", "apples"))
        assert _resolve_food_name(ing) == "apples"

    def test_unit_and_food_amount_1(self):
        ing = MockIngredient(amount=Decimal(1),
                             unit=MockUnit("kg"),
                             food=MockFood("apple", "apples"))
        assert _resolve_food_name(ing) == "apple"

    def test_unit_and_food_amount_2(self):
        ing = MockIngredient(amount=Decimal(2),
                             unit=MockUnit("kg"),
                             food=MockFood("apple", "apples"))
        assert _resolve_food_name(ing) == "apples"

    def test_plural_unit_and_food_amount_1(self):
        ing = MockIngredient(amount=Decimal(1),
                             unit=MockUnit("slice", "slices"),
                             food=MockFood("apple", "apples"))
        assert _resolve_food_name(ing) == "apple"

    def test_plural_unit_and_food_amount_1_point_5(self):
        ing = MockIngredient(amount=Decimal("1.5"),
                             unit=MockUnit("slice", "slices"),
                             food=MockFood("apple", "apples"))
        assert _resolve_food_name(ing) == "apples"


class TestPluralNameTag:
    """Tests for _plural_name_tag HTML tag generation."""

    def test_tag_with_singular_and_plural(self):
        result = _plural_name_tag("apple", "apples", Decimal(1), False)
        assert 'singular="apple"' in result
        assert 'plural="apples"' in result
        assert "v-bind:amount='1.0'" in result
        assert "v-bind:factor='ingredient_factor'" in result
        assert ":no-amount='false'" in result
        assert result.startswith("<plural-name")
        assert result.endswith("</plural-name>")

    def test_static_text_when_no_plural(self):
        result = _plural_name_tag("apple", None, Decimal(2), False)
        assert result == "apple"
        assert "<plural-name" not in result

    def test_static_text_when_empty_plural(self):
        result = _plural_name_tag("apple", "", Decimal(2), False)
        assert result == "apple"
        assert "<plural-name" not in result

    def test_apostrophe_escaped(self):
        result = _plural_name_tag("shepherd's pie", "shepherd's pies", Decimal(1), False)
        assert "shepherd&#x27;s pie" in result or "shepherd&apos;s pie" in result
        assert "shepherd&#x27;s pies" in result or "shepherd&apos;s pies" in result

    def test_no_amount_true(self):
        result = _plural_name_tag("apple", "apples", Decimal(0), True)
        assert ":no-amount='true'" in result

    def test_amount_serialized_as_float(self):
        result = _plural_name_tag("apple", "apples", Decimal("1.5000000000000000"), False)
        assert "v-bind:amount='1.5'" in result
        assert "Decimal" not in result

    def test_amount_zero(self):
        result = _plural_name_tag("apple", "apples", Decimal(0), False)
        assert "v-bind:amount='0.0'" in result

    def test_html_special_chars_escaped(self):
        result = _plural_name_tag('a<b', 'a<bs', Decimal(1), False)
        assert 'singular="a&lt;b"' in result
        assert 'plural="a&lt;bs"' in result


class TestIngredientObject:
    """Integration tests for IngredientObject production code path."""

    def test_food_with_plural_returns_tag(self):
        ing = MockIngredient(amount=Decimal(2), food=MockFood("apple", "apples"))
        obj = IngredientObject(ing)
        assert "<plural-name" in obj.food
        assert 'singular="apple"' in obj.food
        assert 'plural="apples"' in obj.food

    def test_food_without_plural_returns_static_text(self):
        ing = MockIngredient(amount=Decimal(2), food=MockFood("rice"))
        obj = IngredientObject(ing)
        assert obj.food == "rice"
        assert "<plural-name" not in obj.food

    def test_food_with_empty_plural_returns_static_text(self):
        ing = MockIngredient(amount=Decimal(2), food=MockFood("rice", ""))
        obj = IngredientObject(ing)
        assert obj.food == "rice"

    def test_no_food_returns_empty(self):
        ing = MockIngredient(amount=Decimal(1), food=None)
        obj = IngredientObject(ing)
        assert obj.food == ""

    def test_unit_resolved_via_resolve_unit_name(self):
        ing = MockIngredient(amount=Decimal(2), unit=MockUnit("slice", "slices"))
        obj = IngredientObject(ing)
        assert obj.unit == "slices"

    def test_unit_singular_amount_1(self):
        ing = MockIngredient(amount=Decimal(1), unit=MockUnit("slice", "slices"))
        obj = IngredientObject(ing)
        assert obj.unit == "slice"

    def test_no_amount_with_plural_food_returns_tag_with_no_amount(self):
        ing = MockIngredient(amount=Decimal(0), no_amount=True, food=MockFood("apple", "apples"))
        obj = IngredientObject(ing)
        assert "<plural-name" in obj.food
        assert ":no-amount='true'" in obj.food

    def test_note_preserved(self):
        ing = MockIngredient(amount=Decimal(1), food=MockFood("apple"), note="diced")
        obj = IngredientObject(ing)
        assert obj.note == "diced"

    def test_no_amount_without_plural_food_returns_static(self):
        ing = MockIngredient(amount=Decimal(0), no_amount=True, food=MockFood("rice"))
        obj = IngredientObject(ing)
        assert obj.food == "rice"
        assert "<plural-name" not in obj.food


def _dom(fragment):
    return BeautifulSoup(fragment, 'html.parser')


def _render(instruction, ingredients=()):
    step = MagicMock()
    step.instruction = instruction
    step.ingredients.all.return_value = list(ingredients)
    return render_instructions(step)


PLAIN_TEXT_FIELD_TAGS = {'a', 'abbr', 'acronym', 'b', 'blockquote', 'code', 'em', 'i', 'li', 'ol', 'strong', 'ul'}


def _assert_inert(fragment, forbidden_tags=('script', 'iframe', 'svg', 'object', 'embed', 'form', 'input', 'link', 'meta', 'base', 'style')):
    """No executable construct survives in a sanitized fragment, as a browser would parse it."""
    for el in _dom(fragment).find_all(True):
        assert el.name not in forbidden_tags, el.name
        for attr, value in el.attrs.items():
            value = ' '.join(value) if isinstance(value, list) else value
            assert not attr.lower().startswith('on'), f'{el.name}[{attr}]'
            assert attr.lower() != 'style'
            if attr in ('href', 'src'):
                assert not value.strip().lower().startswith(('javascript:', 'data:', 'vbscript:')), value


XSS_PAYLOADS = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<a href="javascript:alert(1)">x</a>',
    '<a href=" JaVaScRiPt:alert(1)">x</a>',
    '<a href="&#106;avascript:alert(1)">x</a>',
    '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
    '<img src="javascript:alert(1)">',
    '<svg onload=alert(1)>',
    '<iframe src="//evil.example"></iframe>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    '<div style="background:url(javascript:alert(1))">x</div>',
    '<body onload=alert(1)>',
    '<input autofocus onfocus=alert(1)>',
    '<form action="javascript:alert(1)"><input type=submit></form>',
    '<object data="//evil.example/x.swf"></object>',
    '<link rel=stylesheet href=//evil.example/x.css>',
    '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
    '<scr<script>ipt>alert(1)</scr</script>ipt>',
    '<<script>alert(1)//<</script>',
    '<!--><script>alert(1)</script>-->',
    '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
    '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">',
    '<math><mi//xlink:href="data:x,<script>alert(1)</script>">',
    '<b onmouseover=alert(1)>x</b>',
    '<p class="a" id="b" onclick="c">x</p>',
]


class TestIngredientObjectSanitizes:
    """unit/food/note are plain text; markup in them must never reach the page as markup."""

    @pytest.mark.parametrize('payload', XSS_PAYLOADS)
    def test_note_contains_no_markup(self, payload):
        obj = IngredientObject(MockIngredient(amount=Decimal(1), note=payload))
        _assert_inert(obj.note)
        assert {el.name for el in _dom(obj.note).find_all(True)} <= PLAIN_TEXT_FIELD_TAGS

    @pytest.mark.parametrize('payload', XSS_PAYLOADS)
    def test_unit_contains_no_markup(self, payload):
        obj = IngredientObject(MockIngredient(amount=Decimal(1), unit=MockUnit(payload)))
        _assert_inert(obj.unit)
        assert {el.name for el in _dom(obj.unit).find_all(True)} <= PLAIN_TEXT_FIELD_TAGS

    @pytest.mark.parametrize('payload', XSS_PAYLOADS)
    def test_food_contains_no_markup(self, payload):
        obj = IngredientObject(MockIngredient(amount=Decimal(1), food=MockFood(payload)))
        _assert_inert(obj.food)
        assert {el.name for el in _dom(obj.food).find_all(True)} <= PLAIN_TEXT_FIELD_TAGS

    def test_plain_text_note_unchanged(self):
        obj = IngredientObject(MockIngredient(amount=Decimal(1), note='finely chopped, room temp'))
        assert obj.note == 'finely chopped, room temp'

    def test_less_than_in_note_stays_text(self):
        obj = IngredientObject(MockIngredient(amount=Decimal(1), note='5 < 6 > 3'))
        assert _dom(obj.note).get_text() == '5 < 6 > 3'

    def test_allowed_inline_formatting_in_note_is_kept(self):
        obj = IngredientObject(MockIngredient(amount=Decimal(1), note='very <b>ripe</b>'))
        assert '<b>ripe</b>' in obj.note


class TestRenderInstructionsSanitizes:
    @pytest.mark.parametrize('payload', XSS_PAYLOADS)
    def test_payload_is_inert(self, payload):
        _assert_inert(_render(f'Step one. {payload} Step two.'))

    @pytest.mark.parametrize('payload', XSS_PAYLOADS)
    def test_payload_via_template_output_is_inert(self, payload):
        food = MockFood(payload)
        ing = MockIngredient(amount=Decimal(2), food=food, unit=MockUnit(payload), note=payload)
        _assert_inert(_render('Add {{ ingredients[0].food }} {{ ingredients[0].unit }} {{ ingredients[0].note }}', [ing]))

    def test_user_typed_scalable_number_with_handler_loses_handler(self):
        out = _render('<scalable-number v-bind:number="1" v-bind:factor="ingredient_factor" onclick="alert(1)"></scalable-number>')
        _assert_inert(out)

    def test_plain_markdown_formatting_survives(self):
        out = _dom(_render('# Title\n\nMix **well** and *rest*.\n\n- a\n- b'))
        assert out.find('h1').get_text() == 'Title'
        assert out.find('strong').get_text() == 'well'
        assert out.find('em').get_text() == 'rest'
        assert [li.get_text() for li in out.find_all('li')] == ['a', 'b']

    def test_safe_link_and_image_survive(self):
        out = _dom(_render('[docs](https://example.org/x?y=1) ![pic](/media/x.png "T")'))
        assert out.find('a')['href'] == 'https://example.org/x?y=1'
        assert out.find('img')['src'] == '/media/x.png'
        assert out.find('img')['title'] == 'T'

    def test_table_survives(self):
        out = _dom(_render('| a | b |\n|---|---|\n| 1 | 2 |'))
        assert [td.get_text() for td in out.find_all('td')] == ['1', '2']

    def test_braces_are_stripped_from_output(self):
        assert '{' not in _render('literal \\{ brace }') and '}' not in _render('literal \\{ brace }')


class TestRenderInstructionsCustomTags:
    def _ingredient(self):
        return MockIngredient(amount=Decimal('1.5'), unit=MockUnit('cup', 'cups'), food=MockFood('apple', 'apples'), note='fresh')

    def test_scale_helper_emits_scalable_number(self):
        el = _dom(_render('{{ scale(2) }}')).find('scalable-number')
        assert el is not None
        assert el['v-bind:number'] == '2.0'
        assert el['v-bind:factor'] == 'ingredient_factor'

    def test_ingredient_amount_emits_scalable_number(self):
        el = _dom(_render('{{ ingredients[0].amount }}', [self._ingredient()])).find('scalable-number')
        assert el['v-bind:number'] == '1.5'
        assert el['v-bind:factor'] == 'ingredient_factor'

    def test_plural_food_emits_plural_name_with_all_bindings(self):
        el = _dom(_render('{{ ingredients[0].food }}', [self._ingredient()])).find('plural-name')
        assert el['singular'] == 'apple'
        assert el['plural'] == 'apples'
        assert el['v-bind:amount'] == '1.5'
        assert el['v-bind:factor'] == 'ingredient_factor'
        assert el[':no-amount'] == 'false'

    def test_plural_name_with_markup_in_names_stays_inert(self):
        ing = MockIngredient(amount=Decimal(2), food=MockFood('<img src=x onerror=alert(1)>', '<b onclick=x>s'))
        out = _render('{{ ingredients[0].food }}', [ing])
        _assert_inert(out)
        assert _dom(out).find('plural-name') is not None

    def test_unit_and_note_render_as_text(self):
        out = _dom(_render('{{ ingredients[0].unit }} / {{ ingredients[0].note }}', [self._ingredient()])).get_text()
        assert 'cups' in out and 'fresh' in out

    @pytest.mark.parametrize('bad_factor', ['alert(1)', 'other', ''])
    def test_user_typed_scalable_number_with_foreign_factor_is_dropped(self, bad_factor):
        el = _dom(_render(f'<scalable-number v-bind:number="1" v-bind:factor="{bad_factor}"></scalable-number>')).find('scalable-number')
        assert el is None or el.get('v-bind:factor') in (None, 'ingredient_factor')
        assert el is None or 'alert' not in str(el)

    def test_user_typed_non_numeric_scalable_number_is_dropped(self):
        el = _dom(_render('<scalable-number v-bind:number="alert(1)"></scalable-number>')).find('scalable-number')
        assert el is None or el.get('v-bind:number') is None


class TestMarkdownFilterSanitizes:
    @pytest.mark.parametrize('payload', XSS_PAYLOADS)
    def test_payload_is_inert(self, payload):
        _assert_inert(markdown_filter(f'text {payload} more'))

    @pytest.mark.parametrize('css', [
        '<style>body{display:none}</style>',
        '<style>@import url(//evil.example/x.css);</style>',
        '<style type="text/css">a{background:url(//evil.example/x)}</style>',
        '<STYLE>p{color:red}</STYLE>',
    ])
    def test_style_element_is_removed_with_its_css(self, css):
        out = markdown_filter(f'before {css} after')
        assert not _dom(out).find('style')
        assert 'display:none' not in out and 'evil.example' not in out and 'color:red' not in out
        assert 'before' in out and 'after' in out

    def test_formatting_and_safe_link_survive(self):
        out = _dom(markdown_filter('a **bold** [link](https://example.org/)'))
        assert out.find('strong').get_text() == 'bold'
        assert out.find('a')['href'] == 'https://example.org/'

    def test_class_and_id_attributes_are_kept(self):
        el = _dom(markdown_filter('text <span class="c" id="i">x</span>')).find('span')
        assert el['class'] == ['c'] and el['id'] == 'i'
