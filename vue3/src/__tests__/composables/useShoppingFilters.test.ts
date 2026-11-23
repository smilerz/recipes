import {describe, it, expect, beforeEach, vi} from 'vitest'
import {setActivePinia, createPinia} from 'pinia'
import {ShoppingGroupingOptions} from '@/types/Shopping'
import {apiMock, resetApiMock} from '@/__tests__/api-mock'

vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    ApiApi: class { constructor() { return apiMock } },
}))

vi.mock('@vueuse/core', async () => {
    const {ref} = await import('vue')
    return {
        useStorage: (_key: string, defaultValue: any) => ref(defaultValue),
    }
})

vi.mock('vue-i18n', () => ({
    useI18n: () => ({t: (key: string) => key}),
}))

vi.mock('vuetify', async (importOriginal) => ({
    ...(await importOriginal<typeof import('vuetify')>()),
    useTheme: () => ({change: vi.fn()}),
}))

vi.mock('vue-router', () => ({
    useRouter: () => ({push: vi.fn().mockResolvedValue(undefined)}),
}))

vi.mock('@vueuse/router', () => ({
    useRouteQuery: () => ({value: false}),
}))

import {useUserPreferenceStore} from '@/stores/UserPreferenceStore'
import {useShoppingFilters} from '@/composables/useShoppingFilters'

/**
 * The shopping list's filters are not a server query like the model lists: the show-toggles are the same
 * per-device settings the list already used, and the category is a view-only filter held in memory.
 */
