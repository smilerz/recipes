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
                'v-date-input': {template: '<div><input type="date" /><slot name="append-inner"/></div>'},
                'expiry-preset-dialog': {template: '<div/>'},
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

    // Reconsidered post-UAT: leaving Location blank-on-select (the original #4 fix) was judged
    // counter-intuitive — a user editing a lot expects to see where it currently is. Pre-populating
    // with the newly selected entry's own location/subLocation also structurally prevents the
    // original cross-entry corruption bug (the dirty-check in editEntry() compares by reference/
    // value against whatever is currently loaded, which is now always the CURRENT entry's own data,
    // never a leftover from a previously edited entry).
    it('inventoryEntrySelected pre-populates inventoryLocation/subLocation with the newly selected entry\'s own values, not a stale value from a previous entry', async () => {
        const w = mountPage()
        await flushPromises()

        const entryA = {
            id: 5, food: {id: 1, name: 'Peas'}, unit: null, amount: 1,
            inventoryLocation: {id: 1, name: 'Pantry', isFreezer: false},
            expires: null, subLocation: 'Top Shelf',
        }
        ;(w.vm as any).inventoryEntry = entryA
        ;(w.vm as any).inventoryEntrySelected()
        expect((w.vm as any).inventoryLocation).toEqual({id: 1, name: 'Pantry', isFreezer: false})
        expect((w.vm as any).subLocation).toBe('Top Shelf')

        // simulate having visited the Location tab and picked a different location for entry A
        ;(w.vm as any).inventoryLocation = {id: 2, name: 'Freezer', isFreezer: true}

        const entryB = {
            id: 6, food: {id: 2, name: 'Carrots'}, unit: null, amount: 3,
            inventoryLocation: {id: 3, name: 'Garage', isFreezer: false},
            expires: null, subLocation: '',
        }
        ;(w.vm as any).inventoryEntry = entryB
        ;(w.vm as any).inventoryEntrySelected()

        expect((w.vm as any).inventoryLocation).toEqual({id: 3, name: 'Garage', isFreezer: false})
        expect((w.vm as any).subLocation).toBe('')

        w.unmount()
    })

    it('editing a different entry after touching Location on a prior one does not patch the wrong location', async () => {
        const w = mountPage()
        await flushPromises()

        const entryA = {
            id: 5, food: {id: 1, name: 'Peas'}, unit: null, amount: 1,
            inventoryLocation: {id: 1, name: 'Pantry', isFreezer: false},
            expires: null, subLocation: '',
        }
        ;(w.vm as any).inventoryEntry = entryA
        ;(w.vm as any).inventoryEntrySelected()
        ;(w.vm as any).inventoryLocation = {id: 2, name: 'Freezer', isFreezer: true}

        // switch to an unrelated entry B and only change its amount — its real location (Garage)
        // must not be overwritten by entry A's leftover Freezer selection
        const entryB = {
            id: 6, food: {id: 2, name: 'Carrots'}, unit: null, amount: 3,
            inventoryLocation: {id: 3, name: 'Garage', isFreezer: false},
            expires: null, subLocation: '',
        }
        ;(w.vm as any).inventoryEntry = entryB
        ;(w.vm as any).inventoryEntrySelected()
        ;(w.vm as any).amount = 5
        apiMock.apiInventoryEntryPartialUpdate.mockResolvedValue({...entryB, amount: 5})

        ;(w.vm as any).editEntry()
        await flushPromises()

        const [call] = apiMock.apiInventoryEntryPartialUpdate.mock.calls
        expect(call[0].id).toBe(6)
        expect(call[0].patchedInventoryEntry).not.toHaveProperty('inventoryLocation')
        expect(call[0].patchedInventoryEntry).toEqual({amount: 5})

        w.unmount()
    })

    // Consume moved into the Edit dialog per feedback (not a new per-row icon) — matches the
    // equivalent PantryBookingDialog.vue button.
    it('the Consume button zeroes the Amount field, ready for Save', async () => {
        const w = mountPage()
        await flushPromises()

        const entry = {
            id: 5, food: {id: 1, name: 'Peas'}, unit: null, amount: 4,
            inventoryLocation: {id: 1, name: 'Pantry', isFreezer: false},
            expires: null, subLocation: '',
        }
        ;(w.vm as any).bookingMode = 'edit'
        ;(w.vm as any).inventoryEntry = entry
        ;(w.vm as any).inventoryEntrySelected()
        await flushPromises()

        expect((w.vm as any).amount).toBe(4)

        const consumeBtn = w.find('[data-test="consume-lot-btn"]')
        expect(consumeBtn.exists()).toBe(true)
        await consumeBtn.trigger('click')

        expect((w.vm as any).amount).toBe(0)

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

    // Defect found post-UAT: Current Stock showed nothing at all until a Food or Location filter
    // was set, even though the Pantry page's own list never required a filter — confusing default
    // ("empty despite having stock"). loadItems() now always fetches (paginated, like Pantry).
    it('Current Stock loads the unfiltered paginated list by default, not an empty table', async () => {
        apiMock.apiInventoryEntryList.mockResolvedValue({
            results: [{
                id: 9, food: {id: 1, name: 'Peas'}, unit: null, amount: 2,
                inventoryLocation: {id: 1, name: 'Pantry', isFreezer: false},
                expires: null, code: 'ABC', subLocation: '',
            }],
            count: 1,
        })
        const w = mountPage()
        ;(w.vm as any).loadItems({page: 1, itemsPerPage: 10})
        await flushPromises()

        expect((w.vm as any).items).toHaveLength(1)
        const [call] = apiMock.apiInventoryEntryList.mock.calls
        expect(call[0]).not.toHaveProperty('foodId')
        expect(call[0]).not.toHaveProperty('inventoryLocationId')

        w.unmount()
    })

    // Defect found post-UAT: the snowflake freezer-expiry button on the Add form's Expires field
    // showed unconditionally, even for a non-freezer location — InventoryQuickAddDialog.vue gates
    // the equivalent button on `selectedLocationIsFreezer`, this page never did.
    it('only shows the freezer-expiry (snowflake) button on Expires when the selected location is a freezer', async () => {
        const w = mountPage()
        await flushPromises()

        expect(w.find('[data-test="freezer-expiry-btn"]').exists()).toBe(false)

        ;(w.vm as any).inventoryLocation = {id: 1, name: 'Pantry', isFreezer: false}
        await flushPromises()
        expect(w.find('[data-test="freezer-expiry-btn"]').exists()).toBe(false)

        ;(w.vm as any).inventoryLocation = {id: 2, name: 'Freezer', isFreezer: true}
        await flushPromises()
        expect(w.find('[data-test="freezer-expiry-btn"]').exists()).toBe(true)

        w.unmount()
    })

    // New defect found during UAT: the Current Stock table's Food-column expiry chip and the
    // Edit-mode "selected entry" summary card both formatted `expires` unconditionally, so a
    // lot with no expiry rendered a literal "Invalid DateTime" chip instead of showing nothing.
    it('does not render "Invalid DateTime" for a Current Stock entry with no expiry', async () => {
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

        expect(w.find('tbody').text()).not.toContain('Invalid DateTime')

        w.unmount()
    })

    it('does not render "Invalid DateTime" in the selected-entry summary card for a lot with no expiry', async () => {
        const w = mountPage()
        await flushPromises()

        ;(w.vm as any).inventoryEntry = {
            id: 9, food: {id: 1, name: 'Peas'}, unit: null, amount: 2,
            inventoryLocation: {id: 1, name: 'Pantry', isFreezer: false},
            expires: null, code: 'ABC', subLocation: '',
        }
        ;(w.vm as any).bookingMode = 'edit'
        await flushPromises()

        expect(w.text()).not.toContain('Invalid DateTime')

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
