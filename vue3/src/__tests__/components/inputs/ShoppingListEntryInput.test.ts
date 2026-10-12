import {describe, it, expect, vi, beforeEach} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {createPinia, setActivePinia, type PiniaPlugin} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import {createRouter, createMemoryHistory} from 'vue-router'

const {apiIngredientParserPostCreateMock, apiFoodListMock, createObjectMock} = vi.hoisted(() => ({
    apiIngredientParserPostCreateMock: vi.fn().mockResolvedValue({ingredient: null}),
    apiFoodListMock: vi.fn(),
    createObjectMock: vi.fn(),
}))
vi.mock('@/openapi', async (imp) => ({
    ...(await imp<any>()),
    ApiApi: class {
        apiIngredientParserPostCreate = apiIngredientParserPostCreateMock
        apiFoodList = apiFoodListMock
    },
}))
vi.mock('@/stores/ShoppingStore', () => ({
    useShoppingStore: () => ({shoppingLists: [], createObject: createObjectMock}),
}))
vi.mock('@vueuse/router', () => ({
    useRouteQuery: () => ({value: false}),
}))

import ShoppingListEntryInput from '@/components/inputs/ShoppingListEntryInput.vue'

function mountPlugins(autocomplete = false) {
    const prePopulate: PiniaPlugin = ({store}) => {
        if (store.$id === 'user_preference_store') {
            // false: manual free-text mode (v-text-field); true: autocomplete mode (v-combobox)
            store.deviceSettings = {shopping_input_autocomplete: autocomplete, shopping_selected_shopping_lists: []} as any
        }
    }
    const pinia = createPinia()
    pinia.use(prePopulate)
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components, directives})
    const router = createRouter({history: createMemoryHistory(), routes: []})
    return [pinia, i18n, vuetify, router]
}

function mountInput(autocomplete = false) {
    return mount(ShoppingListEntryInput, {
        global: {plugins: mountPlugins(autocomplete)},
    })
}

describe('ShoppingListEntryInput manual text input (#12)', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        apiIngredientParserPostCreateMock.mockClear()
    })

    // The text-field's Enter handler and its append button both called addIngredient() with
    // zero arguments (it requires amount/unit/food) instead of parseIngredient(), which reads
    // the typed text and parses it first - so submitting free text silently created a garbage
    // entry (NaN amount, no food/unit) instead of parsing what was typed.
    it('pressing Enter in the text field parses the typed text via the ingredient parser', async () => {
        const wrapper = mountInput()
        const field = wrapper.find('input')
        await field.setValue('2 cups flour')
        await field.trigger('keyup.enter')

        expect(apiIngredientParserPostCreateMock).toHaveBeenCalledWith({ingredientParserRequest: {ingredient: '2 cups flour'}})
    })

    it('clicking the append add button parses the typed text via the ingredient parser', async () => {
        const wrapper = mountInput()
        const field = wrapper.find('input')
        await field.setValue('3 eggs')
        await wrapper.find('button').trigger('click')

        expect(apiIngredientParserPostCreateMock).toHaveBeenCalledWith({ingredientParserRequest: {ingredient: '3 eggs'}})
    })
})

