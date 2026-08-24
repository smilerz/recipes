/**
 * Regression coverage for InventoryQuickAddDialog.
 *
 * - open() imperative API: default location selection, pre-filled
 *   amount/unit, and resolve-prior-promise-on-reopen.
 * - Manage-mode add (defect, visually confirmed on preview): clicking
 *   "Add" in the Pantry manage dialog posted a payload with a blank
 *   food.name and no inventory_location.household, so the backend
 *   returned 400. These tests lock in that handleManageAdd sends the
 *   household (from the selected location) and a non-blank food name
 *   (threaded via openManage).
 */
import {describe, it, expect, vi, beforeEach} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {createPinia, setActivePinia} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'
import {createRouter, createMemoryHistory} from 'vue-router'

import {apiMock, resetApiMock} from '@/__tests__/api-mock'
import {ErrorMessageType} from '@/stores/MessageStore'

vi.mock('@/openapi', async (imp) => ({...(await imp<any>()), ApiApi: class { constructor() { return apiMock } }}))

// The component only ever calls useMessageStore().addError inline, so a stub
// store lets us assert on it without pulling the real store's useI18n (which
// must run inside a setup function) into the test's top-level scope.
const {addErrorMock} = vi.hoisted(() => ({addErrorMock: vi.fn()}))
vi.mock('@/stores/MessageStore', async (imp) => ({...(await imp<any>()), useMessageStore: () => ({addError: addErrorMock})}))

import InventoryQuickAddDialog from '@/components/dialogs/InventoryQuickAddDialog.vue'

function mountDialog() {
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})
    const router = createRouter({history: createMemoryHistory(), routes: [{path: '/', component: {template: '<div/>'}}]})
    return mount(InventoryQuickAddDialog, {
        attachTo: document.body,
        global: {
            plugins: [createPinia(), i18n, vuetify, router],
            stubs: {
                // ModelSelect makes its own API calls on load; the Unit field is
                // irrelevant to these tests (unit stays null).
                ModelSelect: {template: '<div class="model-select-stub" />'},
                VClosableCardTitle: {template: '<div class="title-stub" />'},
                // v-dialog activator="model" trips a Vuetify activator watcher under
                // jsdom; the dialog's own behavior is not under test here.
                ExpiryPresetDialog: {template: '<div class="freezer-dialog-stub" />'},
            },
        },
    })
}

function clickAdd() {
    const addBtn = [...document.querySelectorAll('.v-btn')]
        .find(b => b.textContent?.includes('Add')) as HTMLElement | undefined
    addBtn?.click()
}

