import {describe, it, expect} from 'vitest'
import {mount} from '@vue/test-utils'
import {createI18n} from 'vue-i18n'

import SortMenuButton from '@/components/common/SortMenuButton.vue'

const OPTIONS = [
    {key: 'name', labelKey: 'Name'},
    {key: 'amount', labelKey: 'Amount'},
]

function mountSort(props: Record<string, any> = {}) {
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    return mount(SortMenuButton, {
        props: {options: OPTIONS, field: null, descending: false, label: 'Sort by Name', ...props},
        global: {
            plugins: [i18n],
            // render the menu inline so its items can be found and clicked
            stubs: {VMenu: {template: '<div class="menu"><slot/></div>'}},
        },
    })
}

describe('SortMenuButton', () => {
    it('shows the label it is given', () => {
        expect(mountSort({label: 'Sort by Amount'}).text()).toContain('Sort by Amount')
    })

    it('points up when ascending', () => {
        const w = mountSort({descending: false})
        expect(w.find('button .fa-arrow-up-short-wide').exists()).toBe(true)
    })

    it('points down when descending', () => {
        const w = mountSort({descending: true})
        expect(w.find('button .fa-arrow-down-short-wide').exists()).toBe(true)
    })

    it('never shows the reorder icon, which means something else in this app', () => {
        const w = mountSort()
        expect(w.find('.fa-sort').exists()).toBe(false)
    })

    it('lists every option', () => {
        const w = mountSort()
        expect(w.findAll('.v-list-item').map(i => i.text())).toEqual(['Name', 'Amount'])
    })

    it('marks the sorted field and shows its direction beside it', () => {
        const w = mountSort({field: 'amount', descending: true})
        const items = w.findAll('.v-list-item')

        expect(items[1].classes()).toContain('v-list-item--active')
        expect(items[1].find('.fa-arrow-down-short-wide').exists()).toBe(true)
        expect(items[0].classes()).not.toContain('v-list-item--active')
    })

    it('tells the page which field was picked', async () => {
        const w = mountSort()

        await w.findAll('.v-list-item')[1].trigger('click')

        expect(w.emitted('select')).toEqual([['amount']])
    })
})