describe('ShoppingListEntryInput autocomplete mode', () => {
    const FLOUR = {id: 1, name: 'Flour'}

    function field(wrapper: ReturnType<typeof mountInput>) {
        return wrapper.findComponent({name: 'VAutocomplete'})
    }

    async function type(wrapper: ReturnType<typeof mountInput>, text: string) {
        const input = wrapper.find('input')
        await input.trigger('focus')
        await input.setValue(text)
        return input
    }

    beforeEach(() => {
        setActivePinia(createPinia())
        apiIngredientParserPostCreateMock.mockClear()
        apiFoodListMock.mockReset().mockResolvedValue({results: [FLOUR, {id: 2, name: 'Flax'}]})
        createObjectMock.mockReset().mockResolvedValue({})
    })

    it('renders a Vuetify autocomplete, not the vueform multiselect', () => {
        const wrapper = mountInput(true)
        expect(field(wrapper).exists()).toBe(true)
        expect(wrapper.find('.multiselect').exists()).toBe(false)
    })

    it('searches foods for the typed text after a short pause', async () => {
        const wrapper = mountInput(true)
        field(wrapper).vm.$emit('update:search', 'flo')
        await new Promise(r => setTimeout(r, 350))
        expect(apiFoodListMock).toHaveBeenCalledWith({query: 'flo', page: 1, pageSize: 25})
    })

    it('picking a food adds a shopping list entry for it straight away and clears the field', async () => {
        const wrapper = mountInput(true)
        await type(wrapper, 'flou')
        field(wrapper).vm.$emit('update:modelValue', FLOUR)
        await wrapper.vm.$nextTick()
        expect(createObjectMock).toHaveBeenCalledWith(expect.objectContaining({amount: 1, unit: null, food: FLOUR}), true)
        expect(apiIngredientParserPostCreateMock).not.toHaveBeenCalled()
        expect(field(wrapper).props('search')).toBe('')
    })

    it('the field stays empty after a pick and no further food search starts', async () => {
        const wrapper = mountInput(true)
        await type(wrapper, 'flou')
        apiFoodListMock.mockClear()
        field(wrapper).vm.$emit('update:modelValue', FLOUR)
        field(wrapper).vm.$emit('update:search', '') // what Vuetify does right after a selection while a selection slot is present
        await new Promise(r => setTimeout(r, 350))
        expect(field(wrapper).props('search')).toBe('')
        expect(apiFoodListMock).not.toHaveBeenCalled()
    })

    it('typing letter by letter submits nothing until Enter is pressed', async () => {
        const wrapper = mountInput(true)
        for (const text of ['f', 'fl', 'flo', 'flou']) {
            await type(wrapper, text)
        }
        await wrapper.vm.$nextTick()
        expect(apiIngredientParserPostCreateMock).not.toHaveBeenCalled()
        expect(createObjectMock).not.toHaveBeenCalled()
    })

    it('free text goes to the ingredient parser when Enter is pressed (it never creates a food)', async () => {
        const wrapper = mountInput(true)
        const input = await type(wrapper, '2 cups flour')
        await input.trigger('keydown', {key: 'Enter'})
        await wrapper.vm.$nextTick()
        expect(apiIngredientParserPostCreateMock).toHaveBeenCalledTimes(1)
        expect(apiIngredientParserPostCreateMock).toHaveBeenCalledWith({ingredientParserRequest: {ingredient: '2 cups flour'}})
        expect(createObjectMock).not.toHaveBeenCalled()
    })

    it('Enter on an empty field does nothing', async () => {
        const wrapper = mountInput(true)
        await wrapper.find('input').trigger('keydown', {key: 'Enter'})
        await wrapper.vm.$nextTick()
        expect(apiIngredientParserPostCreateMock).not.toHaveBeenCalled()
        expect(createObjectMock).not.toHaveBeenCalled()
    })

    // Real Vuetify, no simulated events: what the field does when a suggestion is actually clicked and when Enter is
    // actually pressed with suggestions showing.
    describe('with the real Vuetify field', () => {
        async function withSuggestions() {
            const wrapper = mount(ShoppingListEntryInput, {
                attachTo: document.body,
                global: {plugins: mountPlugins(true)},
            })
            const input = wrapper.find('input')
            await input.trigger('focus')
            await input.setValue('flo')
            await new Promise(r => setTimeout(r, 350))
            await flushPromises()
            return {wrapper, input}
        }

        it('clicking a suggestion adds that food once, leaves the field empty and searches nothing more', async () => {
            const {wrapper, input} = await withSuggestions()
            apiFoodListMock.mockClear()
            await wrapper.find('.v-field').trigger('click')
            await flushPromises()
            const row = [...document.body.querySelectorAll('.v-list-item')].find(r => r.textContent?.includes('Flour')) as HTMLElement
            expect(row).toBeTruthy()
            row.click()
            await new Promise(r => setTimeout(r, 350))
            await flushPromises()
            expect(createObjectMock).toHaveBeenCalledTimes(1)
            expect(createObjectMock).toHaveBeenCalledWith(expect.objectContaining({amount: 1, food: expect.objectContaining({id: 1})}), true)
            expect((input.element as HTMLInputElement).value).toBe('')
            expect(apiFoodListMock).not.toHaveBeenCalled()
            wrapper.unmount()
        })

        it('after Enter the old matches are dropped: nothing is searched or shown until the field is focused again', async () => {
            const {wrapper, input} = await withSuggestions()
            apiFoodListMock.mockClear()
            await input.trigger('keydown', {key: 'Enter'})
            await new Promise(r => setTimeout(r, 350))
            await flushPromises()
            expect(apiFoodListMock).not.toHaveBeenCalled()
            expect(document.body.querySelectorAll('.v-overlay--active .v-list-item')).toHaveLength(0)
            await input.trigger('focus')
            await flushPromises()
            expect(apiFoodListMock.mock.calls.map(c => c[0].query)).toEqual([''])
            wrapper.unmount()
        })

        it('clicking the field again after Enter, while it is still focused, loads the unfiltered list', async () => {
            const {wrapper, input} = await withSuggestions()
            ;(input.element as HTMLInputElement).focus() // really focused, so a click does not fire another focus event
            await input.trigger('keydown', {key: 'Enter'})
            await new Promise(r => setTimeout(r, 350))
            await flushPromises()
            apiFoodListMock.mockClear()
            await wrapper.find('.v-field').trigger('click')
            await flushPromises()
            expect(apiFoodListMock.mock.calls.map(c => c[0].query)).toEqual([''])
            wrapper.unmount()
        })

        it('a first click on the field (focus, then click) loads the unfiltered list once', async () => {
            const wrapper = mount(ShoppingListEntryInput, {attachTo: document.body, global: {plugins: mountPlugins(true)}})
            apiFoodListMock.mockClear()
            ;(wrapper.find('input').element as HTMLInputElement).focus()
            await wrapper.find('.v-field').trigger('click')
            await flushPromises()
            expect(apiFoodListMock.mock.calls.map(c => c[0].query)).toEqual([''])
            wrapper.unmount()
        })

        it('a search still in flight when Enter is pressed does not bring the old matches back', async () => {
            const {wrapper, input} = await withSuggestions()
            let finish: (value: any) => void = () => {}
            apiFoodListMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
            await input.setValue('flou')
            await new Promise(r => setTimeout(r, 350))
            await input.trigger('keydown', {key: 'Enter'})
            finish({results: [FLOUR]})
            await flushPromises()
            expect(document.body.querySelectorAll('.v-overlay--active .v-list-item')).toHaveLength(0)
            wrapper.unmount()
        })

        it('Enter with suggestions showing sends the typed text to the parser and picks no food', async () => {
            const {wrapper, input} = await withSuggestions()
            await input.trigger('keydown', {key: 'Enter'})
            await flushPromises()
            expect(apiIngredientParserPostCreateMock).toHaveBeenCalledTimes(1)
            expect(apiIngredientParserPostCreateMock).toHaveBeenCalledWith({ingredientParserRequest: {ingredient: 'flo'}})
            expect(createObjectMock).not.toHaveBeenCalled()
            wrapper.unmount()
        })
    })
})
