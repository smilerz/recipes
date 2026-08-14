import {describe, it, expect, vi, beforeEach} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {ref} from 'vue'

import {apiMock, resetApiMock} from '../api-mock'

vi.mock('vue-router', () => ({
    useRoute: () => ({query: {}}),
    useRouter: () => ({push: vi.fn(), replace: vi.fn()}),
}))
vi.mock('@vueuse/router', () => ({useRouteQuery: (_k: string, d: any) => ref(d)}))
vi.mock('vue-i18n', () => ({useI18n: () => ({t: (k: string) => k})}))
vi.mock('@vueuse/core', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    useStorage: (_k: string, d: any) => ref(d),
    useClipboard: () => ({copy: vi.fn(), copied: ref(false)}),
    useWakeLock: () => ({request: vi.fn(), release: vi.fn()}),
}))
vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    ApiApi: class { constructor() { return apiMock } },
}))

import {useInventoryActions} from '@/composables/useInventoryActions'
import {useMessageStore} from '@/stores/MessageStore'

const LOCATIONS = [{id: 1, name: 'Kitchen', household: {id: 1, name: 'Home'}}]

describe('markOutToList', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        resetApiMock()
    })

    const t = (k: string) => k

    it('zeroes the lot amount and adds the food to the shopping list', async () => {
        apiMock.apiInventoryEntryPartialUpdate.mockResolvedValue({})
        apiMock.apiShoppingListEntryCreate.mockResolvedValue({id: 5})

        const {markOutToList} = useInventoryActions()
        const ok = await markOutToList({id: 7, food: {id: 42, name: 'Flour'}, amount: 3}, t)

        expect(ok).toBe(true)
        expect(apiMock.apiInventoryEntryPartialUpdate).toHaveBeenCalledWith(
            expect.objectContaining({id: 7, patchedInventoryEntry: expect.objectContaining({amount: 0})}),
        )
        expect(apiMock.apiShoppingListEntryCreate).toHaveBeenCalledWith(
            expect.objectContaining({shoppingListEntry: expect.objectContaining({food: expect.objectContaining({id: 42})})}),
        )
    })

    it('offers an undo action that restores the lot and removes the shopping entry', async () => {
        apiMock.apiInventoryEntryPartialUpdate.mockResolvedValue({})
        apiMock.apiShoppingListEntryCreate.mockResolvedValue({id: 5})
        apiMock.apiShoppingListEntryDestroy.mockResolvedValue({})

        const store = useMessageStore()
        const addSpy = vi.spyOn(store, 'addMessage')
        const onChange = vi.fn()

        const {markOutToList} = useInventoryActions()
        await markOutToList({id: 7, food: {id: 42, name: 'Flour'}, amount: 3}, t, onChange)

        const action = addSpy.mock.calls.at(-1)![4] as {label: string, callback: () => Promise<void>}
        expect(action.label).toBeTruthy()

        apiMock.apiInventoryEntryPartialUpdate.mockClear()
        await action.callback()

        // restores the original amount and deletes the shopping entry it created
        expect(apiMock.apiInventoryEntryPartialUpdate).toHaveBeenCalledWith(
            expect.objectContaining({id: 7, patchedInventoryEntry: expect.objectContaining({amount: 3})}),
        )
        expect(apiMock.apiShoppingListEntryDestroy).toHaveBeenCalledWith({id: 5})
        expect(onChange).toHaveBeenCalled()
    })

    it('returns false and does not add to the list when the zero-out fails', async () => {
        apiMock.apiInventoryEntryPartialUpdate.mockRejectedValue(new Error('boom'))

        const {markOutToList} = useInventoryActions()
        const ok = await markOutToList({id: 7, food: {id: 42, name: 'Flour'}, amount: 3}, t)

        expect(ok).toBe(false)
        expect(apiMock.apiShoppingListEntryCreate).not.toHaveBeenCalled()
    })

    it('rolls back the zeroed amount when adding to the shopping list fails', async () => {
        apiMock.apiInventoryEntryPartialUpdate.mockResolvedValueOnce({})
        apiMock.apiShoppingListEntryCreate.mockRejectedValue(new Error('boom'))

        const {markOutToList} = useInventoryActions()
        const ok = await markOutToList({id: 7, food: {id: 42, name: 'Flour'}, amount: 3}, t)

        expect(ok).toBe(false)
        // the lot must not be left permanently zeroed just because the shopping-list step failed
        expect(apiMock.apiInventoryEntryPartialUpdate).toHaveBeenLastCalledWith(
            expect.objectContaining({id: 7, patchedInventoryEntry: expect.objectContaining({amount: 3})}),
        )
    })
})

