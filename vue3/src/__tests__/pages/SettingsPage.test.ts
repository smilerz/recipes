/**
 * SettingsPage: on a desktop the menu and the chosen page sit side by side. On a phone they are two screens: /settings is the menu,
 * and a page is shown alone with a way back to the menu. Stacked, the page used to start about 880px down, below the whole menu.
 */
import {describe, it, expect, vi, beforeEach} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {createRouter, createMemoryHistory} from 'vue-router'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'

vi.mock('@/plugin_registry.ts', () => ({TANDOOR_PLUGINS: []}))
vi.mock('@/composables/useDjangoUrls', () => ({useDjangoUrls: () => ({getDjangoUrl: (name: string) => `/${name}/`})}))

import SettingsPage from '@/pages/SettingsPage.vue'

const PAGE_NAMES = [
    ['account', 'AccountSettings'], ['cosmetic', 'CosmeticSettings'], ['shopping', 'ShoppingSettings'], ['meal-plan', 'MealPlanSettings'],
    ['search', 'SearchSettings'], ['start-page', 'StartPageSettingsPage'], ['space', 'SpaceSettings'], ['open-data-import', 'OpenDataImportSettings'],
    ['export', 'ExportDataSettings'], ['portable-data-import', 'PortableDataImportSettings'], ['space-backup', 'SpaceBackupSettings'], ['api', 'ApiSettings'],
]

async function mountAt(path: string, phone: boolean) {
    // Vuetify reads the window width when it is created: 500 is a phone (md breakpoint), 1400 a desktop
    window.innerWidth = phone ? 500 : 1400
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [{
            path: '/settings', component: SettingsPage, name: 'SettingsPage',
            children: PAGE_NAMES.map(([p, name]) => ({path: p, name, component: {template: `<div class="page-${p}" />`}})),
        }],
    })
    await router.push(path)
    await router.isReady()
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {Settings: 'Settings'}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives, display: {mobileBreakpoint: 'md'}})
    const wrapper = mount({template: '<router-view />'}, {attachTo: document.body, global: {plugins: [router, i18n, vuetify]}})
    await flushPromises()
    return {wrapper, router}
}

const menu = (w: any) => w.find('[data-test="settings-menu"]')
const content = (w: any) => w.find('[data-test="settings-content"]')
const back = (w: any) => w.find('[data-test="settings-back"]')

describe('SettingsPage', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
    })

    it('shows only the menu on a phone at /settings', async () => {
        const {wrapper} = await mountAt('/settings', true)
        expect(menu(wrapper).exists()).toBe(true)
        expect(content(wrapper).exists()).toBe(false)
        expect(back(wrapper).exists()).toBe(false)
    })

    it('shows only the chosen page, with a way back, on a phone', async () => {
        const {wrapper} = await mountAt('/settings/cosmetic', true)
        expect(menu(wrapper).exists()).toBe(false)
        expect(content(wrapper).find('.page-cosmetic').exists()).toBe(true)
        expect(back(wrapper).exists()).toBe(true)
    })

    it('goes back from a page to the menu on a phone', async () => {
        const {wrapper, router} = await mountAt('/settings/cosmetic', true)

        await back(wrapper).trigger('click')
        await flushPromises()

        expect(router.currentRoute.value.name).toBe('SettingsPage')
        expect(menu(wrapper).exists()).toBe(true)
        expect(content(wrapper).exists()).toBe(false)
    })

    it('opens a page alone when a menu entry is tapped on a phone', async () => {
        const {wrapper, router} = await mountAt('/settings', true)

        await wrapper.find('a[href="/settings/meal-plan"]').trigger('click')
        await flushPromises()

        expect(router.currentRoute.value.name).toBe('MealPlanSettings')
        expect(menu(wrapper).exists()).toBe(false)
        expect(content(wrapper).find('.page-meal-plan').exists()).toBe(true)
    })

    it('lands on Profile at /settings on a desktop, with the menu beside it', async () => {
        const {wrapper, router} = await mountAt('/settings', false)
        expect(router.currentRoute.value.name).toBe('AccountSettings')
        expect(menu(wrapper).exists()).toBe(true)
        expect(content(wrapper).find('.page-account').exists()).toBe(true)
    })

    it('shows the menu and the page together on a desktop, with no back button', async () => {
        const {wrapper} = await mountAt('/settings/cosmetic', false)
        expect(menu(wrapper).exists()).toBe(true)
        expect(content(wrapper).find('.page-cosmetic').exists()).toBe(true)
        expect(back(wrapper).exists()).toBe(false)
    })
})
