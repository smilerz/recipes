<template>
    <v-autocomplete
        ref="field"
        :menu="menu"
        :menu-props="{maxWidth: menuMaxWidth}"
        :model-value="fieldValue"
        :search="visibleSearch"
        :items="displayedItems"
        :item-title="itemLabel"
        :item-value="itemValue"
        :return-object="props.object"
        :multiple="isMulti"
        :chips="isMulti"
        :closable-chips="isMulti && !props.disabled"
        :hide-selected="isMulti"
        :clear-on-select="isMulti"
        @pointerdown.capture="pickedSince = false"
        @keydown.capture="pickedSince = false"
        :id="props.id"
        :label="showFloatingLabel ? props.label : undefined"
        :placeholder="effectivePlaceholder"
        :aria-label="props.label || undefined"
        :variant="props.variant === 'outlined' ? 'outlined' : undefined"
        :density="props.inline ? 'compact' : (props.density || undefined)"
        :class="['model-select', {'model-select--inline': props.inline, 'model-select--tight': tight}]"
        :clearable="props.canClear"
        clear-icon="$close"
        persistent-clear
        :disabled="props.disabled"
        :hint="props.hint"
        :persistent-hint="!!props.hint"
        :hide-details="props.hideDetails"
        :loading="loading"
        no-filter
        @update:model-value="onSelect"
        @update:search="onSearch"
        @update:menu="onMenu"
    >
        <template v-if="$slots.prepend" #prepend>
            <slot name="prepend"></slot>
        </template>
        <template v-if="$slots.append" #append>
            <slot name="append"></slot>
        </template>

        <template v-if="isMulti" #chip="{item, props: chipProps}">
            <!-- an id that is still being looked up arrives as the bare id, not a record: show nothing for it (it stays in the value) -->
            <v-chip v-if="item !== null && typeof item === 'object'" v-bind="chipProps" color="primary" variant="flat" rounded="sm" close-icon="$close"></v-chip>
        </template>

        <template #item="{props: itemProps, item}">
            <v-list-item v-bind="itemProps" role="option" :aria-label="item.__create__ ? `${$t('Create')} ${item[itemLabel]}` : undefined">
                <template v-if="item.__create__" #append>
                    <v-chip size="x-small" variant="flat" color="create" class="ml-2">
                        <v-icon icon="$create"></v-icon>
                        <span class="d-none d-lg-inline ml-1">{{ $t('Create') }}</span>
                    </v-chip>
                </template>
            </v-list-item>
        </template>

        <template #no-data>
            <!-- the menu must stay enabled while loading (Vuetify closes a disabled one and never reopens it), so only the text changes -->
            <v-list-item :title="loading ? $t('Loading') : $t('No_Results')"></v-list-item>
        </template>

        <template v-if="hasMoreItems && !loading" #append-item>
            <v-list-item class="text-disabled font-italic text-caption" :title="$t('ModelSelectResultsHelp')"></v-list-item>
        </template>
    </v-autocomplete>
</template>

<script lang="ts" setup>
import {useTightFieldIcons} from "@/composables/useTightFieldIcons"
import {computed, onBeforeUnmount, onMounted, ref, shallowReactive, shallowRef, useTemplateRef, watch} from "vue"
import {useI18n} from "vue-i18n"
import {EditorSupportedModels, GenericModel, getGenericModelFromString} from "@/types/Models"
import {ErrorMessageType, PreparedMessage, useMessageStore} from "@/stores/MessageStore"

const CREATE_VALUE = '__create__'
const SEARCH_DEBOUNCE_MS = 300

const {t} = useI18n()

const emit = defineEmits(['create'])

const props = withDefaults(defineProps<{
    model: EditorSupportedModels
    id?: string
    // When provided, these static options replace the remote model fetch.
    items?: any[]
    limit?: number
    disabled?: boolean
    canClear?: boolean
    mode?: 'single' | 'tags'
    object?: boolean
    allowCreate?: boolean
    placeholder?: string
    label?: string
    hint?: string
    hideDetails?: boolean
    density?: '' | 'compact' | 'comfortable'
    searchOnLoad?: boolean
    inline?: boolean
    variant?: 'underline' | 'outlined'
    // choices to list first (e.g. the most used), alphabetically and above a divider, while nothing is typed
    pinnedItems?: any[]
}>(), {
    id: undefined,
    items: undefined,
    limit: 25,
    disabled: false,
    canClear: true,
    mode: 'single',
    object: true,
    allowCreate: false,
    placeholder: undefined,
    label: '',
    hint: '',
    hideDetails: false,
    density: '',
    searchOnLoad: false,
    inline: false,
    variant: 'underline',
    pinnedItems: undefined,
})

