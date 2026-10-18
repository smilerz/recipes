import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import {createI18n} from 'vue-i18n'
import LookbackPeriodSelect from '@/components/inputs/LookbackPeriodSelect.vue'

function mountSelect(modelValue = 30, options = [7, 30, 90]) {
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {LookBackDays: 'Look back (days)'}}})
    return mount(LookbackPeriodSelect, {props: {modelValue, options}, global: {plugins: [i18n]}})
}

describe('LookbackPeriodSelect', () => {
    it('shows one button per period, with the current one active', () => {
        const buttons = mountSelect(30).findAll('button')
        expect(buttons.map(b => b.text())).toEqual(['7', '30', '90'])
        expect(buttons.map(b => b.classes().includes('v-btn--active'))).toEqual([false, true, false])
    })

    it('shows an extra period that is not one of the standard ones, in order', () => {
        expect(mountSelect(14, [7, 14, 30, 90]).findAll('button').map(b => b.text())).toEqual(['7', '14', '30', '90'])
    })

    it('says what the numbers are', () => {
        expect(mountSelect().text()).toContain('Look back (days)')
    })

    it('reports the chosen period', async () => {
        const wrapper = mountSelect(30)
        await wrapper.findAll('button')[2].trigger('click')
        expect(wrapper.emitted('update:modelValue')).toEqual([[90]])
    })

    it('does not let the current period be switched off', async () => {
        const wrapper = mountSelect(30)
        await wrapper.findAll('button')[1].trigger('click')
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })
})
