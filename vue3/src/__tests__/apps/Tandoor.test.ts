/**
 * The v-navigation-drawer and v-bottom-navigation nav-item renderers only forwarded
 * {prependIcon, title, to} via v-bind, silently dropping href/onClick even though the
 * same item shape supports them (and the sibling getUserNavigation() template already
 * forwards all four explicitly). Any plugin/future nav entry using href or onClick
 * rendered inert. This test proves both renderers now forward href and onClick.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, type PiniaPlugin } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'
import { ref } from 'vue'
import { VListItem } from 'vuetify/components'
import { apiMock, resetApiMock } from '@/__tests__/api-mock'
import { makeUserPreference, makeSpace } from '@/__tests__/factories'

// Must be a real Vue ref so the template's `!mobile`/`mobile` auto-unwrap works -
// a plain {value} object stays truthy regardless of its value.
const mobileRef = ref(false)
vi.mock('vuetify', async (importOriginal) => {
    const orig = await importOriginal<any>()
    return { ...orig, useDisplay: () => ({ mobile: mobileRef }) }
})

// component: VListItem matches what useNavigation.ts actually returns - a plain
// string tag like 'a' would render href/title as invisible DOM attributes instead
// of visible list-item text, which isn't representative of the real bug surface.
const drawerItem = { component: VListItem, title: 'Plugin Drawer Link', prependIcon: 'fa-solid fa-star', href: 'https://plugin.example.com/drawer' }
const bottomOnClick = vi.fn()
const bottomItem = { component: VListItem, title: 'Plugin Bottom Action', prependIcon: 'fa-solid fa-bolt', onClick: bottomOnClick }

vi.mock('@/composables/useNavigation', () => ({
    useNavigation: () => ({
        getNavigationDrawer: () => [drawerItem],
        getBottomNavigation: () => [bottomItem],
        getUserNavigation: () => [],
    }),
}))

vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    ApiApi: class { constructor() { return apiMock } },
}))

vi.mock('@vueuse/core', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    useTitle: () => ref(''),
    useStorage: (_key: string, defaultValue: any) => ref(defaultValue),
}))

vi.mock('@vueuse/router', () => ({
    useRouteQuery: () => ref(false),
}))

// HelpDialog transitively imports HelpView, which imports @/i18n - a module that
// pulls in a virtual Vite plugin module only available in real dev/build, not under
// vitest. vue-test-utils `stubs` only swaps the render tree, not the static ES import
// inside Tandoor.vue's <script setup>, so this must be mocked at module resolution.
vi.mock('@/components/dialogs/HelpDialog.vue', () => ({ default: { template: '<div/>' } }))
vi.mock('@/components/inputs/GlobalSearchDialog.vue', () => ({ default: { template: '<div/>' } }))
vi.mock('@/components/inputs/RecipeViewSettingsDrawer.vue', () => ({ default: { template: '<div/>' } }))
vi.mock('@/components/display/VSnackbarQueued.vue', () => ({ default: { template: '<div/>' } }))
vi.mock('@/components/display/NavigationDrawerContextMenu.vue', () => ({ default: { props: { actionsOnly: Boolean }, template: '<div class="stub-nav-context-menu" :data-actions-only="String(!!actionsOnly)"/>' } }))
vi.mock('@/components/display/MenuUserInfo.vue', () => ({ default: { template: '<div/>' } }))

import Tandoor from '@/apps/tandoor/Tandoor.vue'

function mountApp() {
    const prePopulate: PiniaPlugin = ({ store }) => {
        if (store.$id === 'user_preference_store') {
            store.initCompleted = true
            store.userSettings = makeUserPreference() as any
            store.activeSpace = makeSpace({ spaceSetupCompleted: true }) as any
            store.isAuthenticated = true
        }
    }
    const pinia = createPinia()
    pinia.use(prePopulate)
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false })
    const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives })
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/', name: 'StartPage', component: { template: '<div/>' } },
            { path: '/settings', name: 'SettingsPage', component: { template: '<div/>' } },
            { path: '/welcome', name: 'WelcomePage', component: { template: '<div/>' } },
            { path: '/edit/:model/:id?', name: 'ModelEditPage', component: { template: '<div/>' } },
            { path: '/import', name: 'RecipeImportPage', component: { template: '<div/>' } },
            { path: '/mealplan', name: 'MealPlanPage', component: { template: '<div/>' } },
            { path: '/shopping', name: 'ShoppingListPage', component: { template: '<div/>' } },
        ],
    })

    return mount(Tandoor, {
        global: {
            plugins: [pinia, i18n, vuetify, router],
            stubs: {
                GlobalSearchDialog: { template: '<div/>' },
                RecipeViewSettingsDrawer: { template: '<div/>' },
                VSnackbarQueued: { template: '<div/>' },
                NavigationDrawerContextMenu: { props: { actionsOnly: Boolean }, template: '<div class="stub-nav-context-menu" :data-actions-only="String(!!actionsOnly)"/>' },
                HelpDialog: { template: '<div/>' },
                MenuUserInfo: { template: '<div/>' },
            },
        },
    })
}

describe('Tandoor nav-item forwarding', () => {
    beforeEach(() => {
        resetApiMock()
    })

    it('forwards href to plugin items in the desktop navigation drawer', async () => {
        mobileRef.value = false
        apiMock.apiUserPreferenceList.mockResolvedValue({ results: [] })
        const wrapper = mountApp()
        await flushPromises()

        const link = wrapper.findAll('a').find(a => a.text().includes('Plugin Drawer Link'))
        expect(link).toBeTruthy()
        expect(link!.attributes('href')).toBe('https://plugin.example.com/drawer')

        wrapper.unmount()
    })

    it('forwards onClick to plugin items in the mobile bottom navigation', async () => {
        mobileRef.value = true
        apiMock.apiUserPreferenceList.mockResolvedValue({ results: [] })
        const wrapper = mountApp()
        await flushPromises()

        // The plugin item list lives inside a v-bottom-sheet (activator="parent") that only
        // renders its content once opened - open it by clicking its activator button first.
        const menuButton = wrapper.findAll('button').find(b => b.find('.fa-bars').exists())
        expect(menuButton).toBeTruthy()
        await menuButton!.trigger('click')
        await flushPromises()

        // v-bottom-sheet teleports its content to document.body, outside wrapper's own root.
        const item = Array.from(document.body.querySelectorAll('[role="listitem"]')).find(el => el.textContent?.trim() === 'Plugin Bottom Action')
        expect(item).toBeTruthy()
        ;(item as HTMLElement).click()

        expect(bottomOnClick).toHaveBeenCalled()

        wrapper.unmount()
    })

    // The page-specific entries (the Meal Plan's Auto Planner and calendar export) live in a context menu that sat only in the
    // desktop drawer, so a phone had no way to reach them.
    it('shows the page-specific context menu in the desktop drawer, with its settings', async () => {
        mobileRef.value = false
        apiMock.apiUserPreferenceList.mockResolvedValue({ results: [] })
        const wrapper = mountApp()
        await flushPromises()

        const menu = wrapper.find('.stub-nav-context-menu')
        expect(menu.exists()).toBe(true)
        expect(menu.attributes('data-actions-only')).toBe('false')

        wrapper.unmount()
    })

    it('shows the page-specific actions in the mobile menu sheet, and a click on them does not close the sheet', async () => {
        mobileRef.value = true
        apiMock.apiUserPreferenceList.mockResolvedValue({ results: [] })
        const wrapper = mountApp()
        await flushPromises()

        const menuButton = wrapper.findAll('button').find(b => b.find('.fa-bars').exists())
        await menuButton!.trigger('click')
        await flushPromises()

        const menu = document.body.querySelector('.stub-nav-context-menu') as HTMLElement
        expect(menu).toBeTruthy()
        expect(menu.getAttribute('data-actions-only')).toBe('true')

        // the sheet closes on a click on its content; the dialogs opened from these items must not lose their item with it
        expect(document.body.querySelector('.v-bottom-sheet.v-overlay--active')).toBeTruthy()
        menu.click()
        await flushPromises()
        expect(document.body.querySelector('.v-bottom-sheet.v-overlay--active')).toBeTruthy()

        wrapper.unmount()
    })
})