const model = defineModel<any>()

const modelClass = (getGenericModelFromString(props.model, t) || getGenericModelFromString('Food', t)) as GenericModel
const itemValue = computed(() => modelClass.model.itemValue ?? 'id')
const itemLabel = computed(() => modelClass.model.itemLabel ?? 'name')

const field = useTemplateRef<{ $el: HTMLElement }>('field')
const menu = ref(false)
const menuMaxWidth = ref<number | undefined>(undefined)
const search = ref('')
const loading = ref(false)
const hasMoreItems = ref(false)
const fetchedItems = shallowRef<any[]>([])
/** The last result for an empty search, so clearing the typed text never shows a blank list while the next fetch runs. */
const browseItems = shallowRef<any[] | null>(null)
/** In id mode, selected records that are not among the loaded options (e.g. beyond the first page), by id. */
const hydrated = shallowReactive(new Map<any, any>())

const showFloatingLabel = computed(() => !!props.label && !props.inline)

const effectivePlaceholder = computed(() => {
    if (props.placeholder) return props.placeholder
    if (showFloatingLabel.value) return undefined
    if (props.inline && props.label) return props.label
    return t(modelClass.model?.localizationKey ?? '')
})

const sourceItems = computed(() => props.items ?? fetchedItems.value)

const isMulti = computed(() => props.mode !== 'single')

/** Hosts often start from `''` or `{}` to mean "nothing picked". */
function isBlank(value: any): boolean {
    return value == null || value === '' || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)
}

/** What is selected, as a list: the array in tags mode, the single value (if any) otherwise. */
const selectedValues = computed<any[]>(() => {
    if (isMulti.value) return Array.isArray(model.value) ? model.value : []
    return isBlank(model.value) ? [] : [model.value]
})

const fieldValue = computed(() => {
    if (isMulti.value) return selectedValues.value
    return isBlank(model.value) ? null : model.value
})

/** Records of the selection that are known from outside the loaded options (looked up by id). */
const hydratedRecords = computed(() => selectedValues.value.map(value => hydrated.get(value)).filter(record => record != null))

/** Vuetify echoes the chosen label into the search box; that text is not something the user searched for. */
const selectedLabel = computed(() => {
    if (isMulti.value) return ''
    const value = model.value
    if (value == null || value === '') return ''
    if (props.object) return String(value[itemLabel.value] ?? '')
    const known = [...sourceItems.value, ...(props.pinnedItems ?? []), ...hydratedRecords.value]
    const found = known.find(item => item[itemValue.value] === value)
    return found ? String(found[itemLabel.value] ?? '') : ''
})

/** True while the selected text is too long to sit beside the icons: they are then shown only on hover or focus. */
const tight = useTightFieldIcons({get value() { return field.value?.$el }}, () => selectedLabel.value)

/** Vuetify echoes the selection into the text box: its label, or while that is still unknown the raw id. Never a user search. */
const searchIsEchoOfSelection = computed(() => {
    if (isMulti.value || search.value === '') return false
    if (selectedLabel.value !== '' && search.value === selectedLabel.value) return true
    return !props.object && model.value != null && search.value === String(model.value)
})

/** The text box content; a raw id echoed before the label is known is hidden rather than shown. */
const visibleSearch = computed(() => {
    const rawIdEcho = !isMulti.value && !props.object && model.value != null && search.value === String(model.value) && selectedLabel.value === ''
    return rawIdEcho ? '' : search.value
})

const typedQuery = computed(() => searchIsEchoOfSelection.value ? '' : search.value)

/**
 * In id mode Vuetify finds a label by looking the id up in the list, so the selection must be in it even when it is beyond
 * `limit` (static items) or beyond the loaded page (looked-up records). In tags mode the selected ones are hidden from the
 * dropdown anyway, so they are always kept; in single mode they are only added while browsing, never into search results.
 */
function withSelection(list: any[]): any[] {
    if (props.object) return list
    if (!isMulti.value && typedQuery.value !== '') return list
    const missing = selectedValues.value
        .filter(value => value != null && value !== '' && !list.some(item => item[itemValue.value] === value))
        .map(value => props.items?.find(item => item[itemValue.value] === value) ?? hydrated.get(value))
        .filter(record => record != null)
    return missing.length ? [...list, ...missing] : list
}

