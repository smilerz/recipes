/**
 * #21: clearing the Date field (v-date-input emits an empty array, not null) crashed
 * Save with `Cannot read properties of undefined (reading 'toISOString')`. updateDate()'s
 * guard checked `dateRangeValue.value != null`, which an empty array passes, so
 * editingObj.fromDate got set to `dateRangeValue.value[0]` (undefined) instead of hitting
 * the existing "Missing Date" warning branch.
 */
import {describe, it, expect, beforeEach, vi} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {createPinia, setActivePinia} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'
import {apiMock, resetApiMock} from '@/__tests__/api-mock'
import {makeMealPlan} from '@/__tests__/factories'
import {useMessageStore} from '@/stores/MessageStore'

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
}))

vi.mock('@vueuse/router', () => ({
    useRouteQuery: () => ({value: false}),
}))

import MealPlanEditor from '@/components/model_editors/MealPlanEditor.vue'

function mountEditor(item: any) {
    const pinia = createPinia()
    setActivePinia(pinia)

    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})

    return mount(MealPlanEditor, {
        props: {item},
        global: {
            plugins: [pinia, i18n, vuetify],
            stubs: {
                ModelEditorBase: {
                    template: '<div><button class="save-btn" @click="$emit(\'save\')" /></div>',
                    emits: ['save'],
                },
            },
        },
    })
}

describe('MealPlanEditor', () => {
    beforeEach(() => {
        resetApiMock()
    })

    it('clearing the date (empty array, not null) does not corrupt fromDate and warns instead of crashing (#21)', async () => {
        const item = makeMealPlan({id: 8, fromDate: new Date('2026-05-11T14:45:00'), toDate: new Date('2026-05-11T14:45:00')})
        const w = mountEditor(item)
        await flushPromises()

        expect((w.vm as any).editingObj.fromDate).toBeInstanceOf(Date)

        // simulate the user clearing the v-date-input: it emits [], not null
        ;(w.vm as any).dateRangeValue = []
        ;(w.vm as any).updateDate()
        await flushPromises()

        expect((w.vm as any).editingObj.fromDate, 'fromDate must not become undefined').toBeInstanceOf(Date)

        const messageStore = useMessageStore()
        expect(messageStore.messages.some(m => m.msg.text === 'Missing Date'), 'should warn instead of silently corrupting the date').toBe(true)

        w.unmount()
    })

    it('saving after clearing-then-recovering the date does not throw (#21)', async () => {
        const item = makeMealPlan({id: 8, fromDate: new Date('2026-05-11T14:45:00'), toDate: new Date('2026-05-11T14:45:00')})
        ;(apiMock as any).apiMealPlanUpdate = vi.fn().mockResolvedValue(item)
        const w = mountEditor(item)
        await flushPromises()

        ;(w.vm as any).dateRangeValue = []
        ;(w.vm as any).updateDate()
        await flushPromises()

        await w.find('.save-btn').trigger('click')
        await flushPromises()

        expect((apiMock as any).apiMealPlanUpdate).toHaveBeenCalled()
        const sentFromDate = ((apiMock as any).apiMealPlanUpdate as any).mock.calls[0][0].mealPlan.fromDate
        expect(sentFromDate).toBeInstanceOf(Date)

        w.unmount()
    })

    // #1: switching to the Shopping tab on a plan that already has a recipe but no shopping
    // list yet used to just show an empty list - the only populate trigger lived on the other
    // (Meal Plan) tab, easy to never find. It should offer the same pantry-aware, scale-adjusted
    // preview automatically instead of dead-ending.
    it('opens the pantry-aware shopping preview when switching to the Shopping tab on an unpopulated plan', async () => {
        const item = makeMealPlan({id: 8, shopping: false})
        const w = mountEditor(item)
        await flushPromises()

        expect((w.vm as any).shoppingPreviewOpen).toBe(false)

        ;(w.vm as any).tab = 'shopping'
        await flushPromises()

        expect((w.vm as any).shoppingPreviewOpen).toBe(true)
        expect((w.vm as any).previewPlan?.id).toBe(8)

        w.unmount()
    })

    it('does not reopen the preview once the plan already has a shopping list', async () => {
        const item = makeMealPlan({id: 9, shopping: true})
        const w = mountEditor(item)
        await flushPromises()

        ;(w.vm as any).tab = 'shopping'
        await flushPromises()

        expect((w.vm as any).shoppingPreviewOpen).toBe(false)

        w.unmount()
    })

    // The dialog's "created" event already persisted the shopping-list entries independently of
    // Save - the nested editingObj.shopping mutation shouldn't mark the whole plan as unsaved.
    it('creating the shopping list from the preview does not mark the plan as unsaved', async () => {
        const item = makeMealPlan({id: 10, shopping: false})
        const w = mountEditor(item)
        await flushPromises()

        expect((w.vm as any).editingObjChanged).toBe(false)

        ;(w.vm as any).onShoppingCreated()
        await flushPromises()

        expect((w.vm as any).editingObj.shopping).toBe(true)
        expect((w.vm as any).editingObjChanged).toBe(false)

        w.unmount()
    })
})
