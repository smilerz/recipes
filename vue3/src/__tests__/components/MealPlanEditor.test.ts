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
                    template: '<div><button class="save-btn" @click="$emit(\'save\')" /><slot /></div>',
                    emits: ['save'],
                },
                ModelSelect: {template: '<div class="stub-model-select"/>'},
                RecipeCard: {template: '<div class="stub-recipe-card"/>'},
                ClosableHelpAlert: {template: '<div class="stub-help-alert"/>'},
                RecipeShoppingPreview: {template: '<div class="stub-recipe-shopping-preview"/>'},
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

    // #1 (revised after live feedback, three times now): the original fix auto-opened a preview
    // DIALOG on Shopping-tab navigation, which could silently attempt to save an unsaved plan and
    // surface a raw 400 if a required field (meal type) was missing. That became checking "Add to
    // Shopping" opens a dialog instead - redundant once the tab shows the identical preview
    // content inline (item 17). That became auto-switching to the tab (item 18) - user feedback
    // again: checking the box should just reveal the tab as reachable, not navigate there for the
    // user. The tab visibility can't rely solely on editingObj.addshopping past a save, though -
    // it's a write-only backend field, never echoed back in the response.
    it('reveals the Shopping tab without switching to it when Add to Shopping is checked', async () => {
        const item = makeMealPlan({id: 8, shopping: false})
        const w = mountEditor(item)
        await flushPromises()

        expect(w.findAll('.v-tab').some(t => t.text().includes('Shopping'))).toBe(false)

        ;(w.vm as any).editingObj.addshopping = true
        await flushPromises()

        expect((w.vm as any).tab).toBe('plan')
        expect(w.findAll('.v-tab').some(t => t.text().includes('Shopping'))).toBe(true)

        w.unmount()
    })

    it('does not affect tab state once the plan already has a shopping list', async () => {
        const item = makeMealPlan({id: 9, shopping: true})
        const w = mountEditor(item)
        await flushPromises()

        ;(w.vm as any).editingObj.addshopping = true
        await flushPromises()

        expect((w.vm as any).tab).toBe('plan')

        w.unmount()
    })

    // The backend's `addshopping` field is write_only - a create/update response never echoes it
    // back, so editingObj.addshopping reverts to undefined right after Save even though the user's
    // intent (and onSave()'s own resolveMealplanShoppingAction result) was to review/add shopping
    // items. Without a separate signal, the tab would vanish the instant Save completes.
    it('keeps the Shopping tab visible after Save even though addshopping is not echoed back', async () => {
        const created = makeMealPlan({id: 22, shopping: false})
        delete (created as any).addshopping
        ;(apiMock as any).apiMealPlanCreate = vi.fn().mockResolvedValue(created)
        const w = mountEditor(null)
        await flushPromises()
        ;(w.vm as any).editingObj.recipe = created.recipe
        ;(w.vm as any).editingObj.mealType = created.mealType
        ;(w.vm as any).editingObj.addshopping = true
        await flushPromises()

        await w.find('.save-btn').trigger('click')
        await flushPromises()

        expect((w.vm as any).editingObj.addshopping).toBeUndefined()
        expect(w.findAll('.v-tab').some(t => t.text().includes('Shopping'))).toBe(true)

        w.unmount()
    })

    // The dialog's "created" event already persisted the shopping-list entries independently of
    // Save - the nested editingObj.shopping mutation shouldn't mark the whole plan as unsaved.
    it('creating the shopping list from the preview does not mark the plan as unsaved', async () => {
        const item = makeMealPlan({id: 10, shopping: false})
        ;(apiMock as any).apiShoppingListEntryList = vi.fn().mockResolvedValue({count: 0, next: null, previous: null, results: [], timestamp: new Date()})
        const w = mountEditor(item)
        await flushPromises()

        expect((w.vm as any).editingObjChanged).toBe(false)

        ;(w.vm as any).onShoppingCreated()
        await flushPromises()

        expect((w.vm as any).editingObj.shopping).toBe(true)
        expect((w.vm as any).editingObjChanged).toBe(false)

        w.unmount()
    })

    // The Shopping tab used to embed the global ShoppingListView (loading the whole household
    // list); it now fetches just this plan's entries directly for the shared preview component.
    describe('loading scoped shopping entries', () => {
        it('fetches entries scoped to this plan when switching to the Shopping tab', async () => {
            const item = makeMealPlan({id: 20, shopping: true})
            ;(apiMock as any).apiShoppingListEntryList = vi.fn().mockResolvedValue({count: 1, next: null, previous: null, results: [{id: 501}], timestamp: new Date()})
            const w = mountEditor(item)
            await flushPromises()

            ;(w.vm as any).tab = 'shopping'
            await flushPromises()

            expect((apiMock as any).apiShoppingListEntryList).toHaveBeenCalledWith(expect.objectContaining({mealplan: 20}))
            expect((w.vm as any).shoppingEntries).toEqual([{id: 501}])

            w.unmount()
        })

        it('loads entries immediately once the preview commits, without waiting for a tab switch', async () => {
            const item = makeMealPlan({id: 21, shopping: false})
            ;(apiMock as any).apiShoppingListEntryList = vi.fn().mockResolvedValue({count: 1, next: null, previous: null, results: [{id: 900}], timestamp: new Date()})
            const w = mountEditor(item)
            await flushPromises()

            ;(w.vm as any).onShoppingCreated()
            await flushPromises()

            expect((apiMock as any).apiShoppingListEntryList).toHaveBeenCalledWith(expect.objectContaining({mealplan: 21}))
            expect((w.vm as any).shoppingEntries).toEqual([{id: 900}])

            w.unmount()
        })
    })

    // Live-testing #1 surfaced a real bug: switching to the Shopping tab on a brand-new plan
    // with no meal type yet auto-attempted a save, hit the backend's required-field validation,
    // and dumped a raw 400 on the user. Redesigned per user feedback: the "Add to Shopping"
    // checkbox is the single trigger (both new and existing plans); it only stages the preview
    // (needs the recipe, not a saved plan), so there's no precondition to gate on anymore. The
    // Shopping tab stays hidden until the checkbox is checked or a list already exists, so it's
    // never a dead end and never silently saves.
    describe('Add to Shopping checkbox + Shopping tab gating', () => {
        it('shows the checkbox for an existing plan with a recipe and no shopping list yet', async () => {
            const item = makeMealPlan({id: 12, shopping: false})
            const w = mountEditor(item)
            await flushPromises()

            expect(w.find('[data-test="addshopping-checkbox"]').exists()).toBe(true)
        })

        it('hides the checkbox once a shopping list already exists', async () => {
            const item = makeMealPlan({id: 13, shopping: true})
            const w = mountEditor(item)
            await flushPromises()

            expect(w.find('[data-test="addshopping-checkbox"]').exists()).toBe(false)
        })

        it('hides the Shopping tab until the checkbox is checked or a list already exists', async () => {
            const item = makeMealPlan({id: 14, shopping: false})
            const w = mountEditor(item)
            await flushPromises()

            expect(w.findAll('.v-tab').some(t => t.text().includes('Shopping'))).toBe(false)

            ;(w.vm as any).editingObj.addshopping = true
            await flushPromises()

            expect(w.findAll('.v-tab').some(t => t.text().includes('Shopping'))).toBe(true)
        })

        it('shows the Shopping tab immediately when the plan already has a shopping list', async () => {
            const item = makeMealPlan({id: 15, shopping: true})
            const w = mountEditor(item)
            await flushPromises()

            expect(w.findAll('.v-tab').some(t => t.text().includes('Shopping'))).toBe(true)
        })

        it('checking the box for an existing plan reveals the Shopping tab immediately, no save needed, no tab switch', async () => {
            const item = makeMealPlan({id: 16, shopping: false})
            const w = mountEditor(item)
            await flushPromises()

            const checkbox = w.find('[data-test="addshopping-checkbox"] input[type="checkbox"]')
            await checkbox.setValue(true)
            await flushPromises()

            expect((w.vm as any).tab).toBe('plan')
            expect(w.findAll('.v-tab').some(t => t.text().includes('Shopping'))).toBe(true)
            expect(apiMock.apiMealPlanUpdate).not.toHaveBeenCalled()
        })

        it('checking the box for a new (unsaved) plan also reveals the Shopping tab by default, without saving or switching', async () => {
            const w = mountEditor(null)
            await flushPromises()
            ;(w.vm as any).editingObj.recipe = makeMealPlan().recipe
            await flushPromises()

            const checkbox = w.find('[data-test="addshopping-checkbox"] input[type="checkbox"]')
            await checkbox.setValue(true)
            await flushPromises()

            expect((w.vm as any).tab).toBe('plan')
            expect(w.findAll('.v-tab').some(t => t.text().includes('Shopping'))).toBe(true)
            expect(apiMock.apiMealPlanCreate).not.toHaveBeenCalled()
        })

        // The browser-remembered fast path (D11 P2a) is unchanged by this redesign: it still
        // bypasses the preview entirely for a new plan, deferring to onSave()'s existing
        // resolveMealplanShoppingAction logic to send addshopping straight through on create.
        it('does not switch tabs for a new plan when the skip-preview fast path is enabled', async () => {
            const w = mountEditor(null)
            await flushPromises()
            ;(w.vm as any).editingObj.recipe = makeMealPlan().recipe
            ;(w.vm as any).deviceSettings.mealplan_shopping_skipPreview = true
            await flushPromises()

            const checkbox = w.find('[data-test="addshopping-checkbox"] input[type="checkbox"]')
            await checkbox.setValue(true)
            await flushPromises()

            expect((w.vm as any).tab).toBe('plan')
        })
    })

    describe('ensurePlanSaved', () => {
        it('returns the existing plan as-is without saving', async () => {
            const item = makeMealPlan({id: 17, shopping: false})
            const w = mountEditor(item)
            await flushPromises()

            const result = await (w.vm as any).ensurePlanSaved()

            expect(result?.id).toBe(17)
            expect(apiMock.apiMealPlanUpdate).not.toHaveBeenCalled()
            expect(apiMock.apiMealPlanCreate).not.toHaveBeenCalled()
        })

        it('saves a new plan and returns the created object', async () => {
            const created = makeMealPlan({id: 18})
            ;(apiMock as any).apiMealPlanCreate = vi.fn().mockResolvedValue(created)
            const w = mountEditor(null)
            await flushPromises()
            ;(w.vm as any).editingObj.recipe = created.recipe
            ;(w.vm as any).editingObj.mealType = created.mealType

            const result = await (w.vm as any).ensurePlanSaved()

            expect((apiMock as any).apiMealPlanCreate).toHaveBeenCalled()
            expect(result?.id).toBe(18)
            expect((w.vm as any).editingObj.id).toBe(18)
        })

        // Bug found live: ensurePlanSaved() is only ever called right before the caller (the
        // shopping preview) commits its own entries - if the save payload still carries
        // addshopping: true, the backend's MealPlan serializer ALSO silently auto-adds
        // (RecipeShoppingEditor, server-side), producing a second, duplicate ShoppingListRecipe
        // for the same plan+recipe. onSave() already resolves this for the Save-button path
        // (resolveMealplanShoppingAction) - ensurePlanSaved() needs the same protection.
        it('clears addshopping before saving, so the backend does not also silently auto-add', async () => {
            const created = makeMealPlan({id: 19})
            ;(apiMock as any).apiMealPlanCreate = vi.fn().mockResolvedValue(created)
            const w = mountEditor(null)
            await flushPromises()
            ;(w.vm as any).editingObj.recipe = created.recipe
            ;(w.vm as any).editingObj.mealType = created.mealType
            ;(w.vm as any).editingObj.addshopping = true

            await (w.vm as any).ensurePlanSaved()

            const sentPayload = ((apiMock as any).apiMealPlanCreate.mock.calls[0][0] as any).mealPlan
            expect(sentPayload.addshopping).toBe(false)
        })
    })
})
