import {describe, it, expect, vi, beforeEach} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {createVuetify} from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import {createI18n} from 'vue-i18n'

import {apiMock, resetApiMock} from '@/__tests__/api-mock'

vi.mock('@/openapi', async (imp) => ({...(await imp<any>()), ApiApi: class { constructor() { return apiMock } }}))

const {addErrorMock} = vi.hoisted(() => ({addErrorMock: vi.fn()}))
vi.mock('@/stores/MessageStore', async (imp) => ({...(await imp<any>()), useMessageStore: () => ({addError: addErrorMock, addPreparedMessage: vi.fn()})}))

import BatchAddToMealPlanDialog from '@/components/dialogs/BatchAddToMealPlanDialog.vue'

const RECIPE_1 = {id: 1, name: 'Soup', servings: 4}
const RECIPE_2 = {id: 2, name: 'Salad', servings: 2}
const DINNER = {id: 3, name: 'Dinner', time: '18:00:00'}

function mountDialog() {
    const vuetify = createVuetify({components, directives})
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    return mount(BatchAddToMealPlanDialog, {
        attachTo: document.body,
        props: {items: [RECIPE_1, RECIPE_2] as any, modelValue: false},
        global: {
            plugins: [vuetify, i18n],
            stubs: {ModelSelect: {template: '<div class="model-select-stub" />'}},
        },
    })
}

function clickButton(text: string) {
    const btn = [...document.querySelectorAll('.v-btn')].find(b => b.textContent?.includes(text)) as HTMLElement | undefined
    btn?.click()
}

describe('BatchAddToMealPlanDialog', () => {
    beforeEach(() => {
        resetApiMock()
        apiMock.apiMealPlanCreate.mockResolvedValue({})
    })

    it('creates one MealPlan per selected recipe, all sharing the chosen date and meal type', async () => {
        const wrapper = mountDialog()
        await wrapper.setProps({modelValue: true})
        ;(wrapper.vm as any).date = new Date('2026-09-01T00:00:00')
        ;(wrapper.vm as any).mealType = DINNER
        await wrapper.vm.$nextTick()

        clickButton('Add')
        await flushPromises()

        expect(apiMock.apiMealPlanCreate).toHaveBeenCalledTimes(2)
        const calls = (apiMock.apiMealPlanCreate as any).mock.calls
        expect(calls[0][0].mealPlan.recipe).toEqual(RECIPE_1)
        expect(calls[0][0].mealPlan.servings).toBe(4)
        expect(calls[1][0].mealPlan.recipe).toEqual(RECIPE_2)
        expect(calls[1][0].mealPlan.servings).toBe(2)
        for (const call of calls) {
            expect(call[0].mealPlan.mealType).toEqual(DINNER)
            const fromDate: Date = call[0].mealPlan.fromDate
            expect(fromDate.getHours()).toBe(18)
            expect(fromDate.getMinutes()).toBe(0)
        }
    })
})
