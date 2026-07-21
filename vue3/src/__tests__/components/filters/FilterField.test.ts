import {describe, it, expect, vi} from 'vitest'
import {mount} from '@vue/test-utils'
import {createVuetify} from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import {createI18n} from 'vue-i18n'
import {VRating} from 'vuetify/components'
import FilterField from '@/components/filters/FilterField.vue'
import type {FilterDef} from '@/composables/modellist/types'

function mountField(def: FilterDef, filterValues: Record<string, string> = {}) {
    const vuetify = createVuetify({components, directives})
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})

    const setFilter = vi.fn()
    const clearFilter = vi.fn()

    const wrapper = mount(FilterField, {
        props: {
            def,
            getFilter: (key: string) => filterValues[key],
            setFilter,
            clearFilter,
        },
        global: {plugins: [vuetify, i18n]},
    })
    return {wrapper, setFilter, clearFilter}
}

const RATING_DEF: FilterDef = {
    key: 'ratingGte',
    labelKey: 'RatingGte',
    type: 'rating-unrated',
    unratedKey: 'unrated',
    group: 'Rating',
}

describe('FilterField — rating-unrated (unified rating + unrated control)', () => {
    it('renders an unrated (0) toggle plus a star rating', () => {
        const {wrapper} = mountField(RATING_DEF)
        expect(wrapper.find('.unrated-toggle').exists()).toBe(true)
        expect(wrapper.findComponent(VRating).exists()).toBe(true)
    })

    it('clicking the 0/unrated toggle sets unrated and clears the rating', async () => {
        const {wrapper, setFilter, clearFilter} = mountField(RATING_DEF)
        await wrapper.find('.unrated-toggle').trigger('click')
        expect(setFilter).toHaveBeenCalledWith('unrated', '1')
        expect(clearFilter).toHaveBeenCalledWith('ratingGte')
    })

    it('selecting a star sets ratingGte and clears unrated', async () => {
        const {wrapper, setFilter, clearFilter} = mountField(RATING_DEF)
        wrapper.findComponent(VRating).vm.$emit('update:modelValue', 3)
        await wrapper.vm.$nextTick()
        expect(setFilter).toHaveBeenCalledWith('ratingGte', '3')
        expect(clearFilter).toHaveBeenCalledWith('unrated')
    })

    it('when unrated is active the star value reads 0 and the toggle is highlighted', () => {
        const {wrapper} = mountField(RATING_DEF, {unrated: '1'})
        expect(wrapper.findComponent(VRating).props('modelValue')).toBe(0)
        // active toggle carries the primary color class (matches the panel's other active toggles)
        expect(wrapper.find('.unrated-toggle').classes().join(' ')).toContain('primary')
    })

    // D06: each rating option has three states — nothing selected = grey (default text); the
    // active choice = primary; the OTHER (inactive) option while its counterpart is active =
    // grey + muted (dimmed). So an option only dims when the other one is actually selected.
    it('greys options by default, colors the active one primary, and mutes the inactive one', () => {
        // nothing selected → both grey (default text), neither primary, neither muted
        const none = mountField(RATING_DEF).wrapper
        expect(none.find('.unrated-toggle').classes()).toContain('text-medium-emphasis')
        expect(none.find('.unrated-toggle').classes()).not.toContain('rating-muted')
        expect(none.findComponent(VRating).props('color')).toBeUndefined()
        expect(none.findComponent(VRating).classes()).toContain('text-medium-emphasis')
        expect(none.findComponent(VRating).classes()).not.toContain('rating-muted')

        // unrated active → toggle primary/full; stars grey + muted (inactive option)
        const un = mountField(RATING_DEF, {unrated: '1'}).wrapper
        expect(un.find('.unrated-toggle').classes()).toContain('text-primary')
        expect(un.find('.unrated-toggle').classes()).not.toContain('rating-muted')
        expect(un.findComponent(VRating).props('color')).toBeUndefined()
        expect(un.findComponent(VRating).classes()).toEqual(expect.arrayContaining(['text-medium-emphasis', 'rating-muted']))

        // a rating active → stars primary/full; toggle grey + muted (inactive option)
        const rated = mountField(RATING_DEF, {ratingGte: '4'}).wrapper
        expect(rated.findComponent(VRating).props('color')).toBe('primary')
        expect(rated.findComponent(VRating).classes()).not.toContain('rating-muted')
        expect(rated.find('.unrated-toggle').classes()).toEqual(expect.arrayContaining(['text-medium-emphasis', 'rating-muted']))
    })

    it('clicking the 0/unrated toggle while already unrated clears unrated (toggles off)', async () => {
        const {wrapper, setFilter, clearFilter} = mountField(RATING_DEF, {unrated: '1'})
        await wrapper.find('.unrated-toggle').trigger('click')
        expect(clearFilter).toHaveBeenCalledWith('unrated')
        expect(setFilter).not.toHaveBeenCalledWith('unrated', '1')
    })

    it('clear button resets both rating and unrated', async () => {
        const {wrapper, clearFilter} = mountField(RATING_DEF, {ratingGte: '4'})
        await wrapper.find('.rating-clear').trigger('click')
        expect(clearFilter).toHaveBeenCalledWith('ratingGte')
        expect(clearFilter).toHaveBeenCalledWith('unrated')
    })

    // Item 2: the vertical divider between the ban toggle and the stars was a
    // stray artifact — the ban glyph already separates the two visually.
    it('renders no vertical divider between the unrated toggle and the stars', () => {
        const {wrapper} = mountField(RATING_DEF)
        expect(wrapper.find('.v-divider').exists()).toBe(false)
    })

    // The ban toggle stays a boxless text-variant icon (no filled button box) so it shares the
    // plain-variant look of the rating stars; its selected/inactive state is carried by color +
    // the shared rating-muted dimming, not a button fill (see the D06 consistency test above).
    it('keeps the unrated toggle boxless (text variant, never a filled button)', () => {
        const active = mountField(RATING_DEF, {unrated: '1'}).wrapper.find('.unrated-toggle').classes()
        const inactive = mountField(RATING_DEF).wrapper.find('.unrated-toggle').classes()
        expect(active).toContain('v-btn--variant-text')
        expect(active).not.toContain('v-btn--variant-flat')
        expect(inactive).toContain('v-btn--variant-text')
    })
})
