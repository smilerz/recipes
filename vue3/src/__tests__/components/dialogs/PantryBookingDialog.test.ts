/**
 * Freeze/thaw recompute toast: a Move that crosses a freezer-status boundary (see
 * recompute_lot_expiry, Part 1 of the pantry-expiration plan) can change a lot's expires
 * server-side. moveInventory() surfaces that via its own toast — surfaced, never silent, same
 * spirit as the FR-D6 autofill precedent — distinct from the routine "Updated" toast.
 */
import {describe, it, expect, beforeEach, vi} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {createPinia, setActivePinia} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'
import {apiMock, resetApiMock} from '@/__tests__/api-mock'

vi.mock('@/openapi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/openapi')>()
    return {...actual, ApiApi: class {constructor() { return apiMock }}}
})

vi.mock('vue-i18n', async (importOriginal) => ({
    ...(await importOriginal<typeof import('vue-i18n')>()),
    useI18n: () => ({t: (key: string) => key}),
}))

const {addMessageMock} = vi.hoisted(() => ({addMessageMock: vi.fn()}))
vi.mock('@/stores/MessageStore', async (imp) => ({
    ...(await imp<any>()),
    useMessageStore: () => ({addError: vi.fn(), addPreparedMessage: vi.fn(), addMessage: addMessageMock}),
}))

vi.mock('vue-router', () => ({
    useRoute: () => ({query: {}}),
    useRouter: () => ({push: vi.fn().mockResolvedValue(undefined)}),
}))

vi.mock('@vueuse/router', () => ({
    useRouteQuery: () => ({value: false}),
}))

vi.mock('@vueuse/core', async (importOriginal) => {
    const {ref} = await import('vue')
    return {
        ...(await importOriginal<typeof import('@vueuse/core')>()),
        useStorage: (_key: string, defaultValue: any) => ref(defaultValue),
    }
})

import PantryBookingDialog from '@/components/dialogs/PantryBookingDialog.vue'

function mountDialog(inventoryEntryId: number) {
    const pinia = createPinia()
    setActivePinia(pinia)
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})

    return mount(PantryBookingDialog, {
        props: {modelValue: true, bookingMode: 'move', inventoryEntryId},
        global: {
            plugins: [pinia, i18n, vuetify],
            stubs: {
                ModelSelect: {template: '<div class="stub-model-select"/>'},
                ModelEditDialog: {template: '<div class="stub-model-edit-dialog"/>'},
                ClosableHelpAlert: {template: '<div class="stub-help-alert"/>'},
                VClosableCardTitle: {template: '<div class="stub-title"/>'},
                FreezerExpiryDialog: {template: '<div class="stub-freezer-dialog"/>'},
            },
        },
    })
}

describe('PantryBookingDialog - move recompute toast', () => {
    beforeEach(() => {
        resetApiMock()
        addMessageMock.mockClear()
    })

    it('shows an info toast when a move recomputes expires (freezer transition)', async () => {
        const entry = {
            id: 5, food: {id: 1, name: 'Peas'}, unit: null, amount: 1,
            inventoryLocation: {id: 1, name: 'Freezer', isFreezer: true},
            expires: new Date('2027-01-01'), subLocation: '',
        }
        apiMock.apiInventoryEntryRetrieve.mockResolvedValue(entry)
        apiMock.apiInventoryEntryList.mockResolvedValue({results: []})
        const w = mountDialog(5)
        await flushPromises()

        ;(w.vm as any).inventoryLocation = {id: 2, name: 'Pantry', isFreezer: false}
        apiMock.apiInventoryEntryPartialUpdate.mockResolvedValue({...entry, inventoryLocation: {id: 2, name: 'Pantry', isFreezer: false}, expires: new Date('2026-08-13')})
        ;(w.vm as any).moveInventory()
        await flushPromises()

        expect(addMessageMock).toHaveBeenCalled()

        w.unmount()
    })

    // Regression: a full PUT of the whole entry always resent the old `expires`, which the
    // backend reads as "the caller explicitly set it" and permanently defeats the freeze/thaw
    // recompute — even on a genuine freezer<->fridge move. The fix moved this to a partial
    // update that sends only the fields that changed, with `expires` never present in the payload.
    it('sends a partial update that omits expires, not a full PUT of the whole entry', async () => {
        const entry = {
            id: 5, food: {id: 1, name: 'Peas'}, unit: null, amount: 1,
            inventoryLocation: {id: 1, name: 'Freezer', isFreezer: true},
            expires: new Date('2027-01-01'), subLocation: '',
        }
        apiMock.apiInventoryEntryRetrieve.mockResolvedValue(entry)
        apiMock.apiInventoryEntryList.mockResolvedValue({results: []})
        const w = mountDialog(5)
        await flushPromises()

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

    it('does not show the recompute toast when expires is unchanged by the move', async () => {
        const entry = {
            id: 5, food: {id: 1, name: 'Peas'}, unit: null, amount: 1,
            inventoryLocation: {id: 1, name: 'Pantry A', isFreezer: false},
            expires: new Date('2026-08-13'), subLocation: '',
        }
        apiMock.apiInventoryEntryRetrieve.mockResolvedValue(entry)
        apiMock.apiInventoryEntryList.mockResolvedValue({results: []})
        const w = mountDialog(5)
        await flushPromises()

        ;(w.vm as any).inventoryLocation = {id: 2, name: 'Pantry B', isFreezer: false}
        apiMock.apiInventoryEntryPartialUpdate.mockResolvedValue({...entry, inventoryLocation: {id: 2, name: 'Pantry B', isFreezer: false}, expires: new Date('2026-08-13')})
        ;(w.vm as any).moveInventory()
        await flushPromises()

        expect(addMessageMock).not.toHaveBeenCalled()

        w.unmount()
    })
})
