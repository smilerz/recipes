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
import { useUserPreferenceStore } from '@/stores/UserPreferenceStore'

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

    // Batch actions on a selection: each entry is saved on its own (there is no bulk amount endpoint).
    describe('scaleEntries', () => {
        beforeEach(() => {
            apiMock.apiShoppingListEntryUpdate.mockImplementation(async ({ shoppingListEntry }: any) => shoppingListEntry)
        })

        it('multiplies the amount of every entry and saves each one', async () => {
            const store = useShoppingStore()
            const a = makeShoppingListEntry({ id: 1, amount: 2 })
            const b = makeShoppingListEntry({ id: 2, amount: 3 })

            await store.scaleEntries([a, b], 2, false)

            expect(apiMock.apiShoppingListEntryUpdate).toHaveBeenCalledWith({ id: 1, shoppingListEntry: expect.objectContaining({ amount: 4 }) })
            expect(apiMock.apiShoppingListEntryUpdate).toHaveBeenCalledWith({ id: 2, shoppingListEntry: expect.objectContaining({ amount: 6 }) })
        })

        it('rebuilds the grouped list so the lines show the new amounts, and again when undone', async () => {
            const store = useShoppingStore()
            const a = makeShoppingListEntry({ id: 1, amount: 2, food: makeFoodShopping({ id: 5 }) })
            store.entries.set(1, a)
            store.updateEntriesStructure()
            const before = store.entriesByGroup

            await store.scaleEntries([a], 2, true)
            const afterScale = store.entriesByGroup
            expect(afterScale).not.toBe(before)

            store.undoChange()
            expect(store.entriesByGroup).not.toBe(afterScale)
        })

        it('registers an undo that restores the exact original amounts', async () => {
            const store = useShoppingStore()
            const a = makeShoppingListEntry({ id: 1, amount: 0.3 })

            await store.scaleEntries([a], 3, true)
            expect(store.undoStack.length).toBe(1)
            expect(store.undoStack[0].type).toBe('SCALE')

            apiMock.apiShoppingListEntryUpdate.mockClear()
            store.undoChange()
            await vi.waitFor(() => {
                expect(apiMock.apiShoppingListEntryUpdate).toHaveBeenCalledWith({ id: 1, shoppingListEntry: expect.objectContaining({ amount: 0.3 }) })
            })
        })
    })

    // The screen reads the grouped list, which is only rebuilt on request. Postponing used to update the
    // entries but never rebuild it, so postponed items stayed visible although delayed items are hidden.
    describe('delayEntries', () => {
        const foodsShown = (store: ReturnType<typeof useShoppingStore>) => store.entriesByGroup.reduce((n, c) => n + c.foods.size, 0)

        beforeEach(() => {
            const settings = useUserPreferenceStore().deviceSettings
            settings.shopping_show_delayed_entries = false
            settings.shopping_show_checked_entries = false
            useUserPreferenceStore().userSettings.defaultDelay = 4
            apiMock.apiShoppingListEntryUpdate.mockImplementation(async ({ shoppingListEntry }: any) => shoppingListEntry)
        })

        it('takes postponed entries out of the grouped list right away when delayed entries are hidden', () => {
            const store = useShoppingStore()
            const entry = makeShoppingListEntry({ id: 1, food: makeFoodShopping({ id: 5 }) })
            store.entries.set(1, entry)
            store.updateEntriesStructure()
            expect(foodsShown(store)).toBe(1)

            store.delayEntries([entry], true, false)

            expect(foodsShown(store)).toBe(0)
        })

        it('brings them back when the postponement is undone', () => {
            const store = useShoppingStore()
            const entry = makeShoppingListEntry({ id: 1, food: makeFoodShopping({ id: 5 }) })
            store.entries.set(1, entry)
            store.updateEntriesStructure()

            store.delayEntries([entry], true, true)
            expect(foodsShown(store)).toBe(0)

            store.undoChange()
            expect(foodsShown(store)).toBe(1)
        })
    })

    // History: undo steps back through the actions; a note such as "added to the pantry" is listed but cannot
    // be undone, so it stays put and is skipped.
    describe('undo history', () => {
        const delayed = (e: any) => e.delayUntil && e.delayUntil.getFullYear() > 1970

        beforeEach(() => {
            apiMock.apiShoppingListEntryUpdate.mockImplementation(async ({ shoppingListEntry }: any) => shoppingListEntry)
        })

        it('canUndo ignores notes that cannot be undone', () => {
            const store = useShoppingStore()
            expect(store.canUndo).toBe(false)

            store.registerNote('PANTRY_ADD', 3)
            expect(store.undoStack.length).toBe(1)
            expect(store.canUndo).toBe(false)

            store.undoStack.push({ type: 'DELAY', entries: [] } as any)
            expect(store.canUndo).toBe(true)
        })

        it('undoChange undoes the newest undoable action and leaves a note in place', () => {
            const store = useShoppingStore()
            const e = makeShoppingListEntry({ id: 1, delayUntil: new Date(Date.now() + 3600_000) })
            store.entries.set(1, e)
            store.undoStack.push({ type: 'DELAY', entries: [e] } as any)
            store.registerNote('PANTRY_ADD', 3)

            store.undoChange()

            expect(delayed(e)).toBe(false)
            expect(store.undoStack.map(i => i.type)).toEqual(['PANTRY_ADD'])
        })

        it('undoUntil steps back through the chosen action, newest first, skipping notes', () => {
            const store = useShoppingStore()
            const a = makeShoppingListEntry({ id: 1, delayUntil: new Date(Date.now() + 3600_000) })
            const b = makeShoppingListEntry({ id: 2, delayUntil: new Date(Date.now() + 3600_000) })
            const c = makeShoppingListEntry({ id: 3, delayUntil: new Date(Date.now() + 3600_000) })
            ;[a, b, c].forEach(e => store.entries.set(e.id!, e))
            store.undoStack.push({ type: 'DELAY', entries: [a] } as any)   // 0
            store.undoStack.push({ type: 'DELAY', entries: [b] } as any)   // 1
            store.registerNote('PANTRY_ADD', 2)                            // 2
            store.undoStack.push({ type: 'DELAY', entries: [c] } as any)   // 3

            store.undoUntil(1)

            expect(delayed(c)).toBe(false)
            expect(delayed(b)).toBe(false)
            expect(delayed(a)).toBe(true)
            expect(store.undoStack.map(i => i.type)).toEqual(['DELAY', 'PANTRY_ADD'])
        })

        it('undoUntil on a note changes nothing', () => {
            const store = useShoppingStore()
            const a = makeShoppingListEntry({ id: 1, delayUntil: new Date(Date.now() + 3600_000) })
            store.entries.set(1, a)
            store.registerNote('PANTRY_ADD', 2)
            store.undoStack.push({ type: 'DELAY', entries: [a] } as any)

            store.undoUntil(0)

            expect(delayed(a)).toBe(true)
            expect(store.undoStack.length).toBe(2)
        })

        it('undoes adding lists by removing only the lists each entry gained', async () => {
            const store = useShoppingStore()
            const weekly = { id: 5, name: 'Weekly' } as any
            const party = { id: 6, name: 'Party' } as any
            const a = makeShoppingListEntry({ id: 1, shoppingLists: [weekly] })
            const b = makeShoppingListEntry({ id: 2, shoppingLists: [] })
            apiMock.apiShoppingListEntryBulkCreate.mockResolvedValue({})

            await store.addEntriesToShoppingLists([a, b], [weekly, party], true)
            expect(store.undoStack.at(-1)!.type).toBe('LISTS')

            apiMock.apiShoppingListEntryBulkCreate.mockClear()
            store.undoChange()

            await vi.waitFor(() => {
                expect(apiMock.apiShoppingListEntryBulkCreate).toHaveBeenCalledWith({ shoppingListEntryBulk: { ids: [2], shoppingListsRemove: [5] } })
                expect(apiMock.apiShoppingListEntryBulkCreate).toHaveBeenCalledWith({ shoppingListEntryBulk: { ids: [1, 2], shoppingListsRemove: [6] } })
            })
            expect(a.shoppingLists!.map(l => l.id)).toEqual([5])
            expect(b.shoppingLists!.map(l => l.id)).toEqual([])
        })

        it('undoes a category change by restoring each food\'s previous category', async () => {
            const store = useShoppingStore()
            const produce = makeSupermarketCategory({ id: 1, name: 'Produce' })
            const dairy = makeSupermarketCategory({ id: 2, name: 'Dairy' })
            const baking = makeSupermarketCategory({ id: 3, name: 'Baking' })
            const f1 = makeFoodShopping({ id: 10, supermarketCategory: produce })
            const f2 = makeFoodShopping({ id: 11, supermarketCategory: dairy })
            const f3 = makeFoodShopping({ id: 12, supermarketCategory: undefined })
            const line = (f: any, id: number) => ({ food: f, entries: new Map([[id, makeShoppingListEntry({ id, food: f })]]) }) as any
            apiMock.apiFoodBatchUpdateUpdate.mockResolvedValue({})

            store.updateCategories([line(f1, 1), line(f2, 2), line(f3, 3)], baking, true)
            expect(f1.supermarketCategory).toBe(baking)
            expect(store.undoStack.at(-1)!.type).toBe('CATEGORY')

            apiMock.apiFoodBatchUpdateUpdate.mockClear()
            store.undoChange()

            expect(f1.supermarketCategory).toBe(produce)
            expect(f2.supermarketCategory).toBe(dairy)
            expect(f3.supermarketCategory).toBeUndefined()
            await vi.waitFor(() => {
                expect(apiMock.apiFoodBatchUpdateUpdate).toHaveBeenCalledWith({ foodBatchUpdate: { foods: [10], category: 1 } })
                expect(apiMock.apiFoodBatchUpdateUpdate).toHaveBeenCalledWith({ foodBatchUpdate: { foods: [11], category: 2 } })
                expect(apiMock.apiFoodBatchUpdateUpdate).toHaveBeenCalledWith({ foodBatchUpdate: { foods: [12], category: null } })
            })
        })
    })

    // Moving a food to other lists (the item dialog) replaces its lists; that is part of the history too.
    describe('updateEntryShoppingLists', () => {
        const weekly = { id: 5, name: 'Weekly' } as any
        const party = { id: 6, name: 'Party' } as any

        beforeEach(() => {
            apiMock.apiShoppingListEntryBulkCreate.mockResolvedValue({})
        })

        it('sets the lists in one bulk call and registers an undo that restores each entry\'s previous lists', async () => {
            const store = useShoppingStore()
            const a = makeShoppingListEntry({ id: 1, shoppingLists: [weekly] })
            const b = makeShoppingListEntry({ id: 2, shoppingLists: [] })

            await store.updateEntryShoppingLists([a, b], [party], true)

            expect(apiMock.apiShoppingListEntryBulkCreate).toHaveBeenCalledWith({ shoppingListEntryBulk: { ids: [1, 2], shoppingListsSet: [6] } })
            expect(a.shoppingLists!.map(l => l.id)).toEqual([6])
            expect(store.undoStack.at(-1)!.type).toBe('LISTS_SET')

            apiMock.apiShoppingListEntryBulkCreate.mockClear()
            store.undoChange()

            await vi.waitFor(() => {
                expect(apiMock.apiShoppingListEntryBulkCreate).toHaveBeenCalledWith({ shoppingListEntryBulk: { ids: [1], shoppingListsSet: [5] } })
                expect(apiMock.apiShoppingListEntryBulkCreate).toHaveBeenCalledWith({ shoppingListEntryBulk: { ids: [2], shoppingListsRemoveAll: true } })
            })
            expect(a.shoppingLists!.map(l => l.id)).toEqual([5])
            expect(b.shoppingLists!.map(l => l.id)).toEqual([])
        })

        it('clearing the lists removes them all (an empty set is ignored by the server)', async () => {
            const store = useShoppingStore()
            const a = makeShoppingListEntry({ id: 1, shoppingLists: [weekly] })

            await store.updateEntryShoppingLists([a], [], false)

            expect(apiMock.apiShoppingListEntryBulkCreate).toHaveBeenCalledWith({ shoppingListEntryBulk: { ids: [1], shoppingListsRemoveAll: true } })
            expect(a.shoppingLists).toEqual([])
        })

        it('registers no undo unless asked to', async () => {
            const store = useShoppingStore()
            await store.updateEntryShoppingLists([makeShoppingListEntry({ id: 1 })], [party])
            expect(store.undoStack.length).toBe(0)
        })
    })

    describe('addEntriesToShoppingLists', () => {
        it('adds the lists through the bulk endpoint and keeps the lists an entry is already on', async () => {
            const store = useShoppingStore()
            const weekly = { id: 5, name: 'Weekly' } as any
            const party = { id: 6, name: 'Party' } as any
            const a = makeShoppingListEntry({ id: 1, shoppingLists: [weekly] })
            const b = makeShoppingListEntry({ id: 2, shoppingLists: [] })
            apiMock.apiShoppingListEntryBulkCreate.mockResolvedValue({})

            await store.addEntriesToShoppingLists([a, b], [weekly, party])

            expect(apiMock.apiShoppingListEntryBulkCreate).toHaveBeenCalledWith({ shoppingListEntryBulk: { ids: [1, 2], shoppingListsAdd: [5, 6] } })
            expect(a.shoppingLists!.map(l => l.id)).toEqual([5, 6])
            expect(b.shoppingLists!.map(l => l.id)).toEqual([5, 6])
        })
    })
})
