import pytest

from cookbook.helper.cooklang_parser import CooklangSyntaxError, Ingredient, Quantity, Recipe, Step, Timer


@pytest.mark.parametrize("raw,amount,unit", [
    ('2', 2.0, ''),
    ('1.5', 1.5, ''),
    ('1/2', 0.5, ''),
    ('1 1/2', 1.5, ''),
    ('2%tsp', 2.0, 'tsp'),
    ('1/4%cup', 0.25, 'cup'),
    ('', '', ''),
])
def test_quantity_parse(raw, amount, unit):
    assert Quantity.parse(raw) == Quantity(amount=amount, unit=unit)


@pytest.mark.parametrize("raw,quantity,unit", [
    ('boil{10%min}', 10.0, 'min'),
    ('rest{1/2%hour}', 0.5, 'hour'),
    ('rest{1 1/2%hour}', 1.5, 'hour'),
])
def test_timer_parse(raw, quantity, unit):
    timer = Timer.parse(raw)
    assert (timer.quantity, timer.unit) == (quantity, unit)


def test_ingredient_parse_reads_name_and_quantity():
    assert Ingredient.parse('salt{1%tsp}') == Ingredient(name='salt', quantity=Quantity(amount=1.0, unit='tsp'))


def test_step_parse_splits_text_ingredients_cookware_and_timers():
    step = Step.parse('Add @salt{1%tsp} to the #pot{} and cook ~{10%min}.')
    assert [block.type for block in step.blocks] == ['text', 'Ingredient', 'text', 'Cookware', 'text', 'Timer', 'text']


@pytest.mark.parametrize("parse,raw,message", [
    (Quantity.parse, 'abc', 'measurements must be in float or #/# format'),
    (Quantity.parse, '1/2/3', 'measurements must be in float or #/# format'),
    (Timer.parse, 'boil', 'timers must be in {num%unit} format'),
    (Timer.parse, 'boil{10}', 'timers must be in {num%unit} format'),
    (Timer.parse, 'boil{abc%min}', 'measurements must be in float or #/# format'),
    (Step.parse, '-- a comment @salt', 'inline comments must end with a new line'),
    (Step.parse, 'a } b', "stray '}'"),
    (Step.parse, 'a -] b', "stray '-]'"),
    (Step.parse, '[- never closed @salt', 'expected terminating delimiter'),
    (Step.parse, '[- never closed', 'block comments must end with'),
], ids=['quantity text', 'quantity fraction of three', 'timer without braces', 'timer without unit', 'timer text amount', 'inline comment',
        'stray brace', 'stray comment end', 'block comment next to a delimiter', 'block comment at the end'])
def test_malformed_cooklang_raises_a_syntax_error_that_says_what_is_wrong(parse, raw, message):
    with pytest.raises(CooklangSyntaxError, match=message.replace('{', r'\{').replace('}', r'\}').replace('[', r'\[').replace('+', r'\+')):
        parse(raw)


def test_syntax_error_is_a_value_error():
    # what already catches Exception, or ValueError, keeps working
    assert issubclass(CooklangSyntaxError, ValueError)


def test_recipe_parse_reports_the_syntax_error_of_a_step():
    with pytest.raises(CooklangSyntaxError):
        Recipe.parse('Add @salt{1%tsp} and a stray } here')