/** An endpoint that cannot search (non-paginated, e.g. User, or listIgnoresQuery, e.g. MealType) returns everything, so narrow it here. */
function narrowedByTypedText(list: any[]): any[] {
    if ((modelClass.model.isPaginated !== false && !modelClass.model.listIgnoresQuery) || typedQuery.value === '') return list
    const needle = typedQuery.value.toLowerCase()
    return list.filter(item => String(item[itemLabel.value] ?? '').toLowerCase().includes(needle))
}

const visibleItems = computed(() => {
    if (!props.items) {
        const base = typedQuery.value === '' && browseItems.value ? browseItems.value : fetchedItems.value
        return withSelection(narrowedByTypedText(base))
    }
    const needle = typedQuery.value.toLowerCase()
    return withSelection(props.items
        .filter(item => String(item[itemLabel.value] ?? '').toLowerCase().includes(needle))
        .slice(0, props.limit))
})

const createItem = computed(() => {
    const name = typedQuery.value.trim()
    if (!props.allowCreate || name === '') return null
    const exists = [...sourceItems.value, ...(props.pinnedItems ?? []), ...hydratedRecords.value].some(item => String(item[itemLabel.value] ?? '').trim().toLowerCase() === name.toLowerCase())
    if (exists) return null
    return {[itemValue.value]: CREATE_VALUE, [itemLabel.value]: name, __create__: true}
})

/** Pinned choices in alphabetical order, then a divider — only while browsing, never while the user is typing. */
const pinnedBlock = computed(() => {
    const pinned = props.pinnedItems ?? []
    if (pinned.length === 0 || typedQuery.value !== '') return []
    const alphabetical = [...pinned].sort((a, b) =>
        String(a[itemLabel.value] ?? '').localeCompare(String(b[itemLabel.value] ?? ''), undefined, {sensitivity: 'base'}))
    return [...alphabetical, {type: 'divider'}]
})

const listedAfterPinned = computed(() => {
    if (pinnedBlock.value.length === 0) return visibleItems.value
    const pinnedValues = new Set((props.pinnedItems ?? []).map(item => item[itemValue.value]))
    return visibleItems.value.filter(item => !pinnedValues.has(item[itemValue.value]))
})

const displayedItems = computed(() => createItem.value ? [createItem.value, ...visibleItems.value] : [...pinnedBlock.value, ...listedAfterPinned.value])

let latestRequest = 0

async function fetchItems(query: string) {
    const request = ++latestRequest
    loading.value = true
    try {
        const result = await modelClass.list({query: query, page: 1, pageSize: props.limit})
        if (request !== latestRequest) return
        fetchedItems.value = result.results
        if (query === '') browseItems.value = result.results
        hasMoreItems.value = !!result.next
    } catch (err: any) {
        if (request !== latestRequest) return
        fetchedItems.value = []
        hasMoreItems.value = false
        useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
    } finally {
        if (request === latestRequest) loading.value = false
    }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined

function fetchSoon(query: string) {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => void fetchItems(query), SEARCH_DEBOUNCE_MS)
}

onBeforeUnmount(() => clearTimeout(searchTimer))

function onSearch(value: string | null) {
    search.value = value ?? ''
    if (props.items || searchIsEchoOfSelection.value) return
    fetchSoon(search.value)
}

/** Set by a pick in tags mode; Vuetify reopens the menu by itself when the list refills, which the user did not ask for. */
let pickedSince = false

function onMenu(open: boolean) {
    if (open && pickedSince) return
    menu.value = open
    // Vuetify widens a menu to fit its longest item; the dropdown must stay as wide as the field (L9)
    if (open) menuMaxWidth.value = field.value?.$el.getBoundingClientRect().width
    // typing already schedules its own fetch, so only an untouched search box needs one on open
    if (!open || props.items || typedQuery.value !== '') return
    void fetchItems('')
}

function isCreate(value: any): boolean {
    return value === CREATE_VALUE || value?.__create__ === true
}

