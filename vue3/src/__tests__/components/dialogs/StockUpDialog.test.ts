/**
 * StockUpDialog seeding contract (D3, DEC-1).
 *
 * The dialog must seed rows from the checked shopping entries' OWN amount
 * and unit — the "gram default" defect came from discarding them and
 * falling back to the user's default unit. Pack fallback and aggregation
 * cases live in pantry_utils.test.ts; these tests cover the dialog wiring:
 * entry -> row -> stock-up payload, one row per (food, unit).
 */
import {describe, it, expect, vi, beforeEach} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {createPinia, setActivePinia, type PiniaPlugin} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'

import {apiMock, resetApiMock} from '@/__tests__/api-mock'
import {makeUserPreference} from '@/__tests__/factories'

vi.mock('@/openapi', async (imp) => ({...(await imp<any>()), ApiApi: class { constructor() { return apiMock } }}))
vi.mock('@vueuse/core', async (imp) => ({...(await imp<any>()), useStorage: (_key: string, defaultValue: any) => ({value: defaultValue})}))
vi.mock('@vueuse/router', () => ({useRouteQuery: () => ({value: false})}))

const {addMessageMock, addErrorMock} = vi.hoisted(() => ({addMessageMock: vi.fn(), addErrorMock: vi.fn()}))
vi.mock('@/stores/MessageStore', async (imp) => ({...(await imp<any>()), useMessageStore: () => ({addMessage: addMessageMock, addError: addErrorMock})}))

import StockUpDialog from '@/components/dialogs/StockUpDialog.vue'

const L = {id: 5, name: 'l'}
const CUP = {id: 6, name: 'cup'}

function mountDialog(userPreferenceOverrides: Record<string, any> = {}) {
    const prePopulate: PiniaPlugin = ({store}) => {
        if (store.$id === 'user_preference_store') {
            store.userSettings = makeUserPreference(userPreferenceOverrides) as any
        }
    }
    const pinia = createPinia()
    pinia.use(prePopulate)
    setActivePinia(pinia)

    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})
    return mount(StockUpDialog, {
        attachTo: document.body,
        global: {
            plugins: [pinia, i18n, vuetify],
            stubs: {
                // Declare props + emit so the freezer test can drive the location select's
                // update:modelValue (the Unit and Location selects are both ModelSelect now,
                // distinguished by their `model` prop).
                ModelSelect: {
                    props: ['modelValue', 'model', 'items'],
                    emits: ['update:modelValue'],
                    template: '<div class="model-select-stub" :data-model="model" />',
                },
                VClosableCardTitle: {template: '<div class="title-stub" />'},
                // pulls in UserPreferenceStore/useStorage (no jsdom backing); not under test
                ClosableHelpAlert: {template: '<div class="help-alert-stub" />'},
            },
        },
    })
}

function clickConfirm() {
    const btn = [...document.querySelectorAll('.v-btn')]
        .find(b => b.textContent?.includes('StockUp') || b.textContent?.includes('Stock up')) as HTMLElement | undefined
    btn?.click()
}

