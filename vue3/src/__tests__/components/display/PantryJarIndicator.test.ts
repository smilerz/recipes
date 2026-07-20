import {describe, it, expect} from 'vitest'
import {mount} from '@vue/test-utils'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'

import PantryJarIndicator from '@/components/display/PantryJarIndicator.vue'

// The pantry jar replaces the additive-boolean on-hand clipboard icon. It
// renders only when the food is in inventory, and its color + aria-label
// encode the earliest-lot expiry state (sage / amber / red). Expiry dates are
// relative to the real "now" so the assertions don't rot as the date advances.
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000)

const messages = {
    en: {OnHand: 'On hand', JarExpiringSoon: 'In pantry — expiring soon', JarExpired: 'In pantry — expired'},
}

function mountJar(props: Record<string, unknown>) {
    const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})
    const i18n = createI18n({legacy: false, locale: 'en', messages, missingWarn: false, fallbackWarn: false})
    return mount(PantryJarIndicator, {props, global: {plugins: [vuetify, i18n]}})
}

const icon = (w: ReturnType<typeof mountJar>) => w.findComponent({name: 'VIcon'})

describe('PantryJarIndicator', () => {
    it('renders nothing when the food is not in inventory', () => {
        const w = mountJar({inInventory: false})
        expect(icon(w).exists()).toBe(false)
    })

    it('renders a sage jar with the On hand label when in stock and undated', () => {
        const w = mountJar({inInventory: true})
        expect(icon(w).exists()).toBe(true)
        expect(icon(w).props('color')).toBe('success')
        expect(icon(w).attributes('aria-label')).toBe('On hand')
    })

    it('stays sage when the earliest lot is beyond the expiring window', () => {
        const w = mountJar({inInventory: true, earliestExpiry: daysFromNow(30)})
        expect(icon(w).props('color')).toBe('success')
    })

    it('renders an amber jar with the expiring label when the earliest lot is within the window', () => {
        const w = mountJar({inInventory: true, earliestExpiry: daysFromNow(2)})
        expect(icon(w).props('color')).toBe('warning')
        expect(icon(w).attributes('aria-label')).toBe('In pantry — expiring soon')
    })

    it('renders a red jar with the expired label when the earliest lot is past', () => {
        const w = mountJar({inInventory: true, earliestExpiry: daysFromNow(-2)})
        expect(icon(w).props('color')).toBe('error')
        expect(icon(w).attributes('aria-label')).toBe('In pantry — expired')
    })

    it('accepts an ISO date string for the earliest expiry', () => {
        const w = mountJar({inInventory: true, earliestExpiry: daysFromNow(-2).toISOString().slice(0, 10)})
        expect(icon(w).props('color')).toBe('error')
    })
})