describe('InventoryQuickAddDialog manage-mode add', () => {
    beforeEach(() => { setActivePinia(createPinia()); resetApiMock(); addErrorMock.mockClear() })

    it('ICM-ADD-01: posts inventory_location.household from the selected location', async () => {
        apiMock.apiInventoryEntryList.mockResolvedValue({results: []})
        apiMock.apiInventoryEntryCreate.mockResolvedValue({id: 99})
        const wrapper = mountDialog()

        // openManage returns a promise that only resolves when the dialog
        // closes — do NOT await it, just let its internal entry-list load run.
        void (wrapper.vm as any).openManage({
            title: 'Pantry: celery',
            foodId: 42,
            foodName: 'celery',
            locations: [{value: 2, label: 'Bar Cart', household: {id: 1, name: 'Default'}}],
            defaultLocationId: 2,
            amount: 4,
            unit: null,
        })
        await flushPromises()

        clickAdd()
        await flushPromises()

        expect(apiMock.apiInventoryEntryCreate).toHaveBeenCalledTimes(1)
        const payload = apiMock.apiInventoryEntryCreate.mock.calls[0][0].inventoryEntry
        expect(payload.inventoryLocation.household).toEqual({id: 1, name: 'Default'})
        wrapper.unmount()
    })

    it('ICM-ADD-02: posts a non-blank food.name', async () => {
        apiMock.apiInventoryEntryList.mockResolvedValue({results: []})
        apiMock.apiInventoryEntryCreate.mockResolvedValue({id: 99})
        const wrapper = mountDialog()

        // openManage returns a promise that only resolves when the dialog
        // closes — do NOT await it, just let its internal entry-list load run.
        void (wrapper.vm as any).openManage({
            title: 'Pantry: celery',
            foodId: 42,
            foodName: 'celery',
            locations: [{value: 2, label: 'Bar Cart', household: {id: 1, name: 'Default'}}],
            defaultLocationId: 2,
            amount: 4,
            unit: null,
        })
        await flushPromises()

        clickAdd()
        await flushPromises()

        expect(apiMock.apiInventoryEntryCreate).toHaveBeenCalledTimes(1)
        const payload = apiMock.apiInventoryEntryCreate.mock.calls[0][0].inventoryEntry
        expect(payload.food.name).toBe('celery')
        wrapper.unmount()
    })

    it('ICM-ADD-03: surfaces a FETCH_ERROR when the existing-entries load fails', async () => {
        const err = new Error('boom')
        apiMock.apiInventoryEntryList.mockRejectedValue(err)
        const wrapper = mountDialog()

        void (wrapper.vm as any).openManage({
            title: 'Pantry: celery',
            foodId: 42,
            foodName: 'celery',
            locations: [{value: 2, label: 'Bar Cart', household: {id: 1, name: 'Default'}}],
            defaultLocationId: 2,
            amount: 4,
            unit: null,
        })
        await flushPromises()

        // A failed load must be signalled — not silently rendered as an empty
        // pantry (which would invite duplicate adds).
        expect(addErrorMock).toHaveBeenCalledWith(ErrorMessageType.FETCH_ERROR, err)
        // ...while the dialog still opens with an empty list so it stays usable.
        expect((wrapper.vm as any).existingEntries).toEqual([])
        wrapper.unmount()
    })
})

describe('InventoryQuickAddDialog expiry field (FR-C2/FR-D6 gap + DEC-4 freezer)', () => {
    beforeEach(() => { setActivePinia(createPinia()); resetApiMock() })

    it('QA-EXP-01: shows an editable expires date field', async () => {
        const w = mountDialog()
        void (w.vm as any).open({
            title: 'Add', locations: [{value: 3, label: 'Pantry'}], defaultLocationId: 3,
        })
        await flushPromises()

        expect(document.querySelector('input[type="date"]')).toBeTruthy()
        w.unmount()
    })

    it('QA-EXP-02: quick-add resolves with the chosen expiry', async () => {
        const w = mountDialog()
        const promise = (w.vm as any).open({
            title: 'Add', locations: [{value: 3, label: 'Pantry'}], defaultLocationId: 3,
        }) as Promise<any>
        await flushPromises()

        // drive the real input so the v-model wiring is load-bearing, not just the ref
        const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
        dateInput.value = '2026-12-24'
        dateInput.dispatchEvent(new Event('input'))
        await flushPromises()
        clickAdd()
        const result = await promise
        // let VDialog's close watcher (await nextTick -> overlay focus handling)
        // finish while the component is still mounted, else it NPEs under jsdom
        await flushPromises()

        expect(result.expires).toBe('2026-12-24')
        w.unmount()
    })

    it('QA-EXP-03: the freezer prefill button shows only for freezer locations', async () => {
        const w = mountDialog()
        void (w.vm as any).open({
            title: 'Add',
            locations: [{value: 3, label: 'Pantry'}, {value: 9, label: 'Chest freezer', isFreezer: true}],
            defaultLocationId: 3,
        })
        await flushPromises()
        expect(document.querySelector('[data-test="freezer-expiry-btn"]')).toBeNull()

        ;(w.vm as any).selectedLocationId = 9
        await flushPromises()
        expect(document.querySelector('[data-test="freezer-expiry-btn"]')).toBeTruthy()
        w.unmount()
    })
})

