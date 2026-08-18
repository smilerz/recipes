/**
 * #33: rapid double-click on Save in the inventory-booking form created 2 duplicate
 * InventoryEntry rows - save() had no in-flight guard even though formLoading already
 * existed and was tracked (just never checked before dispatching another save).
 */
import {describe, it, expect, vi, beforeEach} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {createPinia, setActivePinia, type PiniaPlugin} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'
import {ref} from 'vue'

import {apiMock, resetApiMock} from '@/__tests__/api-mock'
import {makeUserPreference} from '@/__tests__/factories'

vi.mock('@vueuse/core', async (imp) => ({...(await imp<any>()), useStorage: (_k: string, d: any) => ref(d)}))
vi.mock('@vueuse/router', () => ({useRouteQuery: (_k: string, d: any) => ref(d)}))
vi.mock('vue-router', () => ({
    useRoute: () => ({query: {}}),
    useRouter: () => ({push: vi.fn().mockResolvedValue(undefined)}),
}))
vi.mock('vue-i18n', async (importOriginal) => ({
    ...(await importOriginal<typeof import('vue-i18n')>()),
    useI18n: () => ({t: (key: string) => key}),
}))
vi.mock('@/openapi', async (imp) => ({...(await imp<any>()), ApiApi: class { constructor() { return apiMock } }}))

import InventoryBookingPage from '@/pages/InventoryBookingPage.vue'

function mountPage() {
    const prePopulate: PiniaPlugin = ({store}) => {
        if (store.$id === 'user_preference_store') {
            store.userSettings = makeUserPreference() as any
            store.activeSpace = {id: 1} as any
        }
    }
    const pinia = createPinia()
    pinia.use(prePopulate)
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})
    return mount(InventoryBookingPage, {
        global: {
            plugins: [pinia, i18n, vuetify],
            stubs: {
                'model-select': {template: '<div/>'},
                'v-date-input': {template: '<input type="date" />'},
                'freezer-expiry-dialog': {template: '<div/>'},
                'inventory-entry-log-dialog': {template: '<div/>'},
                'model-edit-dialog': {template: '<div/>'},
                'inventory-entry-log-table': {template: '<div/>'},
                'closable-help-alert': {template: '<div class="stub-help-alert"/>'},
            },
        },
    })
}

