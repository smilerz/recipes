import {describe, it, expect} from 'vitest'
import {mount} from '@vue/test-utils'
import {createI18n} from 'vue-i18n'

import ListToolbar from '@/components/model_list/ListToolbar.vue'

function mountToolbar(props: Record<string, any> = {}) {
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    return mount(ListToolbar, {
        props: {hasMultiSelect: true, ...props},
        global: {plugins: [i18n]},
    })
}

describe('ListToolbar — disableSearch hides only the search field', () => {
    it('renders the search input by default', () => {
        const w = mountToolbar()
        expect(w.find('input').exists()).toBe(true)
    })

    it('hides the search input when disableSearch is true', () => {
        const w = mountToolbar({disableSearch: true})
        expect(w.find('input').exists()).toBe(false)
    })

    it('keeps the multi-select toggle when search is disabled', () => {
        const w = mountToolbar({disableSearch: true, hasMultiSelect: true})
        expect(w.find('[aria-label="Select"]').exists()).toBe(true)
    })
})

describe('ListToolbar — hasSettings hides only the settings button', () => {
    it('shows the settings button alongside the filters by default', () => {
        const w = mountToolbar({hasFilters: true})
        expect(w.find('[aria-label="Settings"]').exists()).toBe(true)
    })

    it('hides the settings button, keeping filters, when hasSettings is false', () => {
        const w = mountToolbar({hasFilters: true, hasSettings: false})
        expect(w.find('[aria-label="Settings"]').exists()).toBe(false)
        expect(w.find('[aria-label="Filters"]').exists()).toBe(true)
    })
})
