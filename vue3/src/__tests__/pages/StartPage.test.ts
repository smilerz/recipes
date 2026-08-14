import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, type PiniaPlugin } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createRouter, createMemoryHistory } from 'vue-router'
import { apiMock, resetApiMock } from '@/__tests__/api-mock'
import { mountPage } from '@/__tests__/pages/page-mount-helper'

vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    ApiApi: class { constructor() { return apiMock } },
}))

vi.mock('@vueuse/core', async () => {
    const { ref } = await import('vue')
    return {
        useStorage: (_key: string, defaultValue: any) => ref(defaultValue),
    }
})

vi.mock('@vueuse/router', () => ({
    useRouteQuery: () => ({ value: false }),
}))

import StartPage from '@/pages/StartPage.vue'

describe('StartPage', () => {
    beforeEach(() => {
        resetApiMock()
    })

    it('calls apiRecipeList on mount', async () => {
        apiMock.apiRecipeList.mockResolvedValue({ results: [], count: 0 })
        mountPage(StartPage)
        await flushPromises()
        expect(apiMock.apiRecipeList).toHaveBeenCalledWith({ pageSize: 1 })
    })

    it('shows empty state when no recipes exist', async () => {
        apiMock.apiRecipeList.mockResolvedValue({ results: [], count: 0 })
        const wrapper = mountPage(StartPage)
        await flushPromises()
        expect(wrapper.text()).toContain('search_no_recipes')
    })

    it('shows recipe scrollers when recipes exist', async () => {
        apiMock.apiRecipeList.mockResolvedValue({ results: [{}], count: 15 })
        const wrapper = mountPage(StartPage)
        await flushPromises()
        expect(wrapper.text()).not.toContain('search_no_recipes')
        expect(wrapper.findAll('.stub-horizontal-recipe-scroller').length).toBeGreaterThan(0)
    })

    it('shows random scroller even with few recipes', async () => {
        apiMock.apiRecipeList.mockResolvedValue({ results: [{}], count: 5 })
        const wrapper = mountPage(StartPage)
        await flushPromises()
        expect(wrapper.findAll('.stub-horizontal-recipe-scroller').length).toBe(1)
    })
})

// The legacy `start_showMealPlan` device-setting migration forces the meal_plan section off
// whenever it sees the stale flag, even if the user has ALREADY saved real startPageSections
// (e.g. via the new Start Page Settings UI moments earlier, re-enabling meal_plan themselves).
// It should only apply when the user has never saved real sections at all.
describe('legacy start_showMealPlan migration', () => {
    function mountWithPrefs(userSettings: any, deviceSettings: any) {
        const prePopulate: PiniaPlugin = ({ store }) => {
            if (store.$id === 'user_preference_store') {
                store.userSettings = userSettings
                store.deviceSettings = { ...store.deviceSettings, ...deviceSettings }
            }
        }
        const pinia = createPinia()
        pinia.use(prePopulate)
        const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false })
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [
                { path: '/', name: 'StartPage', component: { template: '<div/>' } },
                { path: '/search', name: 'SearchPage', component: { template: '<div/>' } },
                { path: '/edit/:model/:id?', name: 'ModelEditPage', component: { template: '<div/>' } },
                { path: '/import', name: 'RecipeImportPage', component: { template: '<div/>' } },
            ],
        })
        return mount(StartPage, {
            global: {
                plugins: [pinia, i18n, router],
                stubs: {
                    HorizontalRecipeScroller: { template: '<div class="stub-horizontal-recipe-scroller"/>' },
                    HorizontalMealPlanWindow: { template: '<div class="stub-horizontal-meal-plan-window"/>' },
                },
            },
        })
    }

    beforeEach(() => {
        resetApiMock()
        apiMock.apiRecipeList.mockResolvedValue({ results: [{}], count: 5 })
    })

    it('does not override a real, already-saved meal_plan choice', async () => {
        apiMock.apiUserPreferencePartialUpdate.mockResolvedValue({})
        const wrapper = mountWithPrefs(
            { user: { id: 1 }, startPageSections: [{ mode: 'meal_plan', enabled: true }, { mode: 'recent', enabled: true, min_recipes: 10 }] },
            { start_showMealPlan: false },
        )
        await flushPromises()

        expect((wrapper.vm as any).sections.find((s: any) => s.mode === 'meal_plan').enabled).toBe(true)
        expect(apiMock.apiUserPreferencePartialUpdate).not.toHaveBeenCalled()
    })

    it('still applies the migration when no real sections have ever been saved', async () => {
        apiMock.apiUserPreferencePartialUpdate.mockImplementation((params: any) => Promise.resolve(params.patchedUserPreference))
        const wrapper = mountWithPrefs(
            { user: { id: 1 }, startPageSections: undefined },
            { start_showMealPlan: false },
        )
        await flushPromises()

        expect((wrapper.vm as any).sections.find((s: any) => s.mode === 'meal_plan').enabled).toBe(false)
        expect(apiMock.apiUserPreferencePartialUpdate).toHaveBeenCalled()
    })
})
