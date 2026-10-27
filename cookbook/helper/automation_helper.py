import regex

from django.core.cache import caches
from django.db.models.functions import Lower

from cookbook.models import Automation

REGEX_TIMEOUT = 0.05
_MISSING = object()  # no alias or rule found, as opposed to one whose target is empty


class AutomationEngine:
    request = None
    source = None
    use_cache = None
    food_aliases = None
    keyword_aliases = None
    unit_aliases = None
    never_unit = None
    transpose_words = None

    def __init__(self, request, use_cache=True, source=None):
        self.request = request
        self.use_cache = use_cache
        # the regex rules by automation type, loaded when they are first needed; per instance, so no request can see the rules of another
        self.regex_replace = {
            Automation.DESCRIPTION_REPLACE: None,
            Automation.INSTRUCTION_REPLACE: None,
            Automation.FOOD_REPLACE: None,
            Automation.UNIT_REPLACE: None,
            Automation.NAME_REPLACE: None,
        }
        self.failed_regex_rules = set()
        if not source:
            self.source = "default_string_to_avoid_false_regex_match"
        else:
            self.source = source

    def _cached(self, attribute, cache_name, load):
        """
        The rules a cached engine works with: read once per engine, from the cache shared with other requests (30 seconds) or else from the
        database. An empty result is a result too, and is kept.
        """
        rules = getattr(self, attribute)
        if rules is None:
            cache_key = f'{cache_name}_{self.request.space.pk}'
            rules = caches['default'].get(cache_key, None)
            if rules is None:
                rules = load()
                caches['default'].set(cache_key, rules, 30)
            else:
                caches['default'].touch(cache_key, 30)
            setattr(self, attribute, rules)
        return rules

    def _enabled_rules(self, rule_type):
        return Automation.objects.filter(space=self.request.space, disabled=False, type=rule_type).only('param_1', 'param_2').order_by('order')

    def _alias(self, alias_type, attribute, cache_name, text):
        """The target of the alias for the text, or _MISSING when there is none. The first of several aliases by order wins."""
        if self.use_cache:
            def load():
                aliases = {}
                for a in self._enabled_rules(alias_type):
                    if a.param_1 is not None:
                        aliases.setdefault(a.param_1.lower(), a.param_2)
                return aliases

            return self._cached(attribute, cache_name, load).get(text.lower(), _MISSING)
        automation = Automation.objects.filter(space=self.request.space, type=alias_type, param_1__iexact=text, disabled=False).order_by('order').first()
        return automation.param_2 if automation else _MISSING

    def apply_keyword_automation(self, keyword):
        keyword = keyword.strip()
        alias = self._alias(Automation.KEYWORD_ALIAS, 'keyword_aliases', 'automation_keyword_alias', keyword)
        return keyword if alias is _MISSING else alias

    def apply_unit_automation(self, unit):
        unit = unit.strip()
        alias = self._alias(Automation.UNIT_ALIAS, 'unit_aliases', 'automation_unit_alias', unit)
        return self.apply_regex_replace_automation(unit, Automation.UNIT_REPLACE) if alias is _MISSING else alias

    def apply_food_automation(self, food):
        food = food.strip()
        alias = self._alias(Automation.FOOD_ALIAS, 'food_aliases', 'automation_food_alias', food)
        return self.apply_regex_replace_automation(food, Automation.FOOD_REPLACE) if alias is _MISSING else alias

    def apply_never_unit_automation(self, tokens):
        """
        Moves a string that should never be treated as a unit to next token and optionally replaced with default unit
        e.g. NEVER_UNIT: param1: egg, param2: None would modify ['1', 'egg', 'white'] to ['1', '', 'egg', 'white']
        or NEVER_UNIT: param1: egg, param2: pcs would modify ['1', 'egg', 'yolk'] to ['1', 'pcs', 'egg', 'yolk']
        A unit that is an alias of the string counts as the string. If several rules match, the first by order is used.
        :param1 tokens: string that should never be considered a unit, will be moved to token[2]
        :param2 (optional) unit as string: will insert unit string into token[1]
        :return: unit as string (possibly changed by automation)
        """
        alt_unit = self.apply_unit_automation(tokens[1])
        candidates = {tokens[1].lower(), (alt_unit or '').lower()}
        if self.use_cache:
            def load():
                rules = {}
                for position, a in enumerate(self._enabled_rules(Automation.NEVER_UNIT)):
                    if a.param_1 is not None:
                        rules.setdefault(a.param_1.lower(), (position, a.param_2))
                return rules

            rules = self._cached('never_unit', 'automation_never_unit_rules', load)
            matches = [rules[c] for c in candidates if c in rules]
            new_unit = min(matches, key=lambda match: match[0])[1] if matches else _MISSING
        else:
            rule = Automation.objects.annotate(param_1_lower=Lower('param_1')).filter(
                space=self.request.space, type=Automation.NEVER_UNIT, param_1_lower__in=list(candidates), disabled=False).order_by('order').first()
            new_unit = rule.param_2 if rule else _MISSING

        if new_unit is _MISSING:
            return tokens, False
        tokens.insert(1, new_unit)
        return tokens, True

    def apply_transpose_automation(self, string):
        """
        If two words (param_1 & param_2) are detected in sequence, swap their position in the ingredient string
        :param 1: first word to detect
        :param 2: second word to detect
        return: new ingredient string
        """
        tokens = [x.lower() for x in string.replace(',', ' ').split()]
        if self.use_cache:
            def load():
                return [(a.param_1.lower(), a.param_2.lower()) for a in self._enabled_rules(Automation.TRANSPOSE_WORDS)[:512] if a.param_1 and a.param_2]

            rules = self._cached('transpose_words', 'automation_transpose_rules', load)
        else:
            rules = [(a.param_1.lower(), a.param_2.lower()) for a in self._enabled_rules(Automation.TRANSPOSE_WORDS)
                     .annotate(param_1_lower=Lower('param_1'), param_2_lower=Lower('param_2'))
                     .filter(param_1_lower__in=tokens, param_2_lower__in=tokens)[:512] if a.param_1 and a.param_2]

        for first, second in rules:
            if first in tokens and second in tokens:
                string = regex.sub(rf"\b({regex.escape(first)})\W*({regex.escape(second)})\b", r"\2 \1", string, flags=regex.IGNORECASE, timeout=REGEX_TIMEOUT)
        return string

    def apply_regex_replace_automation(self, string, automation_type):
        # TODO add warning - maybe on SPACE page? when a max of 512 automations of a specific type is exceeded (ALIAS types excluded?)
        """
        Replaces strings in a recipe field that are from a matched source
        field_type are Automation.type that apply regex replacements
        Automation.DESCRIPTION_REPLACE
        Automation.INSTRUCTION_REPLACE
        Automation.FOOD_REPLACE
        Automation.UNIT_REPLACE
        Automation.NAME_REPLACE

        regex replacment utilized the following fields from the Automation model
        :param 1: source that should apply the automation in regex format ('.*' for all), found anywhere in the address and not case sensitive
        :param 2: regex pattern to match ()
        :param 3: replacement string (leave blank to delete)
        return: new string
        """
        if self.use_cache:
            if self.regex_replace[automation_type] is None:
                # cached for this space and this type only: what is cached must be nothing but the rules the key says it holds
                cache_key = f'automation_regex_replace_{self.request.space.pk}_{automation_type}'
                rules = caches['default'].get(cache_key, None)
                if rules is None:
                    rules = self._load_regex_rules(automation_type)
                    caches['default'].set(cache_key, rules, 30)
                else:
                    caches['default'].touch(cache_key, 30)
                self.regex_replace[automation_type] = rules
            rules = self.regex_replace[automation_type]
        else:
            rules = self._load_regex_rules(automation_type)

        for rule in rules:
            source_pattern, pattern, replacement = rule
            if source_pattern is None or pattern is None or rule in self.failed_regex_rules:
                continue
            try:
                if regex.search(source_pattern, (self.source)[:512], flags=regex.IGNORECASE, timeout=REGEX_TIMEOUT):
                    string = regex.sub(pattern, replacement, string, flags=regex.IGNORECASE, timeout=REGEX_TIMEOUT)
            except (regex.error, IndexError, TimeoutError):
                # a rule that is not a usable pattern or takes too long must not stop the import or the rules after it, and is not tried again
                # for the other strings of this import
                self.failed_regex_rules.add(rule)
                print(f'automation: skipped the {automation_type} rule "{pattern}" for "{source_pattern}", it is not a usable pattern or took too long')
        return string

    def _load_regex_rules(self, automation_type):
        """the enabled rules of the space for an automation type, in their order, as (source pattern, pattern to replace, replacement)"""
        return [(a.param_1, a.param_2, a.param_3 or '') for a in Automation.objects.filter(space=self.request.space, disabled=False, type=automation_type).only(
            'param_1', 'param_2', 'param_3').order_by('order').all()[:512]]
