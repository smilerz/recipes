/**
 * Quick-select expiry duration chips — one tap gets a common duration without configuring a
 * food's shelf-life fields first. Shared across FoodEditor's shelf-life rows and the Open
 * confirm dialog, so this component is the single source of "the common choices."
 */
import {describe, it, expect} from 'vitest'
import {mount} from '@vue/test-utils'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'
import {EXPIRY_PRESET_DAYS} from '@/utils/pantry_utils'

import ExpiryPresetChips from '@/components/inputs/ExpiryPresetChips.vue'

function mountChips() {
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})
    return mount(ExpiryPresetChips, {
        global: {plugins: [i18n, vuetify]},
    })
}

describe('ExpiryPresetChips', () => {
    it('renders one chip per preset duration', () => {
        const w = mountChips()
        expect(w.findAll('.v-chip')).toHaveLength(EXPIRY_PRESET_DAYS.length)
    })

    it('emits select with the days value when a chip is clicked', async () => {
        const w = mountChips()
        const chips = w.findAll('.v-chip')
        await chips[2].trigger('click')  // third preset (14 days / 2 weeks)
        expect(w.emitted('select')).toEqual([[EXPIRY_PRESET_DAYS[2]]])
    })
})
