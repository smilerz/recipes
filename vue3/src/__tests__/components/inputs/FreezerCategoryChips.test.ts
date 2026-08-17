/**
 * #19: FoodEditor's Frozen shelf-life row used the generic, category-blind ExpiryPresetChips
 * ("3 Days / 1 Week / ...") — no more meaningful for freezer guidance than a blank text field.
 * FreezerExpiryDialog already had real USDA-style category presets (Poultry: 9 months, etc.);
 * this component reuses that same preset list (FREEZER_CATEGORY_PRESETS) as inline chips.
 */
import {describe, it, expect} from 'vitest'
import {mount} from '@vue/test-utils'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'
import {FREEZER_CATEGORY_PRESETS} from '@/utils/pantry_utils'

import FreezerCategoryChips from '@/components/inputs/FreezerCategoryChips.vue'

function mountChips() {
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})
    return mount(FreezerCategoryChips, {
        global: {plugins: [i18n, vuetify]},
    })
}

describe('FreezerCategoryChips', () => {
    it('renders one chip per freezer category preset', () => {
        const w = mountChips()
        expect(w.findAll('.v-chip')).toHaveLength(FREEZER_CATEGORY_PRESETS.length)
    })

    it('emits select with the preset converted to days (months * 30) when a chip is clicked', async () => {
        const w = mountChips()
        const chips = w.findAll('.v-chip')
        await chips[1].trigger('click')  // Poultry: 9 months
        expect(w.emitted('select')).toEqual([[270]])
    })
})
