/**
 * MealPlanMealTypeLegend: the meal types with their colours, so a colour on a meal plan entry can be read without guessing.
 */
import {describe, it, expect, vi, beforeEach} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {createPinia, setActivePinia} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'

import {apiMock, resetApiMock} from '@/__tests__/api-mock'
import {makeMealType} from '@/__tests__/factories'

vi.mock('@/openapi', async (imp) => ({...(await imp<any>()), ApiApi: class { constructor() { return apiMock } }}))
vi.mock('@vueuse/core', async (imp) => {
    const {ref} = await import('vue')
    return {...(await imp<any>()), useStorage: (_key: string, defaultValue: any) => ref(defaultValue)}
})
vi.mock('@vueuse/router', () => ({useRouteQuery: () => ({value: false})}))
vi.mock('vue-router', () => ({useRouter: () => ({push: vi.fn(), replace: vi.fn()}), useRoute: () => ({query: {}})}))

import MealPlanMealTypeLegend from '@/components/display/MealPlanMealTypeLegend.vue'

function mountLegend() {
    const pinia = createPinia()
    setActivePinia(pinia)
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    return mount(MealPlanMealTypeLegend, {attachTo: document.body, global: {plugins: [pinia, i18n, createVuetify()]}})
}

describe('MealPlanMealTypeLegend', () => {
    beforeEach(() => {
        resetApiMock()
        document.body.innerHTML = ''
    })

    it('lists every meal type by name, in meal type order', async () => {
        apiMock.apiMealTypeList.mockResolvedValue({results: [
            makeMealType({id: 2, name: 'Dinner', order: 2}),
            makeMealType({id: 1, name: 'Lunch', order: 1}),
        ]})
        const w = mountLegend()
        await flushPromises()
        expect(w.findAll('[data-test="legend-item"]').map(i => i.text())).toEqual(['Lunch', 'Dinner'])
    })

    it("draws each meal type's colour as the strip entries use, and a neutral one when it has none", async () => {
        apiMock.apiMealTypeList.mockResolvedValue({results: [
            makeMealType({id: 1, name: 'Bar Menu', order: 1, color: '#ff0000'}),
            makeMealType({id: 2, name: 'Dinner', order: 2, color: ''}),
        ]})
        const w = mountLegend()
        await flushPromises()

        const [colored, plain] = w.findAll('[data-test="legend-bar"]')
        expect(colored.attributes('data-colored')).toBe('true')
        expect(colored.attributes('style')).toContain('rgb(255, 0, 0)')
        expect(plain.attributes('data-colored')).toBe('false')
    })

    it('loads the meal types once', async () => {
        apiMock.apiMealTypeList.mockResolvedValue({results: []})
        mountLegend()
        await flushPromises()
        expect(apiMock.apiMealTypeList).toHaveBeenCalledTimes(1)
    })
})
