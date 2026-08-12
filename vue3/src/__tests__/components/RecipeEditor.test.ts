/**
 * "Track a recipe as a pantry food" - a recipe editor control that creates (or reuses,
 * via the backend's get_or_create-by-name dedup) a linked Food. Only shown for an
 * already-saved recipe, and hidden once a food is already linked so it can't be
 * triggered twice for the same recipe.
 */
import {describe, it, expect, beforeEach, vi} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {createPinia, setActivePinia} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'
import {apiMock, resetApiMock} from '@/__tests__/api-mock'
import {makeRecipe, makeFood} from '@/__tests__/factories'

vi.mock('@/openapi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/openapi')>()
    return {
        ...actual,
        ApiApi: class {constructor() { return apiMock }},
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

vi.mock('@vueuse/core', async (importOriginal) => {
    const {ref} = await import('vue')
    return {
        ...(await importOriginal<typeof import('@vueuse/core')>()),
        useStorage: (_key: string, defaultValue: any) => ref(defaultValue),
    }
})

import RecipeEditor from '@/components/model_editors/RecipeEditor.vue'

function mountEditor(item: any) {
    const pinia = createPinia()
    setActivePinia(pinia)

    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})

    return mount(RecipeEditor, {
        props: {item},
        global: {
            plugins: [pinia, i18n, vuetify],
            stubs: {
                ModelEditorBase: {template: '<div><slot /></div>'},
                ModelSelect: {template: '<div class="stub-model-select"/>'},
                RecipeImageEditor: {template: '<div class="stub-recipe-image-editor"/>'},
                StepEditor: {template: '<div class="stub-step-editor"/>'},
                PropertiesEditor: {template: '<div class="stub-properties-editor"/>'},
                ClosableHelpAlert: {template: '<div class="stub-help-alert"/>'},
                DeleteConfirmDialog: {template: '<div class="stub-delete-confirm"/>'},
                AiActionButton: {template: '<div class="stub-ai-action-button"/>'},
                NumberScalerDialog: {template: '<div class="stub-number-scaler"/>'},
                VueDraggable: {template: '<div><slot /></div>'},
            },
        },
    })
}

describe('RecipeEditor - track as pantry food', () => {
    beforeEach(() => {
        resetApiMock()
    })

    it('shows the Create Food control when the recipe has no linked food', async () => {
        const item = makeRecipe({id: 5, name: 'Sourdough Bread'})
        ;(apiMock as any).apiFoodList = vi.fn().mockResolvedValue({results: []})
        const w = mountEditor(item)
        ;(w.vm as any).tab = 'settings'
        await flushPromises()

        expect((apiMock as any).apiFoodList).toHaveBeenCalledWith({recipe: 5})
        expect(w.find('[data-test="create-food-button"]').exists()).toBe(true)
        expect(w.find('[data-test="linked-food-message"]').exists()).toBe(false)

        w.unmount()
    })

    it('hides the Create Food control and shows the linked food when one already exists', async () => {
        const item = makeRecipe({id: 5, name: 'Sourdough Bread'})
        const existingFood = makeFood({id: 42, name: 'Sourdough Bread', recipe: 5})
        ;(apiMock as any).apiFoodList = vi.fn().mockResolvedValue({results: [existingFood]})
        const w = mountEditor(item)
        ;(w.vm as any).tab = 'settings'
        await flushPromises()

        expect(w.find('[data-test="create-food-button"]').exists()).toBe(false)
        expect(w.find('[data-test="linked-food-message"]').exists()).toBe(true)
        expect((w.vm as any).linkedFood.name).toBe('Sourdough Bread')

        w.unmount()
    })

    it('clicking Create Food calls the backend action and then hides the control', async () => {
        const item = makeRecipe({id: 5, name: 'Sourdough Bread'})
        const createdFood = makeFood({id: 42, name: 'Sourdough Bread', recipe: 5})
        ;(apiMock as any).apiFoodList = vi.fn().mockResolvedValue({results: []})
        ;(apiMock as any).apiFoodCreateFromRecipeCreate = vi.fn().mockResolvedValue(createdFood)
        const w = mountEditor(item)
        ;(w.vm as any).tab = 'settings'
        await flushPromises()

        await w.find('[data-test="create-food-button"]').trigger('click')
        await flushPromises()

        expect((apiMock as any).apiFoodCreateFromRecipeCreate).toHaveBeenCalledWith({
            foodFromRecipe: {recipe: 5, name: 'Sourdough Bread'},
        })
        expect(w.find('[data-test="create-food-button"]').exists()).toBe(false)
        expect(w.find('[data-test="linked-food-message"]').exists()).toBe(true)
        expect((w.vm as any).linkedFood.name).toBe('Sourdough Bread')

        w.unmount()
    })

    it('does not show the Create Food control for a new, unsaved recipe', async () => {
        const w = mountEditor(null)
        await flushPromises()

        expect((apiMock as any).apiFoodList).not.toHaveBeenCalled()
        expect(w.find('[data-test="create-food-button"]').exists()).toBe(false)

        w.unmount()
    })
})
