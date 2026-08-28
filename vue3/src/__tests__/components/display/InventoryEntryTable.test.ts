import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { apiMock, resetApiMock } from '@/__tests__/api-mock'
import { mountPage } from '@/__tests__/pages/page-mount-helper'

vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    ApiApi: class { constructor() { return apiMock } },
}))

// useMessageStore()'s Pinia store calls useI18n() internally on first-ever access, which only
// works synchronously inside a component setup() — the Open/un-open handlers call it from inside
// an async .then()/.catch(), so a real, never-warmed-up store throws here. Stub it out, same as
// InventoryQuickAddDialog.test.ts does for the same reason.
const {addErrorMock, addMessageMock} = vi.hoisted(() => ({addErrorMock: vi.fn(), addMessageMock: vi.fn()}))
vi.mock('@/stores/MessageStore', async (imp) => ({
    ...(await imp<any>()),
    useMessageStore: () => ({addError: addErrorMock, addMessage: addMessageMock}),
}))

import InventoryEntryTable from '@/components/display/InventoryEntryTable.vue'

function entry(over: Record<string, any>) {
    return {
        id: 1, amount: 1, unit: null, subLocation: null,
        food: { id: 10, name: 'Food', shelfLifeDaysOpened: 5 },
        inventoryLocation: { id: 1, name: 'Pantry', isFreezer: false },
        expires: null,
        openedAt: null,
        ...over,
    }
}

describe('InventoryEntryTable — grouped pantry view', () => {
    beforeEach(() => {
        resetApiMock()
    })

    it('fetches all entries at once (bespoke grouped view, no server pagination)', async () => {
        apiMock.apiInventoryEntryList.mockResolvedValue({ results: [], count: 0 })
        mountPage(InventoryEntryTable)
        await flushPromises()

        // the table loads all entries in one page-500 call; the mounted PantryBookingDialog's
        // own InventoryEntry picker also hits this endpoint, so target the table's call specifically
        const tableCall = apiMock.apiInventoryEntryList.mock.calls.map(c => c[0]).find(p => p.pageSize === 500)
        expect(tableCall).toBeTruthy()
        expect(tableCall!.page).toBeUndefined()
    })

    it('splits entries into Expiring soon and In stock groups', async () => {
        const soon = new Date(); soon.setDate(soon.getDate() + 1)
        const later = new Date(); later.setDate(later.getDate() + 30)
        apiMock.apiInventoryEntryList.mockResolvedValue({
            results: [
                entry({ id: 1, food: { id: 10, name: 'Milk' }, expires: soon }),
                entry({ id: 2, food: { id: 11, name: 'Rice' }, expires: later }),
            ],
            count: 2,
        })

        const wrapper = mountPage(InventoryEntryTable)
        await flushPromises()

        const text = wrapper.text()
        expect(text).toContain('Milk')
        expect(text).toContain('Rice')
        expect(text).toContain('ExpiringSoon')
        expect(text).toContain('InStock')
    })

    // Regression: an already-expired lot was previously lumped into the "Expiring Soon" section
    // instead of getting its own "Expired" section, understating how overdue it actually was.
    it('puts an already-expired lot under Expired, separate from Expiring Soon', async () => {
        const expired = new Date(); expired.setDate(expired.getDate() - 20)
        const soon = new Date(); soon.setDate(soon.getDate() + 1)
        apiMock.apiInventoryEntryList.mockResolvedValue({
            results: [
                entry({ id: 1, food: { id: 10, name: 'Old Yogurt' }, expires: expired }),
                entry({ id: 2, food: { id: 11, name: 'Fresh Milk' }, expires: soon }),
            ],
            count: 2,
        })

        const wrapper = mountPage(InventoryEntryTable)
        await flushPromises()

        const text = wrapper.text()
        expect(text).toContain('Expired')
        expect(text).toContain('ExpiringSoon')

        const expiredSectionIndex = text.indexOf('Expired')
        const expiringSectionIndex = text.indexOf('ExpiringSoon')
        const oldYogurtIndex = text.indexOf('Old Yogurt')
        const freshMilkIndex = text.indexOf('Fresh Milk')

        // "Old Yogurt" (expired) falls between the Expired heading and the ExpiringSoon heading
        expect(oldYogurtIndex).toBeGreaterThan(expiredSectionIndex)
        expect(oldYogurtIndex).toBeLessThan(expiringSectionIndex)
        // "Fresh Milk" (soon) falls after the ExpiringSoon heading
        expect(freshMilkIndex).toBeGreaterThan(expiringSectionIndex)
    })

    // #11: an opened (or otherwise dated) lot moved into a freezer whose food has no
    // shelf_life_days_frozen configured keeps whatever stale pre-freeze date it had — the backend
    // deliberately never clears it (nothing better to suggest), but the display must not treat that
    // stale date as live: it should read as "no known expiry", not silently count down (or even show
    // "Expired") for something that's actually safely frozen.
    it('shows no date (not a stale one) for a frozen lot whose food has no frozen shelf life configured', async () => {
        const staleExpired = new Date(); staleExpired.setDate(staleExpired.getDate() - 20)
        apiMock.apiInventoryEntryList.mockResolvedValue({
            results: [
                entry({
                    id: 1, food: { id: 10, name: 'Salsa', shelfLifeDaysFrozen: null },
                    inventoryLocation: { id: 1, name: 'Freezer', isFreezer: true },
                    expires: staleExpired,
                }),
            ],
            count: 1,
        })

        const wrapper = mountPage(InventoryEntryTable)
        await flushPromises()

        const text = wrapper.text()
        expect(text).toContain('Salsa')
        expect(text).toContain('InStock')  // not Expired, not ExpiringSoon
        expect(text).not.toContain('Expired')
        expect(text).not.toContain('ExpiringSoon')
    })

    it('still shows the real computed date for a frozen lot whose food DOES have a frozen shelf life configured', async () => {
        const frozenDate = new Date(); frozenDate.setDate(frozenDate.getDate() + 180)
        apiMock.apiInventoryEntryList.mockResolvedValue({
            results: [
                entry({
                    id: 1, food: { id: 10, name: 'Peas', shelfLifeDaysFrozen: 180 },
                    inventoryLocation: { id: 1, name: 'Freezer', isFreezer: true },
                    expires: frozenDate,
                }),
            ],
            count: 1,
        })

        const wrapper = mountPage(InventoryEntryTable)
        await flushPromises()

        const text = wrapper.text()
        expect(text).toContain('Peas')
        expect(text).toContain('InStock')
        expect(text).not.toContain('—')
    })
})