describe('quickPantryAdd (FR-H3 check-off → pantry)', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        resetApiMock()
    })
    const t = (k: string) => k

    it('QPA-01: adds the food at a location and announces with the entry expiry (FR-D6)', async () => {
        apiMock.apiInventoryLocationList.mockResolvedValue({results: LOCATIONS})
        apiMock.apiInventoryEntryCreate.mockResolvedValue({id: 9, expires: new Date('2026-07-20')})
        const store = useMessageStore()
        const addSpy = vi.spyOn(store, 'addMessage')

        const {quickPantryAdd} = useInventoryActions()
        const ok = await quickPantryAdd({id: 42, name: 'Milk'}, t)

        expect(ok).toBe(true)
        expect(apiMock.apiInventoryEntryCreate).toHaveBeenCalledWith(
            expect.objectContaining({inventoryEntry: expect.objectContaining({food: expect.objectContaining({id: 42})})}),
        )
        expect(apiMock.apiInventoryEntryStockUpCreate).not.toHaveBeenCalled()
        expect(addSpy).toHaveBeenCalled()  // FR-D6 announce
    })

    it('QPA-02: with no locations yet, falls back to stock-up so the backend auto-creates one', async () => {
        apiMock.apiInventoryLocationList.mockResolvedValue({results: []})
        apiMock.apiInventoryEntryStockUpCreate.mockResolvedValue(undefined)

        const {quickPantryAdd} = useInventoryActions()
        const ok = await quickPantryAdd({id: 42, name: 'Milk'}, t)

        expect(ok).toBe(true)
        expect(apiMock.apiInventoryEntryStockUpCreate).toHaveBeenCalledWith(
            expect.objectContaining({stockUp: expect.objectContaining({items: [expect.objectContaining({food: 42})]})}),
        )
        expect(apiMock.apiInventoryEntryCreate).not.toHaveBeenCalled()
    })

    it('QPA-04: with no saved default, adds at the lowest-id location (FR-B5 mirror)', async () => {
        apiMock.apiInventoryLocationList.mockResolvedValue({results: [
            {id: 5, name: 'Fridge', household: {id: 1, name: 'Home'}},
            {id: 2, name: 'Pantry', household: {id: 1, name: 'Home'}},
        ]})
        apiMock.apiInventoryEntryCreate.mockResolvedValue({id: 9})

        const {quickPantryAdd} = useInventoryActions()
        await quickPantryAdd({id: 42, name: 'Milk'}, t)

        expect(apiMock.apiInventoryEntryCreate).toHaveBeenCalledWith(
            expect.objectContaining({inventoryEntry: expect.objectContaining({inventoryLocation: expect.objectContaining({id: 2})})}),
        )
    })

    it('QPA-03: returns false and surfaces an error when the add fails', async () => {
        apiMock.apiInventoryLocationList.mockResolvedValue({results: LOCATIONS})
        apiMock.apiInventoryEntryCreate.mockRejectedValue(new Error('boom'))
        const store = useMessageStore()
        const errSpy = vi.spyOn(store, 'addError')

        const {quickPantryAdd} = useInventoryActions()
        const ok = await quickPantryAdd({id: 42, name: 'Milk'}, t)

        expect(ok).toBe(false)
        expect(errSpy).toHaveBeenCalled()
    })
})

