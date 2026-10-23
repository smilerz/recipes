/** The arrows every list uses to show a sort direction (never `fa-sort`, which this app uses for "reorder"). */
export const SORT_ICON_ASC = 'fa-solid fa-arrow-up-short-wide'
export const SORT_ICON_DESC = 'fa-solid fa-arrow-down-short-wide'

export type SortState = {field: string | null, descending: boolean}

/**
 * The sort after picking `key`: a new field starts ascending, picking it again flips it to descending,
 * and a third pick clears the sort (back to the list's default order).
 */
export function nextSort(current: SortState, key: string): SortState {
    if (current.field !== key) return {field: key, descending: false}
    if (!current.descending) return {field: key, descending: true}
    return {field: null, descending: false}
}