describe('InventoryEntryTable — opened lifecycle', () => {
    beforeEach(() => {
        resetApiMock()
    })

    it('shows an enabled Open action for a lot that has not been opened', async () => {
        apiMock.apiInventoryEntryList.mockResolvedValue({ results: [entry({ id: 1 })], count: 1 })
        const wrapper = mountPage(InventoryEntryTable)
        await flushPromises()

        expect(wrapper.find('[data-test="open-lot-1"]').isVisible()).toBe(true)
        expect(wrapper.find('[data-test="open-lot-1"]').classes()).not.toContain('open-lot-btn--inactive')
        expect(wrapper.find('[data-test="opened-chip-1"]').exists()).toBe(false)
    })

    // The Open button always stays visible AND present (muted, not hidden or removed) so the
    // row's action icons never shift position or count row to row, and a muted control reads as
    // a clear, continuous UI state rather than an unexplained gap in the button group. Not
    // natively `:disabled` — see openLot()'s comment.
    it('shows an Opened chip and a muted (not hidden) Open action for an already-opened lot', async () => {
        apiMock.apiInventoryEntryList.mockResolvedValue({
            results: [entry({ id: 1, openedAt: new Date('2026-08-01') })], count: 1,
        })
        const wrapper = mountPage(InventoryEntryTable)
        await flushPromises()

        const openBtn = wrapper.find('[data-test="open-lot-1"]')
        expect(openBtn.isVisible()).toBe(true)
        expect(openBtn.classes()).toContain('open-lot-btn--inactive')
        expect(wrapper.find('[data-test="opened-chip-1"]').exists()).toBe(true)
    })

    it('shows a muted Open action, with an explanatory title, for a food with no configured opened shelf life', async () => {
        apiMock.apiInventoryEntryList.mockResolvedValue({
            results: [entry({ id: 1, food: { id: 10, name: 'Salt', shelfLifeDaysOpened: null } })], count: 1,
        })
        const wrapper = mountPage(InventoryEntryTable)
        await flushPromises()

        const openBtn = wrapper.find('[data-test="open-lot-1"]')
        expect(openBtn.isVisible()).toBe(true)
        expect(openBtn.classes()).toContain('open-lot-btn--inactive')
        expect(openBtn.attributes('title')).toBe('OpenNotApplicable')
    })

    // A native `:disabled` button can't receive any click/tap event at all — desktop or mobile —
    // so the explanation was only ever reachable via the native `title` attribute's hover-only
    // browser tooltip. Open is no longer natively disabled: tapping it now explains via toast.
    it('tapping a non-actionable Open button explains why via a toast, instead of calling the API', async () => {
        apiMock.apiInventoryEntryList.mockResolvedValue({
            results: [entry({ id: 1, food: { id: 10, name: 'Salt', shelfLifeDaysOpened: null } })], count: 1,
        })
        const wrapper = mountPage(InventoryEntryTable)
        await flushPromises()

        await wrapper.find('[data-test="open-lot-1"]').trigger('click')
        await flushPromises()

        expect(apiMock.apiInventoryEntryOpenCreate).not.toHaveBeenCalled()
        expect(addMessageMock).toHaveBeenLastCalledWith(expect.anything(), 'OpenNotApplicable', expect.anything())
    })

    it('clicking Open calls the open action and updates the row', async () => {
        apiMock.apiInventoryEntryList.mockResolvedValue({ results: [entry({ id: 1 })], count: 1 })
        apiMock.apiInventoryEntryOpenCreate.mockResolvedValue(
            entry({ id: 1, openedAt: new Date('2026-08-10'), expires: new Date('2026-08-13') }),
        )
        const wrapper = mountPage(InventoryEntryTable)
        await flushPromises()

        await wrapper.find('[data-test="open-lot-1"]').trigger('click')
        await flushPromises()

        expect(apiMock.apiInventoryEntryOpenCreate).toHaveBeenCalledWith({ id: 1 })
        expect(wrapper.find('[data-test="opened-chip-1"]').exists()).toBe(true)
        expect(wrapper.find('[data-test="open-lot-1"]').classes()).toContain('open-lot-btn--inactive')
    })

    // Regression: the "still frozen" message used to be keyed off r.expires truthiness instead of
    // actual freezer status, so it could fire for a non-frozen item too (e.g. opening a food with
    // no configured opened shelf life, back when Open was still shown for those).
    it('shows the still-frozen message when opening a lot that is actually in the freezer', async () => {
        apiMock.apiInventoryEntryList.mockResolvedValue({
            results: [entry({ id: 1, inventoryLocation: { id: 1, name: 'Freezer', isFreezer: true } })], count: 1,
        })
        apiMock.apiInventoryEntryOpenCreate.mockResolvedValue(
            entry({ id: 1, openedAt: new Date('2026-08-10'), expires: new Date('2027-08-10'), inventoryLocation: { id: 1, name: 'Freezer', isFreezer: true } }),
        )
        const wrapper = mountPage(InventoryEntryTable)
        await flushPromises()

        await wrapper.find('[data-test="open-lot-1"]').trigger('click')
        await flushPromises()

        expect(addMessageMock).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({ text: 'OpenedStillFrozen' }),
            expect.anything(),
        )
    })

    it('shows the expiry-updated message (not still-frozen) when opening a lot in a non-freezer location', async () => {
        apiMock.apiInventoryEntryList.mockResolvedValue({
            results: [entry({ id: 1, inventoryLocation: { id: 1, name: 'Fridge', isFreezer: false } })], count: 1,
        })
        apiMock.apiInventoryEntryOpenCreate.mockResolvedValue(
            entry({ id: 1, openedAt: new Date('2026-08-10'), expires: new Date('2026-08-15'), inventoryLocation: { id: 1, name: 'Fridge', isFreezer: false } }),
        )
        const wrapper = mountPage(InventoryEntryTable)
        await flushPromises()

        await wrapper.find('[data-test="open-lot-1"]').trigger('click')
        await flushPromises()

        expect(addMessageMock).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({ text: expect.stringContaining('OpenedExpiryUpdated') }),
            expect.anything(),
        )
    })

    it('clicking the Opened chip close icon calls the un-open action and updates the row', async () => {
        apiMock.apiInventoryEntryList.mockResolvedValue({
            results: [entry({ id: 1, openedAt: new Date('2026-08-01'), expires: new Date('2026-08-04') })], count: 1,
        })
        apiMock.apiInventoryEntryOpenDestroy.mockResolvedValue(
            entry({ id: 1, openedAt: null, expires: new Date('2026-08-20') }),
        )
        const wrapper = mountPage(InventoryEntryTable)
        await flushPromises()

        await wrapper.find('[data-test="opened-chip-1"] .v-chip__close').trigger('click')
        await flushPromises()

        expect(apiMock.apiInventoryEntryOpenDestroy).toHaveBeenCalledWith({ id: 1 })
        expect(wrapper.find('[data-test="opened-chip-1"]').exists()).toBe(false)
        expect(wrapper.find('[data-test="open-lot-1"]').isVisible()).toBe(true)
    })
})

