import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'
import { makeSpace } from '@/__tests__/factories'

import AiCreditsCards from '@/components/display/AiCreditsCards.vue'

function mountCards(space = makeSpace({ aiMonthlyCreditsUsed: 42, aiCreditsMonthly: 100, aiCreditsBalance: 7 })) {
    const i18n = createI18n({
        legacy: false, locale: 'en',
        messages: { en: { MonthlyCredits: 'Monthly Credits', AiCreditsBalance: 'AI Credits Balance', Credits: 'Credits' } },
        missingWarn: false, fallbackWarn: false,
    })
    const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives })
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/list/:model', name: 'ModelListPage', component: { template: '<div/>' } }],
    })
    return mount({ components: { AiCreditsCards }, template: '<v-row><ai-credits-cards :space="space" /></v-row>' }, {
        data: () => ({ space }),
        global: { plugins: [i18n, vuetify, router] },
    })
}

describe('AiCreditsCards', () => {
    it('renders monthly credits used/limit and balance from the space prop', () => {
        const wrapper = mountCards()
        const text = wrapper.text()

        expect(text).toContain('Monthly Credits')
        expect(text).toContain('AI Credits Balance')
        expect(text).toContain('42')
        expect(text).toContain('100')
        expect(text).toContain('7')
    })

    it('links both cards to the AiLog list page', () => {
        const wrapper = mountCards()
        const links = wrapper.findAll('a[href="/list/AiLog"]')
        expect(links.length).toBe(2)
    })
})
