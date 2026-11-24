/**
 * MealPlanSettingsDrawer: where the meal plan's settings and actions live, instead of the left navigation.
 * The calendar settings only affect the calendar, so they are offered only while it is showing; the colour legend and the
 * Auto Planner and calendar export (which a phone can only reach here) are always there.
 */
import {describe, it, expect, vi, beforeEach} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {createPinia, setActivePinia} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'

vi.mock('@vueuse/core', async (imp) => {
    const {ref} = await import('vue')
    return {...(await imp<any>()), useStorage: (_key: string, defaultValue: any) => ref(defaultValue)}
})
vi.mock('@vueuse/router', () => ({useRouteQuery: () => ({value: false})}))
vi.mock('vue-router', () => ({useRouter: () => ({push: vi.fn(), replace: vi.fn()}), useRoute: () => ({query: {}})}))

import MealPlanSettingsDrawer from '@/components/display/MealPlanSettingsDrawer.vue'
import {useUserPreferenceStore} from '@/stores/UserPreferenceStore'

function mountDrawer(showingCalendar: boolean) {
    const pinia = createPinia()
    setActivePinia(pinia)
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {Auto_Planner: 'Auto planner'}}, missingWarn: false, fallbackWarn: false})
    return mount(MealPlanSettingsDrawer, {
        attachTo: document.body,
        props: {modelValue: true, showingCalendar},
        global: {
            plugins: [pinia, i18n, createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})],
            stubs: {
                // a drawer needs a layout around it; here it only has to render the tab content
                TabbedDrawer: {
                    name: 'TabbedDrawer',
                    props: ['modelValue', 'pinned', 'tabs'],
                    emits: ['update:modelValue', 'update:pinned'],
                    template: '<div class="stub-tabbed-drawer" :data-tab-count="tabs.length"><slot name="settings" /></div>',
                },
                MealPlanDeviceSettings: {template: '<div class="stub-device-settings" />'},
                MealPlanMealTypeLegend: {template: '<div class="stub-legend" />'},
                AutoPlanDialog: {template: '<div class="stub-auto-plan" />'},
                MealPlanIcalDialog: {template: '<div class="stub-ical" />'},
            },
        },
    })
}

describe('MealPlanSettingsDrawer', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
    })

    it('offers the calendar settings while the calendar is showing', async () => {
        const w = mountDrawer(true)
        await flushPromises()
        expect(w.find('.stub-device-settings').exists()).toBe(true)
    })

    it('leaves the calendar settings out while the day list is showing, since they do not affect it', async () => {
        const w = mountDrawer(false)
        await flushPromises()
        expect(w.find('.stub-device-settings').exists()).toBe(false)
    })

    it.each([true, false])('always has the colour legend, the Auto Planner and the calendar export (calendar showing: %s)', async (showingCalendar) => {
        const w = mountDrawer(showingCalendar)
        await flushPromises()
        expect(w.find('.stub-legend').exists()).toBe(true)
        expect(w.find('.stub-auto-plan').exists()).toBe(true)
        expect(w.find('.stub-ical').exists()).toBe(true)
    })

    it('is a single tab, so no tab bar is drawn', async () => {
        const w = mountDrawer(true)
        await flushPromises()
        expect(w.find('.stub-tabbed-drawer').attributes('data-tab-count')).toBe('1')
    })

    it('remembers on the device whether it is pinned', async () => {
        const w = mountDrawer(true)
        await flushPromises()

        w.findComponent({name: 'TabbedDrawer'}).vm.$emit('update:pinned', true)
        await flushPromises()

        expect((useUserPreferenceStore().deviceSettings as any).mealplan_settingsPinned).toBe(true)
    })
})