describe('useShoppingFilters', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        const settings = useUserPreferenceStore().deviceSettings
        settings.shopping_show_delayed_entries = false
        settings.shopping_show_checked_entries = false
        settings.shopping_show_selected_supermarket_only = false
        settings.shopping_selected_grouping = ShoppingGroupingOptions.CATEGORY
    })

    it('reads the show toggles from the device settings', () => {
        const settings = useUserPreferenceStore().deviceSettings
        settings.shopping_show_delayed_entries = true
        const f = useShoppingFilters()

        expect(f.getFilter('delayed')).toBe('1')
        expect(f.getFilter('checked')).toBeUndefined()
    })

    it('writes a toggle back to the device settings, so the list rebuilds like before', () => {
        const settings = useUserPreferenceStore().deviceSettings
        const f = useShoppingFilters()

        f.setFilter('checked', '1')
        expect(settings.shopping_show_checked_entries).toBe(true)

        f.setFilter('checked', undefined)
        expect(settings.shopping_show_checked_entries).toBe(false)
    })

    it('keeps the category filter in memory, not in the device settings', () => {
        const f = useShoppingFilters()

        f.setFilter('category', '7')
        expect(f.getFilter('category')).toBe('7')

        f.clearFilter('category')
        expect(f.getFilter('category')).toBeUndefined()
    })

    it('counts the filters that are switched on', () => {
        const f = useShoppingFilters()
        expect(f.activeFilterCount.value).toBe(0)

        f.setFilter('delayed', '1')
        f.setFilter('category', '7')
        expect(f.activeFilterCount.value).toBe(2)
    })

    it('clearAllFilters switches the toggles off and clears the category', () => {
        const settings = useUserPreferenceStore().deviceSettings
        const f = useShoppingFilters()
        f.setFilter('delayed', '1')
        f.setFilter('checked', '1')
        f.setFilter('category', '7')

        f.clearAllFilters()

        expect(settings.shopping_show_delayed_entries).toBe(false)
        expect(settings.shopping_show_checked_entries).toBe(false)
        expect(f.getFilter('category')).toBeUndefined()
        expect(f.activeFilterCount.value).toBe(0)
    })

    it('only offers the supermarket-categories-only filter when grouping by category', () => {
        const settings = useUserPreferenceStore().deviceSettings
        const f = useShoppingFilters()
        expect(f.filterDefs.value.map(d => d.key)).toContain('supermarketOnly')

        settings.shopping_selected_grouping = ShoppingGroupingOptions.RECIPE
        expect(f.filterDefs.value.map(d => d.key)).not.toContain('supermarketOnly')
    })

    // The supermarket and the shopping lists are filters in the panel (shown as the standard filter chips), not
    // pickers of their own. They keep living in the per-device settings the list already reads.
    describe('supermarket and shopping list filters', () => {
        beforeEach(() => {
            resetApiMock()
            const settings = useUserPreferenceStore().deviceSettings
            settings.shopping_selected_supermarket = null
            settings.shopping_selected_shopping_lists = []
        })

        it('offers them as a model-select and a multi-select filter', () => {
            const defs = useShoppingFilters().filterDefs.value
            expect(defs.find(d => d.key === 'supermarket')).toMatchObject({type: 'model-select', modelName: 'Supermarket'})
            expect(defs.find(d => d.key === 'lists')).toMatchObject({type: 'tag-select', modelName: 'ShoppingList'})
        })

        it('reads the selected supermarket as its id', () => {
            const settings = useUserPreferenceStore().deviceSettings
            const f = useShoppingFilters()
            expect(f.getFilter('supermarket')).toBeUndefined()

            settings.shopping_selected_supermarket = {id: 3, name: 'Marianos'} as any
            expect(f.getFilter('supermarket')).toBe('3')
        })

        it('choosing a supermarket loads it in full (its category order) before it becomes the selection', async () => {
            const settings = useUserPreferenceStore().deviceSettings
            const marianos = {id: 3, name: 'Marianos', categoryToSupermarket: []}
            ;(apiMock as any).apiSupermarketRetrieve = vi.fn().mockResolvedValue(marianos)

            useShoppingFilters().setFilter('supermarket', '3')

            expect((apiMock as any).apiSupermarketRetrieve).toHaveBeenCalledWith({id: 3})
            await vi.waitFor(() => expect(settings.shopping_selected_supermarket).toEqual(marianos))
        })

        it('clearing the supermarket filter clears the selection', () => {
            const settings = useUserPreferenceStore().deviceSettings
            settings.shopping_selected_supermarket = {id: 3, name: 'Marianos'} as any

            useShoppingFilters().clearFilter('supermarket')

            expect(settings.shopping_selected_supermarket).toBeNull()
        })

        it('reads the selected lists as comma separated ids and writes the chosen ones back', () => {
            const settings = useUserPreferenceStore().deviceSettings
            const f = useShoppingFilters()
            settings.shopping_selected_shopping_lists = [5, 6]
            expect(f.getFilter('lists')).toBe('5,6')

            f.setFilter('lists', [7, 8])
            expect(settings.shopping_selected_shopping_lists).toEqual([7, 8])

            f.clearFilter('lists')
            expect(settings.shopping_selected_shopping_lists).toEqual([])
            expect(f.getFilter('lists')).toBeUndefined()
        })

        it('counts them with the other filters and Clear all removes them', () => {
            const settings = useUserPreferenceStore().deviceSettings
            settings.shopping_selected_supermarket = {id: 3, name: 'Marianos'} as any
            settings.shopping_selected_shopping_lists = [5]
            const f = useShoppingFilters()
            f.setFilter('delayed', '1')
            expect(f.activeFilterCount.value).toBe(3)

            f.clearAllFilters()

            expect(settings.shopping_selected_supermarket).toBeNull()
            expect(settings.shopping_selected_shopping_lists).toEqual([])
            expect(f.activeFilterCount.value).toBe(0)
        })
    })

    it('groups the definitions for the filter panel', () => {
        const f = useShoppingFilters()
        const groups = f.groupedFilterDefs.value
        expect(Array.from(groups.keys()).length).toBeGreaterThan(0)
        expect(Array.from(groups.values()).flat().map(d => d.key)).toEqual(expect.arrayContaining(['delayed', 'checked', 'category']))
    })
})