describe('InventoryQuickAddDialog expiry preview (#5: pre-populate/highlight instead of a post-save-only reveal)', () => {
    beforeEach(() => setActivePinia(createPinia()))

    it('QA-EXP-04: seeds expires from the plain shelf life for a non-freezer default location', async () => {
        const w = mountDialog()
        void (w.vm as any).open({
            title: 'Add',
            locations: [{value: 3, label: 'Pantry'}],
            defaultLocationId: 3,
            shelfLifeDays: 7,
            shelfLifeDaysFrozen: 90,
        })
        await flushPromises()

        const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
        expect(dateInput.value).not.toBe('')
        w.unmount()
    })

    it('QA-EXP-05: switching to a freezer location re-seeds expires from the frozen number', async () => {
        const w = mountDialog()
        void (w.vm as any).open({
            title: 'Add',
            locations: [{value: 3, label: 'Pantry'}, {value: 9, label: 'Chest freezer', isFreezer: true}],
            defaultLocationId: 3,
            shelfLifeDays: 7,
            shelfLifeDaysFrozen: 90,
        })
        await flushPromises()
        const pantrySeed = (w.vm as any).expires

        ;(w.vm as any).selectedLocationId = 9
        await flushPromises()

        expect((w.vm as any).expires).not.toBe(pantrySeed)
        expect((w.vm as any).expires).not.toBeNull()
        w.unmount()
    })

    it('QA-EXP-06: a freezer location with no frozen shelf life mutes the suggestion (null), not the plain number', async () => {
        const w = mountDialog()
        void (w.vm as any).open({
            title: 'Add',
            locations: [{value: 3, label: 'Pantry'}, {value: 9, label: 'Chest freezer', isFreezer: true}],
            defaultLocationId: 3,
            shelfLifeDays: 7,
            shelfLifeDaysFrozen: null,
        })
        await flushPromises()

        ;(w.vm as any).selectedLocationId = 9
        await flushPromises()

        expect((w.vm as any).expires).toBeNull()
        w.unmount()
    })

    it('QA-EXP-07: a user-typed date survives a location change (only the untouched seed gets replaced)', async () => {
        const w = mountDialog()
        void (w.vm as any).open({
            title: 'Add',
            locations: [{value: 3, label: 'Pantry'}, {value: 9, label: 'Chest freezer', isFreezer: true}],
            defaultLocationId: 3,
            shelfLifeDays: 7,
            shelfLifeDaysFrozen: 90,
        })
        await flushPromises()

        const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
        dateInput.value = '2027-01-01'
        dateInput.dispatchEvent(new Event('input'))
        await flushPromises()

        ;(w.vm as any).selectedLocationId = 9
        await flushPromises()

        expect((w.vm as any).expires).toBe('2027-01-01')
        w.unmount()
    })
})

describe('InventoryQuickAddDialog open() API', () => {
    beforeEach(() => setActivePinia(createPinia()))

    it('exposes open() as the imperative API', () => {
        const w = mountDialog()
        expect(typeof (w.vm as any).open).toBe('function')
        w.unmount()
    })

    it('open() returns a pending Promise', () => {
        const w = mountDialog()
        const p = (w.vm as any).open({
            title: 'Add',
            locations: [{value: 1, label: 'Pantry'}],
        })
        expect(p).toBeInstanceOf(Promise)
        w.unmount()
    })

    it('a second open() while one is pending resolves prior promise as null', async () => {
        const w = mountDialog()
        const api = w.vm as any
        const first = api.open({title: 'First', locations: [{value: 1, label: 'X'}]})
        await flushPromises()
        api.open({title: 'Second', locations: [{value: 2, label: 'Y'}]})
        await expect(first).resolves.toBeNull()
        w.unmount()
    })
})
