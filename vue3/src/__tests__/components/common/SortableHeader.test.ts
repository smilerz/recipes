import {describe, it, expect} from 'vitest'
import {mount} from '@vue/test-utils'

import SortableHeader from '@/components/common/SortableHeader.vue'

function mountHeader(props: Record<string, any> = {}) {
    return mount(SortableHeader, {props: {label: 'Amount', active: false, descending: false, ...props}})
}

describe('SortableHeader', () => {
    it('shows the column title', () => {
        expect(mountHeader().text()).toContain('Amount')
    })

    it('shows no arrow and reports no sort while the column is not sorted', () => {
        const w = mountHeader()
        expect(w.find('.fa-arrow-up-short-wide, .fa-arrow-down-short-wide').exists()).toBe(false)
        expect(w.attributes('aria-sort')).toBe('none')
    })

    it('shows the up arrow while sorted ascending', () => {
        const w = mountHeader({active: true})
        expect(w.find('.fa-arrow-up-short-wide').exists()).toBe(true)
        expect(w.attributes('aria-sort')).toBe('ascending')
    })

    it('shows the down arrow while sorted descending', () => {
        const w = mountHeader({active: true, descending: true})
        expect(w.find('.fa-arrow-down-short-wide').exists()).toBe(true)
        expect(w.attributes('aria-sort')).toBe('descending')
    })

    it('tells the table when the title is clicked', async () => {
        const w = mountHeader()
        await w.find('button').trigger('click')
        expect(w.emitted('sort')).toHaveLength(1)
    })
})