describe('manageInventory', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        resetApiMock()
    })

    it('ICM-01: calls dialog.openManage with the food id', async () => {
        apiMock.apiInventoryLocationList.mockResolvedValue({results: LOCATIONS})
        const mockDialog = {openManage: vi.fn().mockResolvedValue({hasEntries: true})}
        const {manageInventory} = useInventoryActions()
        await manageInventory({id: 42, name: 'Flour'}, mockDialog as any, (k: string) => k)
        expect(mockDialog.openManage).toHaveBeenCalledWith(
            expect.objectContaining({foodId: 42})
        )
    })

    it('ICM-01: returns true when dialog reports hasEntries=true', async () => {
        apiMock.apiInventoryLocationList.mockResolvedValue({results: LOCATIONS})
        const mockDialog = {openManage: vi.fn().mockResolvedValue({hasEntries: true})}
        const {manageInventory} = useInventoryActions()
        const result = await manageInventory({id: 42, name: 'Flour'}, mockDialog as any, (k: string) => k)
        expect(result).toBe(true)
    })

    it('ICM-01: returns false when dialog reports hasEntries=false', async () => {
        apiMock.apiInventoryLocationList.mockResolvedValue({results: LOCATIONS})
        const mockDialog = {openManage: vi.fn().mockResolvedValue({hasEntries: false})}
        const {manageInventory} = useInventoryActions()
        const result = await manageInventory({id: 42, name: 'Flour'}, mockDialog as any, (k: string) => k)
        expect(result).toBe(false)
    })

    it('ICM-02: forwards the food name so manage-mode create sends a non-blank food.name', async () => {
        apiMock.apiInventoryLocationList.mockResolvedValue({results: LOCATIONS})
        const mockDialog = {openManage: vi.fn().mockResolvedValue({hasEntries: true})}
        const {manageInventory} = useInventoryActions()
        await manageInventory({id: 42, name: 'Flour'}, mockDialog as any, (k: string) => k)
        expect(mockDialog.openManage).toHaveBeenCalledWith(
            expect.objectContaining({foodName: 'Flour'})
        )
    })

    it('ICM-02: forwards location household so manage-mode create sends inventory_location.household', async () => {
        apiMock.apiInventoryLocationList.mockResolvedValue({results: LOCATIONS})
        const mockDialog = {openManage: vi.fn().mockResolvedValue({hasEntries: true})}
        const {manageInventory} = useInventoryActions()
        await manageInventory({id: 42, name: 'Flour'}, mockDialog as any, (k: string) => k)
        const arg = mockDialog.openManage.mock.calls[0][0]
        expect(arg.locations[0]).toEqual(
            expect.objectContaining({value: 1, household: {id: 1, name: 'Home'}})
        )
    })
})


describe('quickAddToInventory FR-D6 snackbar', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        resetApiMock()
    })

    const t = (k: string, params?: any) => (params ? `${k}:${JSON.stringify(params)}` : k)

    function fakeDialog() {
        return {open: vi.fn().mockResolvedValue({locationId: 1, amount: 1, unit: null}), openManage: vi.fn()}
    }

    it('announces the food and its (auto-set) expiry after a successful add', async () => {
        apiMock.apiInventoryLocationList.mockResolvedValue({results: LOCATIONS})
        apiMock.apiInventoryEntryCreate.mockResolvedValue({id: 99, expires: new Date('2026-07-21T00:00:00')})
        const store = useMessageStore()
        const addSpy = vi.spyOn(store, 'addMessage')

        const {quickAddToInventory} = useInventoryActions()
        const ok = await quickAddToInventory({id: 42, name: 'Milk'}, fakeDialog() as any, t)

        expect(ok).toBe(true)
        const msg = addSpy.mock.calls.find(c => JSON.stringify(c[1] ?? '').includes('AddedToPantry'))
        expect(msg).toBeTruthy()
        expect(JSON.stringify(msg![1])).toContain('Milk')
        expect(JSON.stringify(msg![1])).toContain('ExpiresOn')  // the expiry line is surfaced
    })

    it('announces without an expiry line when the lot is undated', async () => {
        apiMock.apiInventoryLocationList.mockResolvedValue({results: LOCATIONS})
        apiMock.apiInventoryEntryCreate.mockResolvedValue({id: 99, expires: null})
        const store = useMessageStore()
        const addSpy = vi.spyOn(store, 'addMessage')

        const {quickAddToInventory} = useInventoryActions()
        await quickAddToInventory({id: 42, name: 'Salt'}, fakeDialog() as any, t)

        const msg = addSpy.mock.calls.find(c => JSON.stringify(c[1] ?? '').includes('AddedToPantry'))
        expect(msg).toBeTruthy()
        expect(JSON.stringify(msg![1])).not.toContain('ExpiresOn')
    })
})
