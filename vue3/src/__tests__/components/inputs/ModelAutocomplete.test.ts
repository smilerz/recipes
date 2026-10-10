/**
 * ModelAutocomplete (Phase 1: single mode) — the Vuetify `v-autocomplete` replacement for ModelSelect.
 *
 * Requirement IDs (L = layout, U = interaction, B = as-is behaviour) refer to
 * `.claude/data/MODEL_SELECT_AUTOCOMPLETE_REQUIREMENTS.md`. Tests assert on what is handed to the Vuetify field and
 * on what the component emits, never on library internals.
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {h} from 'vue'
import {flushPromises, mount} from '@vue/test-utils'
import {createVuetify} from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import {VAutocomplete} from 'vuetify/components'
import {createI18n} from 'vue-i18n'
import {ErrorMessageType, PreparedMessage} from '@/stores/MessageStore'

const modelState = vi.hoisted(() => ({isPaginated: true}))
const listSpy = vi.fn()
const createSpy = vi.fn()
const retrieveSpy = vi.fn()
const addError = vi.fn()
const addPreparedMessage = vi.fn()

// the real store calls useI18n() while it is created, which only works inside a component's setup
vi.mock('@/stores/MessageStore', async (importOriginal) => {
    const orig = await importOriginal<any>()
    return {...orig, useMessageStore: () => ({addError, addPreparedMessage})}
})

vi.mock('@/types/Models', async (importOriginal) => {
    const orig = await importOriginal<any>()
    return {
        ...orig,
        getGenericModelFromString: () => ({
            retrieve: retrieveSpy,
            list: listSpy,
            create: createSpy,
            model: {
                name: 'Food',
                localizationKey: 'Food',
                itemValue: 'id',
                itemLabel: 'name',
                isPaginated: modelState.isPaginated,
                disableRetrieve: false,
            },
        }),
    }
})

import ModelAutocomplete from '@/components/inputs/ModelAutocomplete.vue'

const FOODS = [
    {id: 1, name: 'Apple'},
    {id: 2, name: 'Banana'},
    {id: 3, name: 'apple pie'},
]

function envelope(results: any[], next: string | null = null) {
    return {count: results.length, results, next}
}

function mountAutocomplete(props: Record<string, any> = {}, extra: Record<string, any> = {}) {
    const vuetify = createVuetify({components, directives})
    const i18n = createI18n({
        legacy: false, locale: 'en',
        messages: {en: {Food: 'Food', Create: 'Create', No_Results: 'No results', Loading: 'Loading', ModelSelectResultsHelp: 'Search for more results'}},
        missingWarn: false, fallbackWarn: false,
    })
    const wrapper = mount(ModelAutocomplete, {
        props: {model: 'Food' as any, ...props},
        global: {plugins: [vuetify, i18n]},
        attachTo: document.body,
        ...extra,
    })
    return {wrapper}
}

const field = (wrapper: ReturnType<typeof mountAutocomplete>['wrapper']) => wrapper.findComponent(VAutocomplete)
const itemsOf = (wrapper: ReturnType<typeof mountAutocomplete>['wrapper']) => field(wrapper).props('items') as any[]

async function openMenu(wrapper: ReturnType<typeof mountAutocomplete>['wrapper']) {
    field(wrapper).vm.$emit('update:menu', true)
    await flushPromises()
}

async function typeSearch(wrapper: ReturnType<typeof mountAutocomplete>['wrapper'], text: string) {
    field(wrapper).vm.$emit('update:search', text)
    await flushPromises()
}

beforeEach(() => {
    modelState.isPaginated = true
    listSpy.mockReset()
    createSpy.mockReset()
    retrieveSpy.mockReset()
    addError.mockReset()
    addPreparedMessage.mockReset()
    listSpy.mockResolvedValue(envelope(FOODS))
})

afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
})

describe('ModelAutocomplete — the field (L1–L5, L16–L18, B14–B17)', () => {
    it('L1: renders a Vuetify v-autocomplete as its field', () => {
        const {wrapper} = mountAutocomplete()
        expect(field(wrapper).exists()).toBe(true)
    })

    it('L2/B14: a labelled field hands the label to Vuetify and adds no placeholder of its own', () => {
        const {wrapper} = mountAutocomplete({label: 'Food'})
        expect(field(wrapper).props('label')).toBe('Food')
        expect(field(wrapper).props('placeholder')).toBeFalsy()
    })

    it('B14: an unlabelled field falls back to the localized model name as its placeholder', () => {
        const {wrapper} = mountAutocomplete()
        expect(field(wrapper).props('label')).toBeFalsy()
        expect(field(wrapper).props('placeholder')).toBe('Food')
    })

    it('B14: an explicit placeholder always wins', () => {
        const {wrapper} = mountAutocomplete({placeholder: 'Pick one', label: 'Food'})
        expect(field(wrapper).props('placeholder')).toBe('Pick one')
    })

    it('L5: inline drops the floating label, uses it as the placeholder, and is compact', () => {
        const {wrapper} = mountAutocomplete({inline: true, label: 'Food', density: ''})
        expect(field(wrapper).props('label')).toBeFalsy()
        expect(field(wrapper).props('placeholder')).toBe('Food')
        expect(field(wrapper).props('density')).toBe('compact')
    })

    it('L5: inline keeps an explicit placeholder over the label', () => {
        const {wrapper} = mountAutocomplete({inline: true, label: 'Food', placeholder: 'Pick one'})
        expect(field(wrapper).props('placeholder')).toBe('Pick one')
    })

    it('L5: inline with no label falls back to the localized model name', () => {
        const {wrapper} = mountAutocomplete({inline: true})
        expect(field(wrapper).props('placeholder')).toBe('Food')
    })

    it('B15: the label is the accessible name, including when inline', () => {
        const {wrapper} = mountAutocomplete({inline: true, label: 'Food'})
        expect(wrapper.find('input').attributes('aria-label')).toBe('Food')
    })

    it('D2: the default variant inherits Vuetify\'s default; outlined is opt-in', () => {
        expect(field(mountAutocomplete().wrapper).props('variant')).toBe('filled')
        expect(field(mountAutocomplete({variant: 'outlined'}).wrapper).props('variant')).toBe('outlined')
    })

    it('L3: default density inherits Vuetify\'s default; compact and comfortable are forwarded', () => {
        expect(field(mountAutocomplete().wrapper).props('density')).toBe('default')
        expect(field(mountAutocomplete({density: 'compact'}).wrapper).props('density')).toBe('compact')
        expect(field(mountAutocomplete({density: 'comfortable'}).wrapper).props('density')).toBe('comfortable')
    })

    it('L16/B16: hint is persistent and hideDetails is forwarded', () => {
        const {wrapper} = mountAutocomplete({hint: 'Something helpful', hideDetails: true})
        expect(field(wrapper).props('hint')).toBe('Something helpful')
        expect(field(wrapper).props('persistentHint')).toBe(true)
        expect(field(wrapper).props('hideDetails')).toBe(true)
    })

    it('L18/B14: disabled is forwarded', () => {
        expect(field(mountAutocomplete({disabled: true}).wrapper).props('disabled')).toBe(true)
    })

    it('B9/U7: canClear (default true) makes the field clearable, and clearing does not open the menu', () => {
        expect(field(mountAutocomplete().wrapper).props('clearable')).toBe(true)
        expect(field(mountAutocomplete({canClear: false}).wrapper).props('clearable')).toBe(false)
        expect(field(mountAutocomplete().wrapper).props('openOnClear')).toBeFalsy()
    })

    it('L7: the clear ✕ is a plain cross, not Vuetify\'s filled-circle default', () => {
        expect(field(mountAutocomplete().wrapper).props('clearIcon')).toBe('$close')
    })

    it('L7: the clear ✕ stays visible whenever there is a value, so touch screens (no hover) can clear it', () => {
        expect(field(mountAutocomplete().wrapper).props('persistentClear')).toBe(true)
    })

    it('§5: extra attributes from the caller reach the field', () => {
        const {wrapper} = mountAutocomplete({}, {attrs: {class: 'my-class', 'data-test': 'food-select'}})
        expect(field(wrapper).classes()).toContain('my-class')
        expect(field(wrapper).attributes('data-test')).toBe('food-select')
    })

    it('B17/L17: prepend and append slots are rendered', () => {
        const {wrapper} = mountAutocomplete({}, {
            slots: {prepend: '<span data-test="before">B</span>', append: '<span data-test="after">A</span>'},
        })
        expect(wrapper.find('[data-test="before"]').exists()).toBe(true)
        expect(wrapper.find('[data-test="after"]').exists()).toBe(true)
    })
})

describe('ModelAutocomplete — the dropdown (L9)', () => {
    it('L9: the menu is never wider than the field, however long an item label is', async () => {
        const {wrapper} = mountAutocomplete()
        vi.spyOn(wrapper.element as HTMLElement, 'getBoundingClientRect').mockReturnValue({width: 420} as DOMRect)
        await openMenu(wrapper)
        expect((field(wrapper).props('menuProps') as any).maxWidth).toBe(420)
    })

    it('L9: follows the field if it is resized between two openings', async () => {
        const {wrapper} = mountAutocomplete()
        const rect = vi.spyOn(wrapper.element as HTMLElement, 'getBoundingClientRect')
        rect.mockReturnValue({width: 420} as DOMRect)
        await openMenu(wrapper)
        field(wrapper).vm.$emit('update:menu', false)
        rect.mockReturnValue({width: 300} as DOMRect)
        await openMenu(wrapper)
        expect((field(wrapper).props('menuProps') as any).maxWidth).toBe(300)
    })
})

describe('ModelAutocomplete — pinned items (most-used choices on top)', () => {
    const PINNED = [{id: 2, name: 'Banana'}]
    const shape = (wrapper: ReturnType<typeof mountAutocomplete>['wrapper']) => itemsOf(wrapper).map(i => i.type ?? i.name)

    it('browsing: the pinned items, then a divider, then the rest without duplicates', async () => {
        const {wrapper} = mountAutocomplete({pinnedItems: PINNED})
        await openMenu(wrapper)
        expect(shape(wrapper)).toEqual(['Banana', 'divider', 'Apple', 'apple pie'])
    })

    it('pinned items are listed alphabetically, ignoring case, whatever order they were given in', async () => {
        const unsorted = [{id: 5, name: 'gram'}, {id: 1, name: 'Cup'}, {id: 3, name: 'each'}, {id: 6, name: 'Fl oz'}]
        const {wrapper} = mountAutocomplete({pinnedItems: unsorted})
        await openMenu(wrapper)
        expect(shape(wrapper).slice(0, 5)).toEqual(['Cup', 'each', 'Fl oz', 'gram', 'divider'])
    })

    it('an empty pinned list adds no divider', async () => {
        const {wrapper} = mountAutocomplete({pinnedItems: []})
        await openMenu(wrapper)
        expect(shape(wrapper)).toEqual(['Apple', 'Banana', 'apple pie'])
    })

    it('typing hides the pinned block: only search results are listed', async () => {
        const {wrapper} = mountAutocomplete({pinnedItems: PINNED})
        await openMenu(wrapper)
        listSpy.mockResolvedValue(envelope([FOODS[0], FOODS[2]]))
        await wrapper.find('input:not([type=hidden])').trigger('focus')
        await typeSearch(wrapper, 'app')
        await new Promise(r => setTimeout(r, 350))
        await flushPromises()
        expect(shape(wrapper)).toEqual(['Apple', 'apple pie'])
    })

    it('a selected pinned item is listed once, in the pinned block', async () => {
        const {wrapper} = mountAutocomplete({pinnedItems: PINNED, modelValue: FOODS[1]})
        await openMenu(wrapper)
        expect(itemsOf(wrapper).filter(i => i.id === 2)).toHaveLength(1)
    })

    it('pinned items do not use up the limit of the ordinary list', () => {
        const many = Array.from({length: 30}, (_, i) => ({id: i + 10, name: `Item ${i + 10}`}))
        const {wrapper} = mountAutocomplete({items: many, limit: 25, pinnedItems: PINNED})
        const rows = itemsOf(wrapper).filter(i => !i.type)
        expect(rows).toHaveLength(26)
    })

    it('a pinned name counts as existing, so Create is never offered for it', async () => {
        listSpy.mockResolvedValue(envelope([]))
        const {wrapper} = mountAutocomplete({allowCreate: true, pinnedItems: PINNED})
        await wrapper.find('input:not([type=hidden])').trigger('focus')
        await typeSearch(wrapper, 'banana')
        await new Promise(r => setTimeout(r, 350))
        await flushPromises()
        expect(itemsOf(wrapper).some(i => i.__create__)).toBe(false)
    })

    it('without any pinned prop nothing changes', async () => {
        const {wrapper} = mountAutocomplete()
        await openMenu(wrapper)
        expect(shape(wrapper)).toEqual(['Apple', 'Banana', 'apple pie'])
    })
})

describe('ModelAutocomplete — static items (B2, U2)', () => {
    it('B2: never calls the model list, even when opened and searched', async () => {
        const {wrapper} = mountAutocomplete({items: FOODS})
        await openMenu(wrapper)
        await typeSearch(wrapper, 'ban')
        expect(listSpy).not.toHaveBeenCalled()
    })

    it('U2: filters client-side with a case-insensitive "contains" on the label', async () => {
        const {wrapper} = mountAutocomplete({items: FOODS})
        await typeSearch(wrapper, 'APPLE')
        expect(itemsOf(wrapper).map(i => i.name)).toEqual(['Apple', 'apple pie'])
    })

    it('B3: shows everything for an empty query, limited to `limit`', async () => {
        const {wrapper} = mountAutocomplete({items: FOODS, limit: 2})
        expect(itemsOf(wrapper).map(i => i.name)).toEqual(['Apple', 'Banana'])
    })

    const THIRTY = Array.from({length: 30}, (_, i) => ({id: i + 1, name: `Item ${i + 1}`}))

    it('R1: a selected id beyond `limit` is still in the list, so the field shows its label rather than the raw id', () => {
        const {wrapper} = mountAutocomplete({items: THIRTY, object: false, modelValue: 28, limit: 25})
        expect(itemsOf(wrapper).find(i => i.id === 28)?.name).toBe('Item 28')
    })

    it('R1: the first `limit` items are still shown in order, with the selected one added after them', () => {
        const {wrapper} = mountAutocomplete({items: THIRTY, object: false, modelValue: 28, limit: 25})
        const ids = itemsOf(wrapper).map(i => i.id)
        expect(ids.slice(0, 25)).toEqual(Array.from({length: 25}, (_, i) => i + 1))
        expect(ids).toHaveLength(26)
    })

    it('R1: a selected id already inside `limit` is not duplicated', () => {
        const {wrapper} = mountAutocomplete({items: THIRTY, object: false, modelValue: 3, limit: 25})
        expect(itemsOf(wrapper).filter(i => i.id === 3)).toHaveLength(1)
    })

    it('R1: while the user types, only matches are listed — the selection is not smuggled into the results', async () => {
        const {wrapper} = mountAutocomplete({items: THIRTY, object: false, modelValue: 28, limit: 25})
        await wrapper.find('input:not([type=hidden])').trigger('focus') // a user who is typing has the field focused
        await typeSearch(wrapper, 'Item 1')
        expect(itemsOf(wrapper).some(i => i.id === 28)).toBe(false)
    })

    it('U2: tells Vuetify not to filter, because the component already did', () => {
        expect(field(mountAutocomplete({items: FOODS}).wrapper).props('noFilter')).toBe(true)
    })
})

describe('ModelAutocomplete — remote source (B3–B6, U1, U2, U9, U10)', () => {
    it('U10: does not fetch on mount', async () => {
        mountAutocomplete()
        await flushPromises()
        expect(listSpy).not.toHaveBeenCalled()
    })

    it('B4: searchOnLoad fetches once on mount', async () => {
        const {wrapper} = mountAutocomplete({searchOnLoad: true})
        await flushPromises()
        expect(listSpy).toHaveBeenCalledTimes(1)
        expect(itemsOf(wrapper).map(i => i.name)).toEqual(['Apple', 'Banana', 'apple pie'])
    })

    it('U1/B3: opening fetches the first page for an empty query, sized by `limit`', async () => {
        const {wrapper} = mountAutocomplete({limit: 10})
        await openMenu(wrapper)
        expect(listSpy).toHaveBeenCalledTimes(1)
        expect(listSpy).toHaveBeenCalledWith({query: '', page: 1, pageSize: 10})
        expect(itemsOf(wrapper).map(i => i.name)).toEqual(['Apple', 'Banana', 'apple pie'])
    })

    it('U1: opens again → fetches again (B4: refreshed on every open)', async () => {
        const {wrapper} = mountAutocomplete()
        await openMenu(wrapper)
        field(wrapper).vm.$emit('update:menu', false)
        await openMenu(wrapper)
        expect(listSpy).toHaveBeenCalledTimes(2)
    })

    it('U2: leaves the server\'s answer unfiltered', () => {
        expect(field(mountAutocomplete().wrapper).props('noFilter')).toBe(true)
    })

    it('U2/B3: typing is debounced by 300 ms — three quick keystrokes send one request for the last text', async () => {
        vi.useFakeTimers()
        const {wrapper} = mountAutocomplete()
        field(wrapper).vm.$emit('update:search', 'a')
        await vi.advanceTimersByTimeAsync(100)
        field(wrapper).vm.$emit('update:search', 'ap')
        await vi.advanceTimersByTimeAsync(100)
        field(wrapper).vm.$emit('update:search', 'app')
        await vi.advanceTimersByTimeAsync(299)
        expect(listSpy).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(1)
        expect(listSpy).toHaveBeenCalledTimes(1)
        expect(listSpy).toHaveBeenCalledWith({query: 'app', page: 1, pageSize: 25})
    })

    it('U12: when responses arrive out of order the latest query wins', async () => {
        vi.useFakeTimers()
        let resolveSlow: (v: any) => void = () => {}
        listSpy.mockImplementationOnce(() => new Promise(r => { resolveSlow = r }))
        listSpy.mockImplementationOnce(() => Promise.resolve(envelope([{id: 9, name: 'Fast'}])))
        const {wrapper} = mountAutocomplete()
        field(wrapper).vm.$emit('update:search', 'slow')
        await vi.advanceTimersByTimeAsync(300)
        field(wrapper).vm.$emit('update:search', 'fast')
        await vi.advanceTimersByTimeAsync(300)
        resolveSlow(envelope([{id: 8, name: 'Slow'}]))
        await flushPromises()
        expect(itemsOf(wrapper).map(i => i.name)).toEqual(['Fast'])
    })

    it('L13: the old rows stay visible while the next request is in flight', async () => {
        const {wrapper} = mountAutocomplete()
        await openMenu(wrapper)
        listSpy.mockImplementationOnce(() => new Promise(() => {}))
        field(wrapper).vm.$emit('update:menu', false)
        await openMenu(wrapper)
        expect(field(wrapper).props('loading')).toBeTruthy()
        expect(itemsOf(wrapper).map(i => i.name)).toEqual(['Apple', 'Banana', 'apple pie'])
    })

    it('U9/B6: a failed fetch shows a FETCH_ERROR message, leaves no rows, and does not throw', async () => {
        listSpy.mockRejectedValue(new Error('network down'))
        const {wrapper} = mountAutocomplete()
        await openMenu(wrapper)
        expect(addError).toHaveBeenCalledWith(ErrorMessageType.FETCH_ERROR, expect.any(Error))
        expect(itemsOf(wrapper)).toEqual([])
        expect(field(wrapper).props('loading')).toBeFalsy()
    })

    it('L14: the menu is never disabled while loading, so it can stay open and show its empty state afterwards', async () => {
        listSpy.mockImplementationOnce(() => new Promise(() => {}))
        const {wrapper} = mountAutocomplete()
        await openMenu(wrapper)
        expect(field(wrapper).props('loading')).toBeTruthy()
        expect(field(wrapper).props('hideNoData')).toBeFalsy()
    })

    it('L14: while the first request is still running the empty row says "Loading", never "No results"', async () => {
        listSpy.mockImplementationOnce(() => new Promise(() => {}))
        const {wrapper} = mountAutocomplete()
        await openMenu(wrapper)
        expect(document.body.textContent).toContain('Loading')
        expect(document.body.textContent).not.toContain('No results')
    })

    it('L14: once loaded and empty, the empty row says "No results"', async () => {
        listSpy.mockResolvedValue(envelope([]))
        const {wrapper} = mountAutocomplete()
        await openMenu(wrapper)
        expect(document.body.textContent).toContain('No results')
    })

    it('L12/B5: the "more results" footer shows only when the server has more and nothing is loading', async () => {
        listSpy.mockResolvedValue(envelope(FOODS, 'http://next-page'))
        const {wrapper} = mountAutocomplete()
        await openMenu(wrapper)
        expect(document.body.textContent).toContain('Search for more results')
    })

    it('L12/B5: no footer when the server has no more rows', async () => {
        const {wrapper} = mountAutocomplete()
        await openMenu(wrapper)
        expect(document.body.textContent).not.toContain('Search for more results')
    })
})

describe('ModelAutocomplete — selecting and clearing (U3, U7, U8, B7)', () => {
    it('B7: with object=true (default) the field returns objects and emits the chosen object', async () => {
        const {wrapper} = mountAutocomplete()
        expect(field(wrapper).props('returnObject')).toBe(true)
        field(wrapper).vm.$emit('update:modelValue', FOODS[1])
        await flushPromises()
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([FOODS[1]])
    })

    it('B7: with object=false the field returns the item value (the id)', async () => {
        const {wrapper} = mountAutocomplete({object: false})
        expect(field(wrapper).props('returnObject')).toBe(false)
        field(wrapper).vm.$emit('update:modelValue', 2)
        await flushPromises()
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([2])
    })

    it('B1: the model\'s item value and label attributes drive the field', () => {
        const {wrapper} = mountAutocomplete()
        expect(field(wrapper).props('itemValue')).toBe('id')
        expect(field(wrapper).props('itemTitle')).toBe('name')
    })

    it('U3: after choosing a row the echoed label is not searched for — reopening fetches the full list', async () => {
        const {wrapper} = mountAutocomplete({modelValue: FOODS[1]})
        await openMenu(wrapper)
        listSpy.mockClear()
        field(wrapper).vm.$emit('update:menu', false)
        await typeSearch(wrapper, 'Banana')
        await new Promise(r => setTimeout(r, 350))
        expect(listSpy).not.toHaveBeenCalledWith(expect.objectContaining({query: 'Banana'}))
        await openMenu(wrapper)
        expect(listSpy).toHaveBeenLastCalledWith({query: '', page: 1, pageSize: 25})
    })

    it('U7: clearing emits null', async () => {
        const {wrapper} = mountAutocomplete({modelValue: FOODS[0]})
        field(wrapper).vm.$emit('update:modelValue', null)
        await flushPromises()
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null])
    })
})

describe('ModelAutocomplete — a remote picker holding an id (object=false) shows the label, not the id (R1)', () => {
    const remote = (props: Record<string, any> = {}) => mountAutocomplete({object: false, searchOnLoad: true, ...props})

    it('never searches for the raw id Vuetify echoes into the text box while the label is still unknown', async () => {
        vi.useFakeTimers()
        const {wrapper} = remote({modelValue: 2})
        listSpy.mockClear()
        field(wrapper).vm.$emit('update:search', '2') // Vuetify echoes the id as text before the options have loaded
        await vi.advanceTimersByTimeAsync(400)
        expect(listSpy).not.toHaveBeenCalledWith(expect.objectContaining({query: '2'}))
    })

    it('replaces that raw id in the text box with the label once it is known', async () => {
        const {wrapper} = remote({modelValue: 2})
        field(wrapper).vm.$emit('update:search', '2')
        await flushPromises()
        expect(field(wrapper).props('search')).toBe('Banana')
    })

    it('shows nothing, not the raw id, while the label is still being loaded', async () => {
        listSpy.mockImplementation(() => new Promise(() => {}))
        retrieveSpy.mockImplementation(() => new Promise(() => {}))
        const {wrapper} = remote({modelValue: 2})
        field(wrapper).vm.$emit('update:search', '2')
        await flushPromises()
        expect(field(wrapper).props('search')).toBe('')
    })

    it('does not look the record up when it is among the loaded options', async () => {
        const {wrapper} = remote({modelValue: 2})
        await flushPromises()
        expect(retrieveSpy).not.toHaveBeenCalled()
        expect(wrapper.exists()).toBe(true)
    })

    it('fetches the selected record when it is not among the loaded options, and shows its label', async () => {
        retrieveSpy.mockResolvedValue({id: 58, name: 'Far Away'})
        const {wrapper} = remote({modelValue: 58})
        field(wrapper).vm.$emit('update:search', '58')
        await flushPromises()
        expect(retrieveSpy).toHaveBeenCalledTimes(1)
        expect(retrieveSpy).toHaveBeenCalledWith(58)
        expect(field(wrapper).props('search')).toBe('Far Away')
        expect(itemsOf(wrapper).some(i => i.id === 58)).toBe(true)
    })

    it('looks the record up straight away when nothing is loaded on mount', async () => {
        retrieveSpy.mockResolvedValue({id: 58, name: 'Far Away'})
        const {wrapper} = mountAutocomplete({object: false, modelValue: 58})
        await flushPromises()
        expect(retrieveSpy).toHaveBeenCalledWith(58)
        expect(listSpy).not.toHaveBeenCalled()
        expect(itemsOf(wrapper).some(i => i.id === 58)).toBe(true)
    })

    it('never asks for a value that is not a number (no /NaN/ requests)', async () => {
        mountAutocomplete({object: false, modelValue: 'abc'})
        await flushPromises()
        expect(retrieveSpy).not.toHaveBeenCalled()
    })

    it('does not look anything up for an empty value, for objects, or for static items', async () => {
        mountAutocomplete({object: false, modelValue: null})
        mountAutocomplete({object: true, modelValue: {id: 58, name: 'Far Away'}})
        mountAutocomplete({object: false, modelValue: 58, items: FOODS})
        await flushPromises()
        expect(retrieveSpy).not.toHaveBeenCalled()
    })

    it('a failed lookup is silent and leaves the picker usable', async () => {
        retrieveSpy.mockRejectedValue(new Error('gone'))
        const {wrapper} = mountAutocomplete({object: false, modelValue: 58})
        await flushPromises()
        expect(addError).not.toHaveBeenCalled()
        expect(field(wrapper).exists()).toBe(true)
    })
})

describe('ModelAutocomplete — models whose endpoint cannot filter (non-paginated, e.g. User)', () => {
    async function typed(text: string) {
        modelState.isPaginated = false
        listSpy.mockResolvedValue(envelope(FOODS)) // the server ignores the query and returns everything
        const mounted = mountAutocomplete()
        await openMenu(mounted.wrapper)
        await mounted.wrapper.find('input:not([type=hidden])').trigger('focus')
        await typeSearch(mounted.wrapper, text)
        await new Promise(r => setTimeout(r, 350))
        await flushPromises()
        return mounted.wrapper
    }

    it('narrows the returned list by what was typed, ignoring case', async () => {
        const wrapper = await typed('BAN')
        expect(itemsOf(wrapper).map(i => i.name)).toEqual(['Banana'])
    })

    it('shows nothing when nothing matches', async () => {
        const wrapper = await typed('zzzzq')
        expect(itemsOf(wrapper)).toEqual([])
    })

    it('shows the whole list while nothing is typed', async () => {
        modelState.isPaginated = false
        const {wrapper} = mountAutocomplete()
        await openMenu(wrapper)
        expect(itemsOf(wrapper).map(i => i.name)).toEqual(['Apple', 'Banana', 'apple pie'])
    })

    it('leaves a paginated model to the server: whatever it returns is shown as it is', async () => {
        modelState.isPaginated = true
        listSpy.mockResolvedValue(envelope(FOODS))
        const {wrapper} = mountAutocomplete()
        await openMenu(wrapper)
        await wrapper.find('input:not([type=hidden])').trigger('focus')
        await typeSearch(wrapper, 'zzzzq')
        await new Promise(r => setTimeout(r, 350))
        await flushPromises()
        expect(itemsOf(wrapper).map(i => i.name)).toEqual(['Apple', 'Banana', 'apple pie'])
    })
})

describe('ModelAutocomplete — tags and multiple mode (Phase 2, T1–T11)', () => {
    const tags = (props: Record<string, any> = {}, extra: Record<string, any> = {}) => mountAutocomplete({mode: 'tags', ...props}, extra)
    const chipsIn = (wrapper: ReturnType<typeof mountAutocomplete>['wrapper']) => wrapper.findAll('.v-chip')
    const chipTexts = (wrapper: ReturnType<typeof mountAutocomplete>['wrapper']) => chipsIn(wrapper).map(c => c.text())

    describe('the field and its chips', () => {
        it('T2/T3: tags mode is a multiple, chip-showing field that hides what is already selected', () => {
            const {wrapper} = tags()
            expect(field(wrapper).props('multiple')).toBe(true)
            expect(field(wrapper).props('chips')).toBe(true)
            expect(field(wrapper).props('closableChips')).toBe(true)
            expect(field(wrapper).props('hideSelected')).toBe(true)
        })

        it('T3: picking clears the typed text (Vuetify keeps it unless told not to)', () => {
            expect(field(tags().wrapper).props('clearOnSelect')).toBe(true)
        })

        it('T11: single mode is still a plain single field', () => {
            const {wrapper} = mountAutocomplete()
            expect(field(wrapper).props('multiple')).toBe(false)
            expect(field(wrapper).props('chips')).toBe(false)
        })

        it('T2: each selected item is a small, closable, flat chip in the primary colour, showing its label', () => {
            const {wrapper} = tags({modelValue: [FOODS[0], FOODS[1]]})
            expect(chipTexts(wrapper)).toEqual(['Apple', 'Banana'])
            const chip = chipsIn(wrapper)[0]
            expect(chip.classes()).toEqual(expect.arrayContaining(['v-chip--size-small', 'v-chip--variant-flat', 'bg-primary']))
            expect(chip.find('.v-chip__close').exists()).toBe(true)
        })

        it('T2: a chip is removed with a plain ✕, never Vuetify\'s trash-can default (removing a tag does not delete the record)', () => {
            const {wrapper} = tags({modelValue: [FOODS[0]]})
            expect(wrapper.findComponent({name: 'VChip'}).props('closeIcon')).toBe('$close')
        })

        it('chips are squarish (a small corner radius), never Vuetify\'s fully rounded pill', () => {
            const {wrapper} = tags({modelValue: [FOODS[0]]})
            expect(wrapper.findComponent({name: 'VChip'}).classes()).toContain('rounded-sm')
        })

        it('T9: when disabled the chips cannot be removed', () => {
            const {wrapper} = tags({modelValue: [FOODS[0]], disabled: true})
            expect(field(wrapper).props('closableChips')).toBe(false)
        })

        it('T1: null or undefined counts as an empty selection', () => {
            expect(chipsIn(tags({modelValue: null}).wrapper)).toHaveLength(0)
            expect(chipsIn(tags().wrapper)).toHaveLength(0)
        })

        it('T2: ids are shown with the labels of the records they point to', async () => {
            const {wrapper} = tags({object: false, modelValue: [1, 2], items: FOODS})
            await flushPromises()
            expect(chipTexts(wrapper)).toEqual(['Apple', 'Banana'])
        })
    })

    describe('picking, removing, clearing', () => {
        it('T1/T3: picking emits the new array with the item appended', async () => {
            const {wrapper} = tags({modelValue: [FOODS[0]]})
            field(wrapper).vm.$emit('update:modelValue', [FOODS[0], FOODS[1]])
            await flushPromises()
            expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[FOODS[0], FOODS[1]]])
        })

        it('T1: ids are emitted as ids', async () => {
            const {wrapper} = tags({object: false, modelValue: [1], items: FOODS})
            field(wrapper).vm.$emit('update:modelValue', [1, 2])
            await flushPromises()
            expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[1, 2]])
        })

        it('T1: an item can never appear twice in the emitted array', async () => {
            const {wrapper} = tags({modelValue: [FOODS[0]]})
            field(wrapper).vm.$emit('update:modelValue', [FOODS[0], FOODS[1], {...FOODS[1]}])
            await flushPromises()
            expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[FOODS[0], FOODS[1]]])
        })

        it('T4: removing a chip emits the array without it', async () => {
            const {wrapper} = tags({modelValue: [FOODS[0], FOODS[1]]})
            field(wrapper).vm.$emit('update:modelValue', [FOODS[1]])
            await flushPromises()
            expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[FOODS[1]]])
        })

        it('T4: clearing the field emits an empty array, not null', async () => {
            const {wrapper} = tags({modelValue: [FOODS[0]]})
            field(wrapper).vm.$emit('update:modelValue', null)
            await flushPromises()
            expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[]])
        })

        it('T3: the menu stays closed when Vuetify tries to reopen it right after a pick, until the user interacts again', async () => {
            const {wrapper} = tags()
            await openMenu(wrapper)
            field(wrapper).vm.$emit('update:modelValue', [FOODS[0]])
            await flushPromises()
            await openMenu(wrapper) // Vuetify's own items watcher, not the user
            expect(field(wrapper).props('menu')).toBe(false)
            await wrapper.find('.model-autocomplete').trigger('pointerdown')
            await openMenu(wrapper)
            expect(field(wrapper).props('menu')).toBe(true)
        })

        it('T3: the menu closes after a pick', async () => {
            const {wrapper} = tags({modelValue: []})
            await wrapper.find('input:not([type=hidden])').trigger('focus')
            await openMenu(wrapper)
            expect(field(wrapper).props('menu')).toBe(true)
            field(wrapper).vm.$emit('update:modelValue', [FOODS[0]])
            await flushPromises()
            expect(field(wrapper).props('menu')).toBe(false)
        })
    })

    describe('the list never goes blank while the text is being cleared', () => {
        it('clearing the typed text shows the last browse list straight away, not the last (empty) search result', async () => {
            const {wrapper} = tags()
            await openMenu(wrapper)
            await wrapper.find('input:not([type=hidden])').trigger('focus')
            listSpy.mockResolvedValue(envelope([]))
            await typeSearch(wrapper, 'zzzz')
            await new Promise(r => setTimeout(r, 350))
            await flushPromises()
            expect(itemsOf(wrapper)).toEqual([])
            listSpy.mockImplementation(() => new Promise(() => {})) // the refetch for the cleared text is still running
            await typeSearch(wrapper, '')
            expect(itemsOf(wrapper).map(i => i.name)).toEqual(['Apple', 'Banana', 'apple pie'])
        })
    })

    describe('creating (T5)', () => {
        async function withQuery(query: string, props: Record<string, any> = {}) {
            const mounted = tags({allowCreate: true, ...props})
            await openMenu(mounted.wrapper)
            await mounted.wrapper.find('input:not([type=hidden])').trigger('focus')
            await typeSearch(mounted.wrapper, query)
            await new Promise(r => setTimeout(r, 350))
            await flushPromises()
            return mounted
        }

        it('offers a Create row for text that matches nothing', async () => {
            const {wrapper} = await withQuery('Cherry')
            expect(itemsOf(wrapper)[0].__create__).toBe(true)
        })

        it('appends the created record as a chip, reports success, and emits `create` with the raw query object', async () => {
            createSpy.mockResolvedValue({id: 77, name: 'Cherry'})
            const {wrapper} = await withQuery('Cherry', {modelValue: [FOODS[0]]})
            field(wrapper).vm.$emit('update:modelValue', [FOODS[0], itemsOf(wrapper)[0]])
            await flushPromises()
            expect(createSpy).toHaveBeenCalledWith({name: 'Cherry'})
            expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[FOODS[0], {id: 77, name: 'Cherry'}]])
            expect(wrapper.emitted('create')?.at(-1)).toEqual([{id: 'Cherry', name: 'Cherry'}])
            expect(addPreparedMessage).toHaveBeenCalledWith(PreparedMessage.CREATE_SUCCESS, {id: 77, name: 'Cherry'})
        })

        it('with ids, the created record\'s id is appended', async () => {
            createSpy.mockResolvedValue({id: 77, name: 'Cherry'})
            const {wrapper} = await withQuery('Cherry', {object: false, modelValue: [1]})
            field(wrapper).vm.$emit('update:modelValue', [1, (itemsOf(wrapper)[0] as any).id])
            await flushPromises()
            expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[1, 77]])
        })

        it('a failed create reports CREATE_ERROR and leaves the selection alone', async () => {
            createSpy.mockRejectedValue(new Error('nope'))
            const {wrapper} = await withQuery('Cherry', {modelValue: [FOODS[0]]})
            field(wrapper).vm.$emit('update:modelValue', [FOODS[0], itemsOf(wrapper)[0]])
            await flushPromises()
            expect(addError).toHaveBeenCalledWith(ErrorMessageType.CREATE_ERROR, expect.any(Error))
            expect(wrapper.emitted('update:modelValue')).toBeUndefined()
            expect(wrapper.emitted('create')).toBeUndefined()
        })
    })

    describe('ids that must be looked up (T6, T10)', () => {
        it('does not fetch anything on mount when every id is already known', async () => {
            tags({object: false, modelValue: [1, 2], items: FOODS})
            await flushPromises()
            expect(retrieveSpy).not.toHaveBeenCalled()
            expect(listSpy).not.toHaveBeenCalled()
        })

        it('fetches each unknown id once and shows its chip', async () => {
            retrieveSpy.mockImplementation((id: number) => Promise.resolve({id, name: `Record ${id}`}))
            const {wrapper} = tags({object: false, modelValue: [58, 59]})
            await flushPromises()
            expect(retrieveSpy).toHaveBeenCalledTimes(2)
            expect(retrieveSpy).toHaveBeenCalledWith(58)
            expect(retrieveSpy).toHaveBeenCalledWith(59)
            expect(chipTexts(wrapper)).toEqual(['Record 58', 'Record 59'])
        })

        it('looks a repeated id up only once, and never again after it is cached', async () => {
            retrieveSpy.mockImplementation((id: number) => Promise.resolve({id, name: `Record ${id}`}))
            const {wrapper} = tags({object: false, modelValue: [58, 58]})
            await flushPromises()
            await wrapper.setProps({modelValue: [58, 58, 59]})
            await flushPromises()
            expect(retrieveSpy.mock.calls.filter(c => c[0] === 58)).toHaveLength(1)
            expect(retrieveSpy.mock.calls.filter(c => c[0] === 59)).toHaveLength(1)
        })

        it('does not look up ids the loaded list already contains', async () => {
            const {wrapper} = tags({object: false, modelValue: [1], searchOnLoad: true})
            await flushPromises()
            expect(retrieveSpy).not.toHaveBeenCalled()
            expect(chipTexts(wrapper)).toEqual(['Apple'])
        })

        it('never asks for a value that is not a number', async () => {
            tags({object: false, modelValue: ['abc', null, '']})
            await flushPromises()
            expect(retrieveSpy).not.toHaveBeenCalled()
        })

        it('an id still being looked up shows no chip, not a raw number', async () => {
            retrieveSpy.mockImplementation(() => new Promise(() => {}))
            const {wrapper} = tags({object: false, modelValue: [58]})
            await flushPromises()
            expect(chipsIn(wrapper)).toHaveLength(0)
        })

        it('an id that cannot be resolved shows no chip, is silent, and is kept in the value when others change', async () => {
            retrieveSpy.mockRejectedValue(new Error('gone'))
            const {wrapper} = tags({object: false, modelValue: [58], items: undefined})
            await flushPromises()
            expect(chipsIn(wrapper)).toHaveLength(0)
            expect(addError).not.toHaveBeenCalled()
            field(wrapper).vm.$emit('update:modelValue', [58, 1])
            await flushPromises()
            expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[58, 1]])
        })

        it('objects are never looked up', async () => {
            tags({modelValue: [{id: 58, name: 'Far Away'}]})
            await flushPromises()
            expect(retrieveSpy).not.toHaveBeenCalled()
        })
    })

    describe('lists in tags mode (T7)', () => {
        it('a selected id beyond `limit` in static items still shows its chip', () => {
            const many = Array.from({length: 30}, (_, i) => ({id: i + 1, name: `Item ${i + 1}`}))
            const {wrapper} = tags({object: false, items: many, limit: 25, modelValue: [28]})
            expect(chipTexts(wrapper)).toEqual(['Item 28'])
        })

        it('a non-paginated model is narrowed in the browser by the typed text', async () => {
            modelState.isPaginated = false
            const {wrapper} = tags()
            await openMenu(wrapper)
            await wrapper.find('input:not([type=hidden])').trigger('focus')
            await typeSearch(wrapper, 'ban')
            await new Promise(r => setTimeout(r, 350))
            await flushPromises()
            expect(itemsOf(wrapper).map(i => i.name)).toEqual(['Banana'])
        })
    })
})

describe('ModelAutocomplete — creating (U6, B10–B12)', () => {
    async function withQuery(query: string, props: Record<string, any> = {allowCreate: true}) {
        const mounted = mountAutocomplete(props)
        await openMenu(mounted.wrapper)
        await typeSearch(mounted.wrapper, query)
        await new Promise(r => setTimeout(r, 350))
        await flushPromises()
        return mounted
    }

    it('B10: offers a Create row first when the typed text matches nothing', async () => {
        const {wrapper} = await withQuery('Cherry')
        const first = itemsOf(wrapper)[0]
        expect(first.name).toBe('Cherry')
        expect(first.__create__).toBe(true)
    })

    it('B10: does not offer Create when an item already has that label, ignoring case', async () => {
        const {wrapper} = await withQuery('apple')
        expect(itemsOf(wrapper).some(i => i.__create__)).toBe(false)
    })

    it('B10: does not offer Create without allowCreate', async () => {
        const {wrapper} = await withQuery('Cherry', {})
        expect(itemsOf(wrapper).some(i => i.__create__)).toBe(false)
    })

    it('B10: does not offer Create for empty or blank text', async () => {
        const {wrapper} = await withQuery('   ')
        expect(itemsOf(wrapper).some(i => i.__create__)).toBe(false)
    })

    it('B11: choosing Create calls the model create with the typed name, sets the created object, reports success, and emits `create` with the raw query object', async () => {
        createSpy.mockResolvedValue({id: 77, name: 'Cherry'})
        const {wrapper} = await withQuery('Cherry')
        field(wrapper).vm.$emit('update:modelValue', itemsOf(wrapper)[0])
        await flushPromises()
        expect(createSpy).toHaveBeenCalledWith({name: 'Cherry'})
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{id: 77, name: 'Cherry'}])
        expect(wrapper.emitted('create')?.at(-1)).toEqual([{id: 'Cherry', name: 'Cherry'}])
        expect(addPreparedMessage).toHaveBeenCalledWith(PreparedMessage.CREATE_SUCCESS, {id: 77, name: 'Cherry'})
    })

    it('B11 with object=false: the created record\'s id becomes the value', async () => {
        createSpy.mockResolvedValue({id: 77, name: 'Cherry'})
        const {wrapper} = await withQuery('Cherry', {allowCreate: true, object: false})
        field(wrapper).vm.$emit('update:modelValue', (itemsOf(wrapper)[0] as any).id)
        await flushPromises()
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([77])
    })

    it('B12: a failed create reports CREATE_ERROR, leaves the value alone, and keeps the typed text', async () => {
        createSpy.mockRejectedValue(new Error('nope'))
        const {wrapper} = await withQuery('Cherry')
        field(wrapper).vm.$emit('update:modelValue', itemsOf(wrapper)[0])
        await flushPromises()
        expect(addError).toHaveBeenCalledWith(ErrorMessageType.CREATE_ERROR, expect.any(Error))
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
        expect(wrapper.emitted('create')).toBeUndefined()
        expect(field(wrapper).props('search')).toBe('Cherry')
    })
})
