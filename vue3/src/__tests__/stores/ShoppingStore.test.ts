import { describe, it, expect, beforeEach, vi } from 'vitest'
import { watch, nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { makeShoppingListEntry, makeFoodShopping, makeSupermarketCategory } from '@/__tests__/factories'
import { apiMock, resetApiMock } from '@/__tests__/api-mock'

vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    ApiApi: class { constructor() { return apiMock } },
    ResponseError: class extends Error { response: any; constructor(r: any) { super(); this.response = r } },
}))

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('vuetify', async (importOriginal) => ({
    ...(await importOriginal<typeof import('vuetify')>()),
    useTheme: () => ({ change: vi.fn() }),
}))

vi.mock('vue-router', () => ({
    useRouter: () => ({ push: vi.fn().mockResolvedValue(undefined) }),
}))

vi.mock('@vueuse/router', () => ({
    useRouteQuery: () => ({ value: false }),
}))

vi.mock('@vueuse/core', async () => {
    const { ref } = await import('vue')
    return {
        useStorage: (_key: string, defaultValue: any) => ref(defaultValue),
    }
})

import { useShoppingStore } from '@/stores/ShoppingStore'

describe('ShoppingStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        resetApiMock()
    })

    describe('initial state', () => {
        it('starts uninitialized with empty entries', () => {
            const store = useShoppingStore()
            expect(store.initialized).toBe(false)
            expect(store.entries.size).toBe(0)
            expect(store.totalFoods).toBe(0)
        })
    })

    describe('refreshFromAPI', () => {
        it('loads entries from API and sets initialized', async () => {
            const store = useShoppingStore()
            const entry = makeShoppingListEntry({ id: 1 })

            apiMock.apiShoppingListEntryList.mockResolvedValue({
                results: [entry],
                count: 1,
                next: null,
            })
            apiMock.apiSupermarketCategoryList.mockResolvedValue({ results: [] })
            apiMock.apiSupermarketList.mockResolvedValue({ results: [] })

            store.refreshFromAPI()

            await vi.waitFor(() => {
                expect(store.initialized).toBe(true)
            })

            expect(store.entries.size).toBe(1)
            expect(store.entries.get(1)).toEqual(entry)
        })
    })

    describe('createObject', () => {
        it('adds created entry to store', async () => {
            const store = useShoppingStore()
            const entry = makeShoppingListEntry({ id: 42 })

            apiMock.apiShoppingListEntryCreate.mockResolvedValue(entry)

            const result = await store.createObject(entry, false)

            expect(result).toEqual(entry)
            expect(store.entries.get(42)).toEqual(entry)
        })

        it('registers undo when requested', async () => {
            const store = useShoppingStore()
            const entry = makeShoppingListEntry({ id: 42 })

            apiMock.apiShoppingListEntryCreate.mockResolvedValue(entry)

            await store.createObject(entry, true)

            expect(store.undoStack.length).toBe(1)
            expect(store.undoStack[0].type).toBe('CREATE')
        })
    })

    describe('deleteObject', () => {
        it('removes entry from store', async () => {
            const store = useShoppingStore()
            const entry = makeShoppingListEntry({ id: 10 })
            store.entries.set(10, entry)

            apiMock.apiShoppingListEntryDestroy.mockResolvedValue(undefined)

            await store.deleteObject(entry, false)

            expect(store.entries.has(10)).toBe(false)
        })

        // D01: deleting an entry must NOTIFY the displayed structure (entriesByGroup) so the row
        // leaves the screen — not just mutate it in place on a shallowRef (no re-render). The
        // reproducible case: a food with several entries; deleting one takes the size>0 path, which
        // never calls triggerRef, so the display never updates until a full refresh.
        it('notifies entriesByGroup reactivity when deleting one of a food\'s entries (D01)', async () => {
            const store = useShoppingStore()
            const food = makeFoodShopping({ id: 5 })
            const e10 = makeShoppingListEntry({ id: 10, food })
            const e11 = makeShoppingListEntry({ id: 11, food })
            store.entries.set(10, e10)
            store.entries.set(11, e11)
            store.updateEntriesStructure()

            let fired = 0
            const stop = watch(() => store.entriesByGroup, () => { fired++ })

            apiMock.apiShoppingListEntryDestroy.mockResolvedValue(undefined)
            await store.deleteObject(e10, false)
            await nextTick()
            stop()

            expect(fired).toBeGreaterThan(0)
        })
    })

    describe('hasFailedItems', () => {
        it('returns false when sync queue is empty', () => {
            const store = useShoppingStore()
            expect(store.hasFailedItems()).toBe(false)
        })
    })

    describe('getFlatEntries', () => {
        it('returns empty array when no entries', () => {
            const store = useShoppingStore()
            expect(store.getFlatEntries()).toEqual([])
        })
    })

    describe('getEntriesStructure', () => {
        it('sorts categories alphabetically on the fallback (no-selected-supermarket) branch', async () => {
            // shopping_selected_supermarket defaults to null, so this always hits the
            // fallback branch (the one that lost its .sort() call) regardless of grouping mode.
            const store = useShoppingStore()
            const entries = [
                makeShoppingListEntry({id: 1, food: makeFoodShopping({id: 1, supermarketCategory: makeSupermarketCategory({name: 'Zucchini'})})}),
                makeShoppingListEntry({id: 2, food: makeFoodShopping({id: 2, supermarketCategory: makeSupermarketCategory({name: 'Apples'})})}),
                makeShoppingListEntry({id: 3, food: makeFoodShopping({id: 3, supermarketCategory: makeSupermarketCategory({name: 'Mangoes'})})}),
            ]
            apiMock.apiShoppingListEntryList.mockResolvedValue({results: entries, count: 3, next: null})
            apiMock.apiSupermarketCategoryList.mockResolvedValue({results: []})
            apiMock.apiSupermarketList.mockResolvedValue({results: []})

            store.refreshFromAPI()
            await vi.waitFor(() => { expect(store.initialized).toBe(true) })

            const structure = store.getEntriesStructure()
            expect(structure.map(c => c.name)).toEqual(['Apples', 'Mangoes', 'Zucchini'])
        })
    })

    describe('loadShoppingLists', () => {
        it('loads shopping lists from API', async () => {
            const store = useShoppingStore()
            apiMock.apiShoppingListList.mockResolvedValue({
                results: [{ id: 1, name: 'Weekly' }],
            })

            store.loadShoppingLists()

            await vi.waitFor(() => {
                expect(store.shoppingLists.length).toBe(1)
            })
        })
    })
})