// #9: History/Open/Remove/Move were the only row actions — no way to directly correct an
// existing lot's amount/unit without subtract-then-re-add. Edit opens the shared
// PantryBookingDialog in its new 'edit' mode (see PantryBookingDialog.test.ts for the actual
// PATCH behavior); this only proves the row wires the click through to the right dialog state.
describe('InventoryEntryTable — direct edit action (#9)', () => {
    beforeEach(() => {
        resetApiMock()
    })

    it('clicking Edit opens the booking dialog in edit mode for the correct entry', async () => {
        apiMock.apiInventoryEntryList.mockResolvedValue({ results: [entry({ id: 1 })], count: 1 })
        // opening PantryBookingDialog with an inventoryEntryId re-fetches the entry
        apiMock.apiInventoryEntryRetrieve.mockResolvedValue(entry({ id: 1 }))
        const wrapper = mountPage(InventoryEntryTable)
        await flushPromises()

        await wrapper.find('[data-test="edit-lot-1"]').trigger('click')
        await flushPromises()

        expect((wrapper.vm as any).bookingMode).toBe('edit')
        expect((wrapper.vm as any).bookingEntry?.id).toBe(1)
        expect((wrapper.vm as any).bookingDialog).toBe(true)
    })
})

// #12: the pantry table had no user-controllable sort — each group used a fixed comparator
// (name for In Stock). onSortSelect() lets the user override every group uniformly.
describe('InventoryEntryTable — sort control (#12)', () => {
    beforeEach(() => {
        resetApiMock()
    })

    function foodNames(wrapper: ReturnType<typeof mountPage>) {
        return wrapper.findAll('tbody tr').map(r => r.find('td').text())
    }

    it('defaults to sorting In Stock alphabetically by name, unchanged from before #12', async () => {
        apiMock.apiInventoryEntryList.mockResolvedValue({
            results: [
                entry({ id: 1, food: { id: 10, name: 'Zucchini' } }),
                entry({ id: 2, food: { id: 11, name: 'Apple' } }),
            ], count: 2,
        })
        const wrapper = mountPage(InventoryEntryTable)
        await flushPromises()

        expect(foodNames(wrapper)).toEqual(['Apple', 'Zucchini'])
    })

    it('selecting Amount sorts all groups by amount ascending', async () => {
        apiMock.apiInventoryEntryList.mockResolvedValue({
            results: [
                entry({ id: 1, amount: 5, food: { id: 10, name: 'Zucchini' } }),
                entry({ id: 2, amount: 1, food: { id: 11, name: 'Apple' } }),
            ], count: 2,
        })
        const wrapper = mountPage(InventoryEntryTable)
        await flushPromises()

        ;(wrapper.vm as any).onSortSelect('amount')
        await flushPromises()

        expect(foodNames(wrapper)).toEqual(['Apple', 'Zucchini'])
    })

    it('selecting the same field again toggles to descending order', async () => {
        apiMock.apiInventoryEntryList.mockResolvedValue({
            results: [
                entry({ id: 1, amount: 5, food: { id: 10, name: 'Zucchini' } }),
                entry({ id: 2, amount: 1, food: { id: 11, name: 'Apple' } }),
            ], count: 2,
        })
        const wrapper = mountPage(InventoryEntryTable)
        await flushPromises()

        ;(wrapper.vm as any).onSortSelect('amount')
        ;(wrapper.vm as any).onSortSelect('amount')
        await flushPromises()

        expect(foodNames(wrapper)).toEqual(['Zucchini', 'Apple'])
    })
})