describe('InventoryBookingPage', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        resetApiMock()
        apiMock.apiInventoryEntryList.mockResolvedValue({results: [], count: 0} as any)
    })

    it('rapid double-click Save does not create duplicate InventoryEntry rows (#33)', async () => {
        let resolveCreate: (v: any) => void = () => {}
        apiMock.apiInventoryEntryCreate.mockReturnValue(new Promise(resolve => { resolveCreate = resolve }))

        const w = mountPage()
        await flushPromises()

        // simulate a rapid double-click: two calls before the first request resolves
        ;(w.vm as any).save()
        ;(w.vm as any).save()
        await flushPromises()

        expect(apiMock.apiInventoryEntryCreate).toHaveBeenCalledTimes(1)

        resolveCreate({id: 1, food: {id: 1, name: 'Flour'}, inventoryLocation: {id: 1, name: 'Pantry'}, amount: 1})
        await flushPromises()

        w.unmount()
    })

    // #2: Remove/Move/Edit collapsed into a single editEntry() that PATCHes only whichever fields
    // actually changed (amount/unit from the Amount tab, location/subLocation from the Location
    // tab) — same never-touch-expires pattern as the old moveInventory(), now also covering the
    // freeze/thaw recompute toast that moveInventory had but the old removeInventory() lacked.
    it('editEntry sends a partial update that omits expires, not a full PUT', async () => {
        const w = mountPage()
        await flushPromises()

        const entry = {
            id: 5, food: {id: 1, name: 'Peas'}, unit: null, amount: 1,
            inventoryLocation: {id: 1, name: 'Freezer', isFreezer: true},
            expires: new Date('2027-01-01'), subLocation: '',
        }
        ;(w.vm as any).inventoryEntry = entry
        ;(w.vm as any).inventoryLocation = {id: 2, name: 'Pantry', isFreezer: false}
        apiMock.apiInventoryEntryPartialUpdate.mockResolvedValue({...entry, inventoryLocation: {id: 2, name: 'Pantry', isFreezer: false}, expires: new Date('2026-08-13')})

        ;(w.vm as any).editEntry()
        await flushPromises()

        expect(apiMock.apiInventoryEntryUpdate).not.toHaveBeenCalled()
        expect(apiMock.apiInventoryEntryPartialUpdate).toHaveBeenCalledTimes(1)
        const [call] = apiMock.apiInventoryEntryPartialUpdate.mock.calls
        expect(call[0].id).toBe(5)
        expect(call[0].patchedInventoryEntry).not.toHaveProperty('expires')
        expect(call[0].patchedInventoryEntry.inventoryLocation).toEqual({id: 2, name: 'Pantry', isFreezer: false})

        w.unmount()
    })

    it('editEntry patches both amount and location in one call when both changed', async () => {
        const w = mountPage()
        await flushPromises()

        const entry = {
            id: 5, food: {id: 1, name: 'Peas'}, unit: {id: 1, name: 'g'}, amount: 1,
            inventoryLocation: {id: 1, name: 'Pantry', isFreezer: false},
            expires: new Date('2027-01-01'), subLocation: '',
        }
        ;(w.vm as any).inventoryEntry = entry
        ;(w.vm as any).inventoryEntrySelected()
        ;(w.vm as any).amount = 5
        ;(w.vm as any).inventoryLocation = {id: 2, name: 'Freezer', isFreezer: true}
        apiMock.apiInventoryEntryPartialUpdate.mockResolvedValue({...entry, amount: 5, inventoryLocation: {id: 2, name: 'Freezer', isFreezer: true}})

        ;(w.vm as any).editEntry()
        await flushPromises()

        expect(apiMock.apiInventoryEntryPartialUpdate).toHaveBeenCalledTimes(1)
        const [call] = apiMock.apiInventoryEntryPartialUpdate.mock.calls
        expect(call[0].patchedInventoryEntry).toEqual({
            amount: 5,
            inventoryLocation: {id: 2, name: 'Freezer', isFreezer: true},
        })

        w.unmount()
    })

    it('editEntry sends nothing when nothing changed', async () => {
        const w = mountPage()
        await flushPromises()

        const entry = {
            id: 5, food: {id: 1, name: 'Peas'}, unit: {id: 1, name: 'g'}, amount: 1,
            inventoryLocation: {id: 1, name: 'Pantry', isFreezer: false},
            expires: new Date('2027-01-01'), subLocation: '',
        }
        ;(w.vm as any).inventoryEntry = entry
        ;(w.vm as any).inventoryEntrySelected()

        ;(w.vm as any).editEntry()
        await flushPromises()

        expect(apiMock.apiInventoryEntryPartialUpdate).not.toHaveBeenCalled()

        w.unmount()
    })

    // #13/#2: the Current Stock table only had icon buttons per row for the old Remove/Move —
    // click:row now starts the unified Edit on that entry.
    it('clicking a Current Stock row starts an Edit on that entry (#13/#2)', async () => {
        apiMock.apiInventoryEntryList.mockResolvedValue({
            results: [{
                id: 9, food: {id: 1, name: 'Peas'}, unit: null, amount: 2,
                inventoryLocation: {id: 1, name: 'Pantry', isFreezer: false},
                expires: null, code: 'ABC', subLocation: '',
            }],
            count: 1,
        })
        const w = mountPage()
        ;(w.vm as any).food = {id: 1, name: 'Peas'}
        ;(w.vm as any).loadItems({page: 1, itemsPerPage: 10})
        await flushPromises()

        const row = w.find('tbody tr')
        expect(row.exists()).toBe(true)
        await row.trigger('click')
        await flushPromises()

        expect((w.vm as any).bookingMode).toBe('edit')
        expect((w.vm as any).inventoryEntry?.id).toBe(9)

        w.unmount()
    })

    // Regression guard: without stopping propagation on the row's own action buttons, clicking
    // History would also bubble into the row-click handler and silently flip bookingMode to
    // 'edit' as an unwanted side effect.
    it('clicking the History button does not also trigger the row click handler', async () => {
        apiMock.apiInventoryEntryList.mockResolvedValue({
            results: [{
                id: 9, food: {id: 1, name: 'Peas'}, unit: null, amount: 2,
                inventoryLocation: {id: 1, name: 'Pantry', isFreezer: false},
                expires: null, code: 'ABC', subLocation: '',
            }],
            count: 1,
        })
        const w = mountPage()
        ;(w.vm as any).food = {id: 1, name: 'Peas'}
        ;(w.vm as any).loadItems({page: 1, itemsPerPage: 10})
        await flushPromises()

        const historyBtn = w.find('[data-test="stock-history-btn"]')
        expect(historyBtn.exists()).toBe(true)
        await historyBtn.trigger('click')
        await flushPromises()

        expect((w.vm as any).bookingMode).toBe('add')
        expect((w.vm as any).entryLogDialog).toBe(true)

        w.unmount()
    })

    // #2: Add + tabbed Edit only — Remove/Move no longer exist as separate modes.
    it('defaults to the Amount tab in Edit mode', async () => {
        const w = mountPage()
        await flushPromises()

        ;(w.vm as any).bookingMode = 'edit'
        await flushPromises()

        expect((w.vm as any).editTab).toBe('amount')

        w.unmount()
    })

    it('shows the CodeHelp alert in Add mode', async () => {
        const w = mountPage()
        await flushPromises()

        expect(w.find('.stub-help-alert').exists()).toBe(true)

        w.unmount()
    })

    it('hides the CodeHelp alert in Edit mode', async () => {
        const w = mountPage()
        await flushPromises()

        ;(w.vm as any).bookingMode = 'edit'
        await flushPromises()

        expect(w.find('.stub-help-alert').exists()).toBe(false)

        w.unmount()
    })
})
