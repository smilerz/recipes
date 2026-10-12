/**
 * The navigation drawer's page-specific entries. On the Meal Plan page they are the Auto Planner, the calendar (iCal) export and the
 * device settings; a phone has no drawer, so its menu sheet shows only the actions (`actionsOnly`), not the settings block, which
 * is reachable under Settings.
 */
import {describe, it, expect, vi} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {createPinia} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import {createRouter, createMemoryHistory} from 'vue-router'

vi.mock('@/components/dialogs/AutoPlanDialog.vue', () => ({default: {template: '<div class="stub-auto-plan-dialog"/>'}}))
vi.mock('@/components/dialogs/MealPlanIcalDialog.vue', () => ({default: {template: '<div class="stub-meal-plan-ical-dialog"/>'}}))
vi.mock('@/components/settings/MealPlanDeviceSettings.vue', () => ({default: {template: '<div class="stub-meal-plan-device-settings"/>'}}))

import NavigationDrawerContextMenu from '@/components/display/NavigationDrawerContextMenu.vue'

async function mountOn(path: string, props: Record<string, any> = {}) {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            {path: '/', name: 'StartPage', component: {template: '<div/>'}},
            {path: '/mealplan', name: 'MealPlanPage', component: {template: '<div/>'}},
        ],
    })
    await router.push(path)
    await router.isReady()
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const wrapper = mount(NavigationDrawerContextMenu, {
        props,
        global: {plugins: [createPinia(), i18n, createVuetify({components, directives}), router]},
    })
    await flushPromises()
    return wrapper
}

describe('NavigationDrawerContextMenu', () => {
    it('on the Meal Plan page shows the Auto Planner, the calendar export and the device settings', async () => {
        const wrapper = await mountOn('/mealplan')
        expect(wrapper.find('.stub-auto-plan-dialog').exists()).toBe(true)
        expect(wrapper.find('.stub-meal-plan-ical-dialog').exists()).toBe(true)
        expect(wrapper.find('.stub-meal-plan-device-settings').exists()).toBe(true)
        wrapper.unmount()
    })

    it('with actionsOnly shows the Auto Planner and the calendar export but not the device settings', async () => {
        const wrapper = await mountOn('/mealplan', {actionsOnly: true})
        expect(wrapper.find('.stub-auto-plan-dialog').exists()).toBe(true)
        expect(wrapper.find('.stub-meal-plan-ical-dialog').exists()).toBe(true)
        expect(wrapper.find('.stub-meal-plan-device-settings').exists()).toBe(false)
        expect(wrapper.text()).not.toContain('Settings')
        wrapper.unmount()
    })

    it('shows nothing on other pages', async () => {
        const wrapper = await mountOn('/')
        expect(wrapper.find('.stub-auto-plan-dialog').exists()).toBe(false)
        expect(wrapper.find('.stub-meal-plan-ical-dialog').exists()).toBe(false)
        expect(wrapper.find('.stub-meal-plan-device-settings').exists()).toBe(false)
        wrapper.unmount()
    })
})