describe('StockUpDialog seeding (D3)', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        resetApiMock()
        apiMock.apiInventoryLocationList.mockResolvedValue({results: []})
        addMessageMock.mockClear()
        addErrorMock.mockClear()
        document.body.innerHTML = ''
    })

    it("SU-01: seeds and posts the entry's own amount and unit — never a default unit", async () => {
        apiMock.apiShoppingListEntryList.mockResolvedValue({results: [
            {food: {id: 1, name: 'Milk'}, amount: 2, unit: L, checked: true},
        ]})
        apiMock.apiInventoryEntryStockUpCreate.mockResolvedValue({created: 1})

        const wrapper = mountDialog()
        void (wrapper.vm as any).open()
        await flushPromises()

        // seeded straight from the nested food — no per-food refetch (perf: no N+1)
        expect(apiMock.apiFoodRetrieve).not.toHaveBeenCalled()

        clickConfirm()
        await flushPromises()

        expect(apiMock.apiInventoryEntryStockUpCreate).toHaveBeenCalledTimes(1)
        const {items} = apiMock.apiInventoryEntryStockUpCreate.mock.calls[0][0].stockUp
        expect(items).toEqual([expect.objectContaining({food: 1, amount: 2, unit: 5})])
    })

    it('SU-02: renders one row per (food, unit) for mixed-unit entries and posts both', async () => {
        apiMock.apiShoppingListEntryList.mockResolvedValue({results: [
            {food: {id: 1, name: 'Milk'}, amount: 1, unit: L, checked: true},
            {food: {id: 1, name: 'Milk'}, amount: 2, unit: CUP, checked: true},
        ]})
        apiMock.apiInventoryEntryStockUpCreate.mockResolvedValue({created: 2})

        const wrapper = mountDialog()
        void (wrapper.vm as any).open()
        await flushPromises()

        expect(document.querySelectorAll('.v-checkbox').length).toBe(2)

        clickConfirm()
        await flushPromises()

        const {items} = apiMock.apiInventoryEntryStockUpCreate.mock.calls[0][0].stockUp
        expect(items).toEqual([
            expect.objectContaining({food: 1, amount: 1, unit: 5}),
            expect.objectContaining({food: 1, amount: 2, unit: 6}),
        ])
    })

    it('SU-03: information-free entry posts the pack; no pack means amount 1 with null unit', async () => {
        apiMock.apiShoppingListEntryList.mockResolvedValue({results: [
            {food: {id: 2, name: 'Potatoes', shoppingAmount: 5, preferredShoppingUnit: {id: 7, name: 'bag'}}, amount: 0, unit: null, checked: true},
            {food: {id: 3, name: 'Basil'}, amount: 0, unit: null, checked: true},
        ]})
        apiMock.apiInventoryEntryStockUpCreate.mockResolvedValue({created: 2})

        const wrapper = mountDialog()
        void (wrapper.vm as any).open()
        await flushPromises()

        clickConfirm()
        await flushPromises()

        const {items} = apiMock.apiInventoryEntryStockUpCreate.mock.calls[0][0].stockUp
        // rows sort alphabetically by food within a shop day, so Basil precedes Potatoes
        expect(items).toEqual([
            expect.objectContaining({food: 3, amount: 1, unit: null}),
            expect.objectContaining({food: 2, amount: 5, unit: 7}),
        ])
    })

    it('SU-05: fetch is bounded by shoppingRecentDays, not unbounded history', async () => {
        apiMock.apiShoppingListEntryList.mockResolvedValue({results: []})

        const wrapper = mountDialog({shoppingRecentDays: 30})
        void (wrapper.vm as any).open()
        await flushPromises()

        expect(apiMock.apiShoppingListEntryList).toHaveBeenCalledTimes(1)
        const call = apiMock.apiShoppingListEntryList.mock.calls[0][0]
        expect(call.checked).toBe(true)
        expect(call.updatedAfter).toBeInstanceOf(Date)
        const daysAgo = (Date.now() - call.updatedAfter.getTime()) / (1000 * 60 * 60 * 24)
        expect(daysAgo).toBeGreaterThan(29)
        expect(daysAgo).toBeLessThan(31)
    })

    it('SU-04: switching a row to a freezer location clears the auto shelf-life expiry (DEC-4 B)', async () => {
        apiMock.apiInventoryLocationList.mockResolvedValue({results: [
            {id: 3, name: 'Pantry', isFreezer: false},
            {id: 9, name: 'Chest freezer', isFreezer: true},
        ]})
        apiMock.apiShoppingListEntryList.mockResolvedValue({results: [
            {food: {id: 3, name: 'Basil', shelfLifeDays: 7}, amount: 1, unit: null, checked: true},
        ]})

        const wrapper = mountDialog()
        void (wrapper.vm as any).open()
        await flushPromises()

        const row = (wrapper.vm as any).rows[0]
        expect(row.expires).toBeTruthy()               // shelf-life prefill present
        const seeded = row.expires

        // drive the location ModelSelect's emit so the @update:model-value binding is load-bearing
        const locationSelect = wrapper.findAllComponents('.model-select-stub')
            .find((c: any) => c.props('model') === 'InventoryLocation')! as any
        locationSelect.vm.$emit('update:modelValue', {id: 9, name: 'Chest freezer', isFreezer: true})
        await flushPromises()
        expect(row.expires).toBeNull()                 // freezer mutes the auto suggestion

        locationSelect.vm.$emit('update:modelValue', {id: 3, name: 'Pantry', isFreezer: false})
        await flushPromises()
        expect(row.expires).toBe(seeded)               // switching back restores it
    })
})
