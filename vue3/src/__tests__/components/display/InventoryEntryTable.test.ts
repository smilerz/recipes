import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { apiMock, resetApiMock } from '@/__tests__/api-mock'
import { mountPage } from '@/__tests__/pages/page-mount-helper'

vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    ApiApi: class { constructor() { return apiMock } },
}))

import InventoryEntryTable from '@/components/display/InventoryEntryTable.vue'

function entry(over: Record<string, any>) {
    return {
        id: 1, amount: 1, unit: null, subLocation: null,
        food: { id: 10, name: 'Food' },
        inventoryLocation: { id: 1, name: 'Pantry', isFreezer: false },
        expires: null,
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
