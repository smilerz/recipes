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

    // Same fix as PantryBookingDialog's moveInventory: a full PUT of the whole entry always
    // resent the old `expires`, defeating the backend's freeze/thaw recompute on a genuine move.
    it('moveInventory sends a partial update that omits expires, not a full PUT', async () => {
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

        ;(w.vm as any).moveInventory()
        await flushPromises()

        expect(apiMock.apiInventoryEntryUpdate).not.toHaveBeenCalled()
        expect(apiMock.apiInventoryEntryPartialUpdate).toHaveBeenCalledTimes(1)
        const [call] = apiMock.apiInventoryEntryPartialUpdate.mock.calls
        expect(call[0].id).toBe(5)
        expect(call[0].patchedInventoryEntry).not.toHaveProperty('expires')
        expect(call[0].patchedInventoryEntry.inventoryLocation).toEqual({id: 2, name: 'Pantry', isFreezer: false})

        w.unmount()
    })
})
