// @vitest-environment node
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

import {usePantryBatchActions} from '@/composables/usePantryBatchActions'

const lot = (id: number, foodId: number, locationId = 1) => ({
    id, food: {id: foodId, name: `Food ${foodId}`}, inventoryLocation: {id: locationId, name: `Loc ${locationId}`},
}) as any

describe('usePantryBatchActions', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        resetApiMock()
    })

    describe('addFoodsToShopping', () => {
        it('adds each distinct food once, even when several selected lots share a food', async () => {
            apiMock.apiShoppingListEntryList.mockResolvedValue({count: 0, results: []})
            apiMock.apiShoppingListEntryCreate.mockResolvedValue({})
            const {addFoodsToShopping} = usePantryBatchActions()

            const result = await addFoodsToShopping([lot(1, 10), lot(2, 10), lot(3, 11)])

            expect(apiMock.apiShoppingListEntryCreate).toHaveBeenCalledTimes(2)
            expect(result).toEqual({added: 2, alreadyListed: 0, failed: 0})
        })

        it('skips foods already on the list and counts them', async () => {
            apiMock.apiShoppingListEntryList.mockImplementation(({food}: any) =>
                Promise.resolve(food === 10 ? {count: 1, results: [{}]} : {count: 0, results: []}))
            apiMock.apiShoppingListEntryCreate.mockResolvedValue({})
            const {addFoodsToShopping} = usePantryBatchActions()

            const result = await addFoodsToShopping([lot(1, 10), lot(3, 11)])

            expect(apiMock.apiShoppingListEntryCreate).toHaveBeenCalledTimes(1)
            expect(result).toEqual({added: 1, alreadyListed: 1, failed: 0})
        })

        it('counts a failed add without stopping the rest', async () => {
            apiMock.apiShoppingListEntryList.mockResolvedValue({count: 0, results: []})
            apiMock.apiShoppingListEntryCreate.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({})
            const {addFoodsToShopping} = usePantryBatchActions()

            const result = await addFoodsToShopping([lot(1, 10), lot(3, 11)])

            expect(result).toEqual({added: 1, alreadyListed: 0, failed: 1})
        })
    })

    describe('moveLots', () => {
        it('patches only the location of each lot that is not already there', async () => {
            apiMock.apiInventoryEntryPartialUpdate.mockResolvedValue({})
            const {moveLots} = usePantryBatchActions()
            const target = {id: 2, name: 'Fridge'} as any

            const result = await moveLots([lot(1, 10, 1), lot(2, 11, 2), lot(3, 12, 1)], target)

            expect(apiMock.apiInventoryEntryPartialUpdate).toHaveBeenCalledTimes(2)
            expect(apiMock.apiInventoryEntryPartialUpdate.mock.calls.map(c => c[0].id).sort()).toEqual([1, 3])
            expect(apiMock.apiInventoryEntryPartialUpdate.mock.calls[0][0].patchedInventoryEntry).toEqual({inventoryLocation: target})
            expect(result).toEqual({updated: 2, failed: 0})
        })

        it('counts failures and keeps going', async () => {
            apiMock.apiInventoryEntryPartialUpdate.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({})
            const {moveLots} = usePantryBatchActions()

            const result = await moveLots([lot(1, 10, 1), lot(3, 12, 1)], {id: 2, name: 'Fridge'} as any)

            expect(result).toEqual({updated: 1, failed: 1})
        })
    })

    describe('setLotsExpiry', () => {
        it('patches only expires, at local noon of the picked day', async () => {
            apiMock.apiInventoryEntryPartialUpdate.mockResolvedValue({})
            const {setLotsExpiry} = usePantryBatchActions()

            const result = await setLotsExpiry([lot(1, 10), lot(2, 11)], new Date(2027, 5, 15))

            expect(apiMock.apiInventoryEntryPartialUpdate).toHaveBeenCalledTimes(2)
            const patch = apiMock.apiInventoryEntryPartialUpdate.mock.calls[0][0].patchedInventoryEntry
            expect(Object.keys(patch)).toEqual(['expires'])
            expect([patch.expires.getFullYear(), patch.expires.getMonth(), patch.expires.getDate(), patch.expires.getHours()]).toEqual([2027, 5, 15, 12])
            expect(result).toEqual({updated: 2, failed: 0})
        })

        it('clears the expiry with null', async () => {
            apiMock.apiInventoryEntryPartialUpdate.mockResolvedValue({})
            const {setLotsExpiry} = usePantryBatchActions()

            await setLotsExpiry([lot(1, 10)], null)

            expect(apiMock.apiInventoryEntryPartialUpdate.mock.calls[0][0].patchedInventoryEntry).toEqual({expires: null})
        })
    })
})
