/**
 * Moving a food to other shopping lists from the item dialog replaced the lists of its entries with one request
 * each, behind the store's back: nothing was added to the undo history, so Undo could not take it back. It now goes
 * through the store, like the batch actions.
 */
import {describe, it, expect, vi, beforeEach} from 'vitest'
import {flushPromises, mount} from '@vue/test-utils'
import {createPinia, setActivePinia, type PiniaPlugin} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'
import {ref} from 'vue'
import {apiMock, resetApiMock} from '@/__tests__/api-mock'
import {makeShoppingListEntry, makeUserPreference} from '@/__tests__/factories'

vi.mock('@vueuse/core', async (imp) => ({...(await imp<any>()), useStorage: (_k: string, d: any) => ref(d)}))
vi.mock('@vueuse/router', () => ({useRouteQuery: (_k: string, d: any) => ref(d)}))
vi.mock('vue-router', () => ({useRouter: () => ({push: vi.fn().mockResolvedValue(undefined)})}))
vi.mock('@/openapi', async (imp) => ({...(await imp<any>()), ApiApi: class { constructor() { return apiMock } }}))
vi.mock('vue-i18n', async (importOriginal) => ({
    ...(await importOriginal<typeof import('vue-i18n')>()),
    useI18n: () => ({t: (key: string) => key}),
}))

import ShoppingLineItemDialog from '@/components/dialogs/ShoppingLineItemDialog.vue'
import ModelSelect from '@/components/inputs/ModelSelect.vue'
import {useShoppingStore} from '@/stores/ShoppingStore'

function mountDialog(entries: any[]) {
    const prePopulate: PiniaPlugin = ({store}) => {
        if (store.$id === 'user_preference_store') {
            store.userSettings = makeUserPreference() as any
            store.userSettings.shoppingUpdateFoodLists = false
            store.activeSpace = {id: 1} as any
        }
    }
    const pinia = createPinia()
    pinia.use(prePopulate)
    setActivePinia(pinia)
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})
    return mount(ShoppingLineItemDialog, {
        attachTo: document.body,
        props: {
            modelValue: true,
            shoppingListFood: {food: {id: 1, name: 'saffron bitters'}, entries: new Map(entries.map(e => [e.id, e]))} as any,
        },
        global: {
            plugins: [pinia, i18n, vuetify],
            stubs: {
                ModelSelect: {props: ['model'], template: '<div class="stub-model-select"/>'},
                ModelEditDialog: {template: '<div/>'},
                ShoppingListsBar: {template: '<div/>'},
            },
        },
    })
}

describe('ShoppingLineItemDialog', () => {
    beforeEach(() => {
        resetApiMock()
    })

    it('setting a category from the dialog is in the undo history', async () => {
        const w = mountDialog([makeShoppingListEntry({id: 7})])
        const spy = vi.spyOn(useShoppingStore(), 'updateCategories').mockImplementation(() => {})

        const category = w.findAllComponents(ModelSelect).find(c => c.props('model') === 'SupermarketCategory')!
        category.vm.$emit('update:modelValue', {id: 3, name: 'Canned beans'})
        await flushPromises()

        expect(spy).toHaveBeenCalledWith([expect.objectContaining({food: expect.objectContaining({id: 1})})], {id: 3, name: 'Canned beans'}, true)
        w.unmount()
    })

    it('moving the food to other lists goes through the store, with undo, for every entry of the food', async () => {
        const a = makeShoppingListEntry({id: 7, shoppingLists: []})
        const b = makeShoppingListEntry({id: 8, shoppingLists: []})
        const w = mountDialog([a, b])
        const spy = vi.spyOn(useShoppingStore(), 'updateEntryShoppingLists').mockResolvedValue(undefined as any)

        const lists = w.findAllComponents(ModelSelect).find(c => c.props('model') === 'ShoppingList')!
        lists.vm.$emit('update:modelValue', [{id: 6, name: 'Party'}])
        await flushPromises()

        expect(spy).toHaveBeenCalledWith([a, b], [{id: 6, name: 'Party'}], true)
        w.unmount()
    })
})
