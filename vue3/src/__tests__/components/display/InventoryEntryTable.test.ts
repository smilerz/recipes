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
        food: { id: 10, name: 'Food' },
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
})

describe('InventoryEntryTable — opened lifecycle', () => {
    beforeEach(() => {
        resetApiMock()
    })

    it('shows an Open action for a lot that has not been opened', async () => {
        apiMock.apiInventoryEntryList.mockResolvedValue({ results: [entry({ id: 1 })], count: 1 })
        const wrapper = mountPage(InventoryEntryTable)
        await flushPromises()

        expect(wrapper.find('[data-test="open-lot-1"]').exists()).toBe(true)
        expect(wrapper.find('[data-test="opened-chip-1"]').exists()).toBe(false)
    })

    it('shows an Opened chip (not the Open action) for an already-opened lot', async () => {
        apiMock.apiInventoryEntryList.mockResolvedValue({
            results: [entry({ id: 1, openedAt: new Date('2026-08-01') })], count: 1,
        })
        const wrapper = mountPage(InventoryEntryTable)
        await flushPromises()

        expect(wrapper.find('[data-test="open-lot-1"]').exists()).toBe(false)
        expect(wrapper.find('[data-test="opened-chip-1"]').exists()).toBe(true)
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
        expect(wrapper.find('[data-test="open-lot-1"]').exists()).toBe(false)
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
        expect(wrapper.find('[data-test="open-lot-1"]').exists()).toBe(true)
    })
})