function uniqueByValue(values: any[]): any[] {
    const seen = new Set<any>()
    return values.filter(value => {
        const key = props.object ? value?.[itemValue.value] : value
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}

async function onSelect(value: any) {
    if (isMulti.value) {
        await onSelectMany(value)
        return
    }
    if (isCreate(value)) {
        const created = await createRecord(value)
        if (created !== undefined) model.value = props.object ? created : created[itemValue.value]
        return
    }
    model.value = value ?? null
}

async function onSelectMany(value: any) {
    const picked: any[] = Array.isArray(value) ? value : []
    const wantsCreate = picked.find(isCreate)
    let result = picked.filter(item => !isCreate(item))
    if (wantsCreate !== undefined) {
        const created = await createRecord(wantsCreate)
        if (created === undefined) return
        result = [...result, props.object ? created : created[itemValue.value]]
    }
    model.value = uniqueByValue(result)
    pickedSince = true
    menu.value = false
}

/** Creates the record behind a Create row; resolves to it, or to undefined (after reporting) if that failed. */
async function createRecord(value: any): Promise<any | undefined> {
    const name = props.object ? value[itemLabel.value] : (displayedItems.value.find(item => item[itemValue.value] === CREATE_VALUE)?.[itemLabel.value] ?? '')
    try {
        const created = await modelClass.create({name: name})
        useMessageStore().addPreparedMessage(PreparedMessage.CREATE_SUCCESS, created)
        emit('create', {[itemValue.value]: name, [itemLabel.value]: name})
        return created
    } catch (err: any) {
        useMessageStore().addError(ErrorMessageType.CREATE_ERROR, err)
        search.value = name
        return undefined
    }
}

const lookingUp = new Set<any>()
const unresolvable = new Set<any>()

async function lookUp(value: any) {
    lookingUp.add(value)
    try {
        const record = await modelClass.retrieve(Number(value))
        if (record) hydrated.set(value, record)
        else unresolvable.add(value)
    } catch (err: any) {
        // an id that cannot be resolved stays unlabelled; only a record that is gone for good (404) is not asked for again,
        // so a lookup that failed because the network was down is retried on the next change
        if (err?.response?.status === 404) unresolvable.add(value)
    } finally {
        lookingUp.delete(value)
    }
}

/**
 * Keeps hold of the record behind every selected id: copied from what is loaded right now (the list is replaced as soon as
 * the typed text is cleared, which would otherwise take the label with it), or looked up once when it is not loaded.
 */
function hydrateSelection() {
    if (props.object || props.items || modelClass.model.disableRetrieve) return
    const loaded = [...fetchedItems.value, ...(browseItems.value ?? []), ...(props.pinnedItems ?? [])]
    const toLookUp = new Set<any>()
    for (const value of selectedValues.value) {
        if (value == null || value === '' || hydrated.has(value)) continue
        const record = loaded.find(item => item[itemValue.value] === value)
        if (record) hydrated.set(value, record)
        else if (Number.isFinite(Number(value)) && !lookingUp.has(value) && !unresolvable.has(value)) toLookUp.add(value)
    }
    toLookUp.forEach(value => void lookUp(value))
}

// only ids can need a lookup; watching the ids (not the value) keeps a full record in `object` mode from being traversed
watch(() => props.object ? undefined : [...selectedValues.value], () => hydrateSelection())

// once the label is known, it replaces the raw id Vuetify echoed into the text box before that
watch(selectedLabel, label => {
    if (label !== '' && !props.object && model.value != null && search.value === String(model.value)) search.value = label
})

onMounted(async () => {
    if (props.searchOnLoad && !props.items) {
        await fetchItems('')
    }
    hydrateSelection()
})
</script>

<style scoped>
/* The clear ✕ and the caret are small, plain and light (on-surface at 40 %, the grey the old picker used) rather
   than Vuetify's 24 px near-black defaults. */
.model-select :deep(.v-field__clearable .v-icon),
.model-select :deep(.v-autocomplete__menu-icon) {
    font-size: 14px;
    opacity: 1;
    color: rgba(var(--v-theme-on-surface), 0.4);
}

/* a value too long to sit beside the icons gets the room they would take; they come back on hover or focus (tap on touch) */
.model-select--tight:not(:hover):not(:focus-within) :deep(.v-field__clearable),
.model-select--tight:not(:hover):not(:focus-within) :deep(.v-field__append-inner) {
    display: none;
}

/* inline: sits beside compact fields in a dense row, so the value text gets as much of the narrow column as it can.
   The spacing variables must be set on .v-field itself (Vuetify redefines them there, so a value on the root is ignored),
   and the clear/caret icons get a tighter box. */
.model-select--inline :deep(.v-field) {
    --v-field-padding-start: 8px;
    --v-field-padding-end: 4px;
}

.model-select--inline :deep(.v-field__clearable .v-icon),
.model-select--inline :deep(.v-autocomplete__menu-icon) {
    width: 1em;
}
</style>
