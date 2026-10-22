import {describe, it, expect} from 'vitest'
import {mount} from '@vue/test-utils'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'

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


describe('ListToolbar — search slot', () => {
    it('shows whatever the page puts in the search slot instead of the search field', () => {
        const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
        const w = mount(ListToolbar, {
            props: {hasFilters: true, hasMultiSelect: true},
            slots: {search: '<div class="custom-field">Food</div>'},
            global: {plugins: [i18n]},
        })

        expect(w.find('.custom-field').exists()).toBe(true)
        expect(w.find('input').exists()).toBe(false)
    })

    it('keeps the filter and select buttons beside it', () => {
        const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
        const w = mount(ListToolbar, {
            props: {hasFilters: true, hasMultiSelect: true},
            slots: {search: '<div class="custom-field">Food</div>'},
            global: {plugins: [i18n]},
        })

        expect(w.find('[aria-label="Filters"]').exists()).toBe(true)
        expect(w.find('[aria-label="Select"]').exists()).toBe(true)
    })
})

describe('ListToolbar — phone layout with a search slot (regression coverage, written after the change)', () => {
    // a huge mobile breakpoint makes every width count as a phone
    function mountOnPhone(slots: Record<string, string>) {
        const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
        const vuetify = createVuetify({display: {mobileBreakpoint: 99999}})
        return mount(ListToolbar, {
            props: {hasFilters: true, hasMultiSelect: true},
            slots,
            global: {plugins: [i18n, vuetify]},
        })
    }

    it('keeps Filters, Select and the slotted field on one inline row on a phone', () => {
        const w = mountOnPhone({search: '<div class="custom-field">Food</div>'})

        expect(w.find('.model-list-toolbar-desktop .custom-field').exists()).toBe(true)
        expect(w.find('.model-list-toolbar-desktop [aria-label="Filters"]').exists()).toBe(true)
    })

    it('still uses the stacked phone layout when no field is slotted in', () => {
        const w = mountOnPhone({})

        expect(w.find('.model-list-toolbar-desktop').exists()).toBe(false)
    })
})
