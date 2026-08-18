/**
 * #2: Remove/Move/Edit were three separate booking modes with duplicated "which fields changed"
 * PATCH logic. Collapsed into a single 'edit' mode with two tabs (Amount, Location) — one Save
 * patches only whichever fields actually changed, on either tab. editInventory() now owns both
 * the amount/unit patch (former #9 behavior) and the location/subLocation patch + freeze/thaw
 * recompute toast (former moveInventory() behavior).
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

function mountDialog(inventoryEntryId: number, bookingMode: string = 'edit') {
    const pinia = createPinia()
    setActivePinia(pinia)
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})

    return mount(PantryBookingDialog, {
        props: {modelValue: true, bookingMode, inventoryEntryId},
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

describe('PantryBookingDialog - edit mode Location tab (freeze/thaw recompute toast)', () => {
    beforeEach(() => {
        resetApiMock()
        addMessageMock.mockClear()
    })

    it('shows an info toast when an edit recomputes expires (freezer transition)', async () => {
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
        ;(w.vm as any).editInventory()
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
        ;(w.vm as any).editInventory()
        await flushPromises()

        expect(apiMock.apiInventoryEntryUpdate).not.toHaveBeenCalled()
        expect(apiMock.apiInventoryEntryPartialUpdate).toHaveBeenCalledTimes(1)
        const [call] = apiMock.apiInventoryEntryPartialUpdate.mock.calls
        expect(call[0].id).toBe(5)
        expect(call[0].patchedInventoryEntry).not.toHaveProperty('expires')
        expect(call[0].patchedInventoryEntry.inventoryLocation).toEqual({id: 2, name: 'Pantry', isFreezer: false})

        w.unmount()
    })

    it('does not show the recompute toast when expires is unchanged by the edit', async () => {
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
        ;(w.vm as any).editInventory()
        await flushPromises()

        expect(addMessageMock).not.toHaveBeenCalled()

        w.unmount()
    })
})

// #9: a pantry entry could only be subtracted from (remove) or relocated (move) — there was no
// way to directly correct its amount or unit. editInventory() PATCHes only those two fields on
// the Amount tab, reusing the same never-touch-expires pattern as the Location tab above.
describe('PantryBookingDialog - edit mode Amount tab (#9: direct amount/unit edit)', () => {
    beforeEach(() => {
        resetApiMock()
        addMessageMock.mockClear()
    })

    it('sends a partial update with only the changed amount/unit, omitting expires and location', async () => {
        const entry = {
            id: 7, food: {id: 1, name: 'Flour'}, unit: {id: 1, name: 'g'}, amount: 2,
            inventoryLocation: {id: 1, name: 'Pantry', isFreezer: false},
            expires: new Date('2027-01-01'), subLocation: '',
        }
        apiMock.apiInventoryEntryRetrieve.mockResolvedValue(entry)
        apiMock.apiInventoryEntryList.mockResolvedValue({results: []})
        const w = mountDialog(7)
        await flushPromises()

        expect((w.vm as any).amount).toBe(2)

        ;(w.vm as any).amount = 5
        apiMock.apiInventoryEntryPartialUpdate.mockResolvedValue({...entry, amount: 5})
        ;(w.vm as any).editInventory()
        await flushPromises()

        expect(apiMock.apiInventoryEntryUpdate).not.toHaveBeenCalled()
        expect(apiMock.apiInventoryEntryPartialUpdate).toHaveBeenCalledTimes(1)
        const [call] = apiMock.apiInventoryEntryPartialUpdate.mock.calls
        expect(call[0].id).toBe(7)
        expect(call[0].patchedInventoryEntry).toEqual({amount: 5})

        w.unmount()
    })

    it('sends nothing (no API call) when neither amount, unit, nor location changed', async () => {
        const entry = {
            id: 7, food: {id: 1, name: 'Flour'}, unit: {id: 1, name: 'g'}, amount: 2,
            inventoryLocation: {id: 1, name: 'Pantry', isFreezer: false},
            expires: new Date('2027-01-01'), subLocation: '',
        }
        apiMock.apiInventoryEntryRetrieve.mockResolvedValue(entry)
        apiMock.apiInventoryEntryList.mockResolvedValue({results: []})
        const w = mountDialog(7)
        await flushPromises()

        ;(w.vm as any).editInventory()
        await flushPromises()

        expect(apiMock.apiInventoryEntryPartialUpdate).not.toHaveBeenCalled()

        w.unmount()
    })
})

// #2: the point of consolidating into one Edit mode with tabs is that a single Save patches
// whatever changed regardless of which tab it was touched on.
describe('PantryBookingDialog - edit mode consolidation (#2)', () => {
    beforeEach(() => {
        resetApiMock()
        addMessageMock.mockClear()
    })

    it('defaults to the Amount tab when the dialog opens', async () => {
        const entry = {
            id: 7, food: {id: 1, name: 'Flour'}, unit: {id: 1, name: 'g'}, amount: 2,
            inventoryLocation: {id: 1, name: 'Pantry', isFreezer: false},
            expires: new Date('2027-01-01'), subLocation: '',
        }
        apiMock.apiInventoryEntryRetrieve.mockResolvedValue(entry)
        apiMock.apiInventoryEntryList.mockResolvedValue({results: []})
        const w = mountDialog(7)
        await flushPromises()

        expect((w.vm as any).editTab).toBe('amount')

        w.unmount()
    })

    it('a single save patches both amount and location when both were changed', async () => {
        const entry = {
            id: 7, food: {id: 1, name: 'Flour'}, unit: {id: 1, name: 'g'}, amount: 2,
            inventoryLocation: {id: 1, name: 'Pantry', isFreezer: false},
            expires: new Date('2027-01-01'), subLocation: '',
        }
        apiMock.apiInventoryEntryRetrieve.mockResolvedValue(entry)
        apiMock.apiInventoryEntryList.mockResolvedValue({results: []})
        const w = mountDialog(7)
        await flushPromises()

        ;(w.vm as any).amount = 5
        ;(w.vm as any).inventoryLocation = {id: 2, name: 'Freezer', isFreezer: true}
        apiMock.apiInventoryEntryPartialUpdate.mockResolvedValue({
            ...entry, amount: 5, inventoryLocation: {id: 2, name: 'Freezer', isFreezer: true},
        })
        ;(w.vm as any).editInventory()
        await flushPromises()

        expect(apiMock.apiInventoryEntryPartialUpdate).toHaveBeenCalledTimes(1)
        const [call] = apiMock.apiInventoryEntryPartialUpdate.mock.calls
        expect(call[0].patchedInventoryEntry).toEqual({
            amount: 5,
            inventoryLocation: {id: 2, name: 'Freezer', isFreezer: true},
        })

        w.unmount()
    })

    it('tracks the original amount/unit on entry selection, for the before/after caption', async () => {
        const entry = {
            id: 7, food: {id: 1, name: 'Flour'}, unit: {id: 1, name: 'g'}, amount: 2,
            inventoryLocation: {id: 1, name: 'Pantry', isFreezer: false},
            expires: new Date('2027-01-01'), subLocation: '',
        }
        apiMock.apiInventoryEntryRetrieve.mockResolvedValue(entry)
        apiMock.apiInventoryEntryList.mockResolvedValue({results: []})
        const w = mountDialog(7)
        await flushPromises()

        expect((w.vm as any).entryOriginalAmount).toBe(2)
        expect((w.vm as any).amountChanged).toBe(false)

        ;(w.vm as any).amount = 5
        await flushPromises()

        expect((w.vm as any).amountChanged).toBe(true)
        expect((w.vm as any).entryOriginalAmount).toBe(2)

        w.unmount()
    })

    it('hides the CodeHelp alert in Edit mode', async () => {
        const entry = {
            id: 7, food: {id: 1, name: 'Flour'}, unit: {id: 1, name: 'g'}, amount: 2,
            inventoryLocation: {id: 1, name: 'Pantry', isFreezer: false},
            expires: new Date('2027-01-01'), subLocation: '',
        }
        apiMock.apiInventoryEntryRetrieve.mockResolvedValue(entry)
        apiMock.apiInventoryEntryList.mockResolvedValue({results: []})
        const w = mountDialog(7, 'edit')
        await flushPromises()

        // v-dialog content teleports to document.body, outside wrapper.element — query the document.
        expect(document.body.querySelector('.stub-help-alert')).toBeNull()

        w.unmount()
    })

    it('shows the CodeHelp alert in Add mode', async () => {
        apiMock.apiInventoryEntryList.mockResolvedValue({results: []})
        const w = mountDialog(0, 'add')
        await flushPromises()

        expect(document.body.querySelector('.stub-help-alert')).not.toBeNull()

        w.unmount()
    })
})
