/**
 * AiCreditsBar re-implemented the same AI-credits display (monthly used/limit +
 * balance) that SpaceLimitsInfo.vue already renders from the same Space fields.
 * Both now share AiCreditsCards.vue - this proves AiCreditsBar wires it up with
 * the active space, rather than duplicating the markup again.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, type PiniaPlugin } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'
import { makeSpace } from '@/__tests__/factories'

import AiCreditsBar from '@/components/display/AiCreditsBar.vue'
import AiCreditsCards from '@/components/display/AiCreditsCards.vue'

function mountBar(activeSpace = makeSpace({ aiMonthlyCreditsUsed: 5, aiCreditsMonthly: 20, aiCreditsBalance: 3 })) {
    const prePopulate: PiniaPlugin = ({ store }) => {
        if (store.$id === 'user_preference_store') {
            store.activeSpace = activeSpace
        }
    }
    const pinia = createPinia()
    pinia.use(prePopulate)
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
    return mount(AiCreditsBar, {
        global: { plugins: [pinia, i18n, vuetify, router] },
    })
}

describe('AiCreditsBar', () => {
    it('renders AiCreditsCards with the active space', () => {
        const wrapper = mountBar()
        const cards = wrapper.findComponent(AiCreditsCards)
        expect(cards.exists()).toBe(true)
        expect(cards.props('space').aiCreditsBalance).toBe(3)
    })
})
