import {describe, it, expect, vi, beforeEach} from 'vitest'
import {mount} from '@vue/test-utils'
import {createPinia, setActivePinia, type PiniaPlugin} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import {createRouter, createMemoryHistory} from 'vue-router'

const {apiIngredientParserPostCreateMock} = vi.hoisted(() => ({
    apiIngredientParserPostCreateMock: vi.fn().mockResolvedValue({ingredient: null}),
}))
vi.mock('@/openapi', async (imp) => ({
    ...(await imp<any>()),
    ApiApi: class {
        apiIngredientParserPostCreate = apiIngredientParserPostCreateMock
    },
}))
vi.mock('@vueuse/router', () => ({
    useRouteQuery: () => ({value: false}),
}))

import ShoppingListEntryInput from '@/components/inputs/ShoppingListEntryInput.vue'

function mountInput() {
    const prePopulate: PiniaPlugin = ({store}) => {
        if (store.$id === 'user_preference_store') {
            // manual free-text mode: renders the v-text-field branch, not the Multiselect
            store.deviceSettings = {shopping_input_autocomplete: false} as any
        }
    }
    const pinia = createPinia()
    pinia.use(prePopulate)
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components, directives})
    const router = createRouter({history: createMemoryHistory(), routes: []})
    return mount(ShoppingListEntryInput, {
        global: {plugins: [pinia, i18n, vuetify, router]},
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
