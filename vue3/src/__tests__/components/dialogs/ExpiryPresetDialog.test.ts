/**
 * Renamed/generalized from FreezerExpiryDialog: still defaults to freezer-category presets and
 * writes v-model:date (its 4 existing callers — booking dialogs picking a lot's freezer expiry —
 * need zero template changes), but now also accepts a custom `presets` list and emits `select`
 * with the raw days value, so callers that don't want a Date (FoodEditor's shelf-life rows) can
 * consume the selection directly.
 */
import {describe, it, expect} from 'vitest'
import {mount} from '@vue/test-utils'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'
import {FREEZER_CATEGORY_PRESETS} from '@/utils/pantry_utils'

import ExpiryPresetDialog from '@/components/dialogs/ExpiryPresetDialog.vue'

function mountDialog(props: Record<string, any> = {}) {
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})
    return mount(ExpiryPresetDialog, {
        props: {modelValue: true, ...props},
        global: {plugins: [i18n, vuetify]},
        attachTo: document.body,
    })
}

describe('ExpiryPresetDialog', () => {
    it('defaults to the freezer-category presets, one list item each, plus Close', () => {
        const w = mountDialog()
        const items = document.body.querySelectorAll('.v-list-item')
        // +1 for the trailing Close item
        expect(items.length).toBe(FREEZER_CATEGORY_PRESETS.length + 1)
        w.unmount()
    })

    it('renders a custom presets list instead of the freezer-category default', () => {
        const w = mountDialog({presets: [{label: '3 Days', days: 3}, {label: '1 Week', days: 7}]})
        const items = document.body.querySelectorAll('.v-list-item')
        expect(items.length).toBe(3) // 2 presets + Close
        expect(document.body.textContent).toContain('3 Days')
        expect(document.body.textContent).toContain('1 Week')
        w.unmount()
    })

    // Note: no await after the click. Vuetify's real VDialog (activator="model" — not a real
    // activator, this component is always driven by v-model) runs an internal watcher on close
    // that dereferences a null activator element in jsdom once the microtask queue flushes —
    // pre-existing (reproduces identically on the untouched Close-item handler, unrelated to this
    // feature). emit() itself is synchronous, so the assertions below don't need a tick.
    it('clicking a preset emits select with its days value', () => {
        const w = mountDialog({presets: [{label: '3 Days', days: 3}, {label: '1 Week', days: 7}]})
        const items = document.body.querySelectorAll('.v-list-item')
        ;(items[1] as HTMLElement).click() // "1 Week"

        expect(w.emitted('select')).toEqual([[7]])
        w.unmount()
    })

    it('clicking a preset still writes v-model:date, unchanged, for existing freezer-expiry callers', () => {
        const w = mountDialog({presets: [{label: '3 Days', days: 3}]})
        const items = document.body.querySelectorAll('.v-list-item')
        ;(items[0] as HTMLElement).click()

        const dateEmissions = w.emitted('update:date')
        const emittedDate = dateEmissions?.[dateEmissions.length - 1]?.[0] as Date
        expect(emittedDate).toBeInstanceOf(Date)
        w.unmount()
    })

    it('uses a custom title/subtitle when provided', () => {
        const w = mountDialog({title: 'Unopened', subtitle: 'Pick a duration', presets: []})
        expect(document.body.textContent).toContain('Unopened')
        expect(document.body.textContent).toContain('Pick a duration')
        w.unmount()
    })
})
