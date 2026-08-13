/**
 * Opening the meal-plan-scoped Shopping List tab (MealPlanEditor -> ShoppingListView with
 * a mealPlanId prop) triggered a full, unfiltered load of every shopping list entry in the
 * household instead of just the entries for that one meal plan - onMounted() called
 * useShoppingStore().refreshFromAPI() with no arguments even though the API (and the store
 * function itself) already support scoping the request via a mealplan filter.
 */
import {describe, it, expect, beforeEach, vi} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {createPinia, setActivePinia} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'
import {apiMock, resetApiMock} from '@/__tests__/api-mock'
import {useUserPreferenceStore} from '@/stores/UserPreferenceStore'

vi.mock('@/openapi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/openapi')>()
    return {
        ...actual,
        ApiApi: class {constructor() { return apiMock }},
    }
})

vi.mock('@vueuse/core', async (importOriginal) => {
    const {ref} = await import('vue')
    return {
        ...(await importOriginal<typeof import('@vueuse/core')>()),
        useStorage: (_key: string, defaultValue: any) => ref(defaultValue),
    }
})

vi.mock('vue-i18n', async (importOriginal) => ({
    ...(await importOriginal<typeof import('vue-i18n')>()),
    useI18n: () => ({t: (key: string) => key}),
}))

vi.mock('vue-router', () => ({
    useRouter: () => ({push: vi.fn().mockResolvedValue(undefined)}),
    onBeforeRouteLeave: () => {},
}))

vi.mock('@vueuse/router', () => ({
    useRouteQuery: () => ({value: false}),
}))

import ShoppingListView from '@/components/display/ShoppingListView.vue'

function mountView(props: Record<string, any> = {}) {
    const pinia = createPinia()
    setActivePinia(pinia)

    // avoid the auto-sync setTimeout loop scheduling with a NaN delay from an empty userSettings default
    useUserPreferenceStore().userSettings.shoppingAutoSync = 0

    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})

    return mount(ShoppingListView, {
        props,
        global: {
            plugins: [pinia, i18n, vuetify],
            stubs: {
                ModelSelect: {template: '<div class="stub-model-select"/>'},
                ShoppingLineItem: {template: '<div class="stub-shopping-line-item"/>'},
                NumberScalerDialog: {template: '<div class="stub-number-scaler"/>'},
                SupermarketEditor: {template: '<div class="stub-supermarket-editor"/>'},
                DeleteConfirmDialog: {template: '<div class="stub-delete-confirm"/>'},
                ShoppingListEntryInput: {template: '<div class="stub-shopping-list-entry-input"/>'},
                ModelEditDialog: {template: '<div class="stub-model-edit-dialog"/>'},
                ShoppingExportDialog: {template: '<div class="stub-shopping-export-dialog"/>'},
                StockUpDialog: {template: '<div class="stub-stock-up-dialog"/>'},
                AddToShoppingDialog: {template: '<div class="stub-add-to-shopping-dialog"/>'},
                ShoppingListSelectChip: {template: '<div class="stub-shopping-list-select-chip"/>'},
                CategorySelectChip: {template: '<div class="stub-category-select-chip"/>'},
            },
        },
    })
}

describe('ShoppingListView', () => {
    beforeEach(() => {
        resetApiMock()
        ;(apiMock as any).apiShoppingListEntryList = vi.fn().mockResolvedValue({count: 0, next: null, previous: null, results: [], timestamp: new Date()})
        ;(apiMock as any).apiSupermarketCategoryList = vi.fn().mockResolvedValue({count: 0, next: null, previous: null, results: []})
        ;(apiMock as any).apiSupermarketList = vi.fn().mockResolvedValue({count: 0, next: null, previous: null, results: []})
        ;(apiMock as any).apiShoppingListList = vi.fn().mockResolvedValue({count: 0, next: null, previous: null, results: []})
    })

    it('scopes the initial entry load to the given meal plan instead of fetching the whole shopping list', async () => {
        const w = mountView({mealPlanId: 42})
        await flushPromises()

        expect(apiMock.apiShoppingListEntryList).toHaveBeenCalledWith(expect.objectContaining({mealplan: 42}))

        w.unmount()
    })

    it('loads the full, unscoped list when no meal plan id is given', async () => {
        const w = mountView({})
        await flushPromises()

        expect(apiMock.apiShoppingListEntryList).toHaveBeenCalledWith(expect.not.objectContaining({mealplan: expect.anything()}))

        w.unmount()
    })
})
