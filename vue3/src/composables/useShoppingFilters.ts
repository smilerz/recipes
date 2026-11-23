import {computed, ref} from 'vue'
import {ApiApi} from '@/openapi'
import {ErrorMessageType, useMessageStore} from '@/stores/MessageStore'
import {useUserPreferenceStore} from '@/stores/UserPreferenceStore'
import {ShoppingGroupingOptions} from '@/types/Shopping'
import type {FilterDef, FilterValue} from '@/composables/modellist/types'

/**
 * Filter state for the shopping list, in the shape the shared FilterPanel / ModelListFilterChips expect
 * (the same getFilter / setFilter / clearFilter surface as useUrlFilters).
 *
 * Unlike the model lists these are not server query parameters and not URL state: the three "show" toggles
 * are the per-device settings the list already used (so the grouped list rebuilds exactly as before), and the
 * category is a view-only filter held in memory. Keeping it out of the URL also keeps the meal plan dialog,
 * which embeds this list, from writing to the page's address.
 */

/** device setting behind each toggle filter */
const TOGGLE_SETTINGS = {
    delayed: 'shopping_show_delayed_entries',
    checked: 'shopping_show_checked_entries',
    supermarketOnly: 'shopping_show_selected_supermarket_only',
} as const

type ToggleKey = keyof typeof TOGGLE_SETTINGS

function isToggle(key: string): key is ToggleKey {
    return key in TOGGLE_SETTINGS
}

export function useShoppingFilters() {
    const deviceSettings = useUserPreferenceStore().deviceSettings
    const category = ref<string | undefined>(undefined)

    const filterDefs = computed<FilterDef[]>(() => {
        const defs: FilterDef[] = [
            {key: 'delayed', labelKey: 'ShowDelayed', type: 'toggle', icon: 'fa-solid fa-clock', group: 'Status'},
            {key: 'checked', labelKey: 'ShowRecentlyCompleted', type: 'toggle', icon: 'fa-solid fa-check', group: 'Status'},
        ]
        if (deviceSettings.shopping_selected_grouping === ShoppingGroupingOptions.CATEGORY) {
            defs.push({key: 'supermarketOnly', labelKey: 'SupermarketCategoriesOnly', type: 'toggle', icon: 'fa-solid fa-store', group: 'Status'})
        }
        defs.push(
            {key: 'supermarket', labelKey: 'Supermarket', type: 'model-select', icon: 'fa-solid fa-store', modelName: 'Supermarket', group: 'Attributes'},
            {key: 'lists', labelKey: 'ShoppingList', type: 'tag-select', icon: 'fa-solid fa-list', modelName: 'ShoppingList', group: 'Attributes'},
            {key: 'category', labelKey: 'Category', type: 'model-select', icon: 'fa-solid fa-boxes-stacked', modelName: 'SupermarketCategory', group: 'Attributes'},
        )
        return defs
    })

    const groupedFilterDefs = computed<Map<string, FilterDef[]>>(() => {
        const map = new Map<string, FilterDef[]>()
        for (const def of filterDefs.value) {
            const group = def.group ?? ''
            map.set(group, [...(map.get(group) ?? []), def])
        }
        return map
    })

    function getFilter(key: string): string | undefined {
        if (isToggle(key)) return deviceSettings[TOGGLE_SETTINGS[key]] ? '1' : undefined
        if (key === 'category') return category.value
        if (key === 'supermarket') {
            const id = deviceSettings.shopping_selected_supermarket?.id
            return id != null ? String(id) : undefined
        }
        if (key === 'lists') {
            // -1 stood for "entries on no list" in the old picker; the panel can only choose real lists
            const ids = deviceSettings.shopping_selected_shopping_lists.filter(id => id !== -1)
            return ids.length > 0 ? ids.join(',') : undefined
        }
        return undefined
    }

    function setFilter(key: string, value: FilterValue) {
        if (isToggle(key)) {
            deviceSettings[TOGGLE_SETTINGS[key]] = value === '1'
        } else if (key === 'category') {
            category.value = typeof value === 'string' && value !== '' ? value : undefined
        } else if (key === 'supermarket') {
            setSupermarket(typeof value === 'string' && value !== '' ? Number(value) : null)
        } else if (key === 'lists') {
            const ids = Array.isArray(value) ? value.map(Number).filter(n => !isNaN(n)) : []
            // not a write when nothing changes: every device setting write rebuilds the grouped list
            if (ids.join(',') !== deviceSettings.shopping_selected_shopping_lists.join(',')) {
                deviceSettings.shopping_selected_shopping_lists = ids
            }
        }
    }

    /** the list orders its categories by the supermarket, so it needs the supermarket in full, not just its id */
    function setSupermarket(id: number | null) {
        if (id === null) {
            if (deviceSettings.shopping_selected_supermarket !== null) deviceSettings.shopping_selected_supermarket = null
            return
        }
        new ApiApi().apiSupermarketRetrieve({id}).then(supermarket => {
            deviceSettings.shopping_selected_supermarket = supermarket
        }).catch(err => {
            useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
        })
    }

    function clearFilter(key: string) {
        setFilter(key, undefined)
    }

    function clearAllFilters() {
        filterDefs.value.forEach(def => clearFilter(def.key))
    }

    const activeFilterCount = computed(() => filterDefs.value.filter(def => getFilter(def.key) !== undefined).length)

    return {filterDefs, groupedFilterDefs, activeFilterCount, getFilter, setFilter, clearFilter, clearAllFilters}
}
