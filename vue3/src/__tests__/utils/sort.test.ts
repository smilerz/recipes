// @vitest-environment node
import {describe, it, expect} from 'vitest'
import {nextSort, SORT_ICON_ASC, SORT_ICON_DESC} from '@/utils/sort'

describe('nextSort', () => {
    it('starts a new field ascending', () => {
        expect(nextSort({field: null, descending: false}, 'amount')).toEqual({field: 'amount', descending: false})
    })

    it('switching to another field starts it ascending, whatever the last direction was', () => {
        expect(nextSort({field: 'name', descending: true}, 'amount')).toEqual({field: 'amount', descending: false})
    })

    it('picking the same field again flips it to descending', () => {
        expect(nextSort({field: 'amount', descending: false}, 'amount')).toEqual({field: 'amount', descending: true})
    })

    it('a third pick clears the sort, back to the default order', () => {
        expect(nextSort({field: 'amount', descending: true}, 'amount')).toEqual({field: null, descending: false})
    })
})

describe('sort icons', () => {
    it('are the list sort arrows, never the reorder icon', () => {
        expect(SORT_ICON_ASC).toBe('fa-solid fa-arrow-up-short-wide')
        expect(SORT_ICON_DESC).toBe('fa-solid fa-arrow-down-short-wide')
    })
})
