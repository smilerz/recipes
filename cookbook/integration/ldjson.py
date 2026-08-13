"""Part 4 of the pantry-expiration-and-data-portability plan: JSON-LD bulk export.

A manual, one-way bulk export format mapping recipes to schema.org Recipe JSON-LD, for
external tools (structured-data validators, other recipe apps that read schema.org). NOT
automatic SEO/page markup (no live-page insertion point exists for that, and it's a
separate, out-of-scope feature), and NOT usable to restore or migrate Tandoor data — see
Part 3's Backup feature for that. source_url is deliberately never mapped (it points
elsewhere, not this exported file); no aggregateRating (only meaningful for the live-page
SEO use case this explicitly isn't).
"""
import json

from django.utils.translation import gettext_lazy as _

from cookbook.helper.image_processing import get_primary_recipe_image
from cookbook.integration.integration import Integration

SCHEMA_CONTEXT = 'https://schema.org'


def format_iso8601_duration(minutes):
    """Minutes (int, possibly 0 or None) -> ISO 8601 duration, e.g. 90 -> 'PT1H30M',
    30 -> 'PT30M', 60 -> 'PT1H'. 0/None -> None (no duration to report), never 'PT0H0M0S'."""
    if not minutes:
        return None
    hours, mins = divmod(int(minutes), 60)
    duration = 'PT'
    if hours:
        duration += f'{hours}H'
    if mins or not hours:
        duration += f'{mins}M'
    return duration


def _format_decimal(value):
    """Strip trailing zeros for display — Ingredient.amount/NutritionInformation fields
    are DecimalField(decimal_places=16), so a plain str() would show 16 zeros."""
    if value == value.to_integral_value():
        return str(int(value))
    return str(value.normalize())


def flatten_ingredient(ingredient):
    """amount + unit + food -> a single display string, e.g. '2 cup flour (softened)'."""
    parts = []
    if not ingredient.no_amount and ingredient.amount:
        parts.append(_format_decimal(ingredient.amount))
    if ingredient.unit:
        parts.append(ingredient.unit.name)
    if ingredient.food:
        parts.append(ingredient.food.name)
    text = ' '.join(parts)
    if ingredient.note:
        text += f' ({ingredient.note})'
    return text


def recipe_to_jsonld(recipe, request):
    data = {
        '@context': SCHEMA_CONTEXT,
        '@type': 'Recipe',
        'name': recipe.name,
    }
    if recipe.description:
        data['description'] = recipe.description

    image = get_primary_recipe_image(recipe)
    if image:
        data['image'] = request.build_absolute_uri(image.file.url)

    ingredients = []
    instructions = []
    for step in recipe.steps.all():
        for ingredient in step.ingredients.all():
            ingredients.append(flatten_ingredient(ingredient))
        if step.instruction:
            howto_step = {'@type': 'HowToStep', 'text': step.instruction}
            if step.name:
                howto_step['name'] = step.name
            instructions.append(howto_step)
    if ingredients:
        data['recipeIngredient'] = ingredients
    if instructions:
        data['recipeInstructions'] = instructions

    prep_time = format_iso8601_duration(recipe.working_time)
    if prep_time:
        data['prepTime'] = prep_time
    cook_time = format_iso8601_duration(recipe.waiting_time)
    if cook_time:
        data['cookTime'] = cook_time
    total_time = format_iso8601_duration((recipe.working_time or 0) + (recipe.waiting_time or 0))
    if total_time:
        data['totalTime'] = total_time

    if recipe.servings_text:
        data['recipeYield'] = recipe.servings_text
    elif recipe.servings:
        data['recipeYield'] = str(recipe.servings)

    if recipe.nutrition:
        data['nutrition'] = {
            '@type': 'NutritionInformation',
            'calories': f'{_format_decimal(recipe.nutrition.calories)} cal',
            'fatContent': f'{_format_decimal(recipe.nutrition.fats)} g',
            'carbohydrateContent': f'{_format_decimal(recipe.nutrition.carbohydrates)} g',
            'proteinContent': f'{_format_decimal(recipe.nutrition.proteins)} g',
        }

    keywords = list(recipe.keywords.values_list('name', flat=True))
    if keywords:
        data['keywords'] = ', '.join(keywords)
        data['recipeCategory'] = keywords

    return data


class LdJson(Integration):

    def get_files_from_recipes(self, recipes, el, cookies):
        files = []
        for recipe in recipes:
            data = recipe_to_jsonld(recipe, self.request)
            files.append([f'{recipe.pk}.jsonld', json.dumps(data, indent=2)])
            el.exported_recipes += 1
            el.msg += self.get_recipe_processed_msg(recipe)
            el.save()
        return files

    def do_import(self, *args, **kwargs):
        raise NotImplementedError(_(
            'JSON-LD is an export-only format for external tools and cannot be used to import recipes.'
        ))
