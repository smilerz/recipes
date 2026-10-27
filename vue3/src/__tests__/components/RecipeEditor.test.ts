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
import ModelEditorBase from '@/components/model_editors/ModelEditorBase.vue'
import ModelSelect from '@/components/inputs/ModelSelect.vue'

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
        const existingFood = makeFood({id: 42, name: 'Sourdough Bread', recipe: 5 as any})
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
        const createdFood = makeFood({id: 42, name: 'Sourdough Bread', recipe: 5 as any})
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

// The empty-steps "add first step" button called addStep(i+1), referencing `i` from a
// *different* v-for block's loop variable (the per-step row below it) - not in scope here.
// Vue templates resolve an out-of-scope identifier via `_ctx.i` (undefined), not a
// ReferenceError, so `undefined + 1` -> NaN -> addStep(NaN) -> the `index >= 0` check is
// false -> it happens to still append correctly. Characterization coverage for the fixed,
// clearer addStep() call - not a behavior change, just removing the confusing dead reference.
describe('RecipeEditor - add first step from the empty-steps state', () => {
    beforeEach(() => {
        resetApiMock()
    })

    it('adding a step to a recipe with none does not throw and adds exactly one step', async () => {
        const item = makeRecipe({id: 5, name: 'Sourdough Bread', steps: []})
        const w = mountEditor(item)
        ;(w.vm as any).tab = 'steps'
        await flushPromises()

        expect(w.find('[data-test="add-first-step-button"]').exists()).toBe(true)
        await expect(w.find('[data-test="add-first-step-button"]').trigger('click')).resolves.not.toThrow()
        await flushPromises()

        expect((w.vm as any).editingObj.steps.length).toBe(1)

        w.unmount()
    })
})

// RecipeEditor listened for a `save-and-close` event that ModelEditorBase never emits, which made Vue warn
// "Extraneous non-emits event listeners (saveAndClose)" every time the recipe editor loaded.
describe('RecipeEditor - listeners on ModelEditorBase', () => {
    beforeEach(() => {
        resetApiMock()
    })

    it('only listens for events that ModelEditorBase declares', () => {
        const w = mountEditor(makeRecipe({id: 5, name: 'Sourdough Bread'}))
        const passed = Object.keys(w.findComponent(ModelEditorBase).vm.$attrs).filter(k => /^on[A-Z]/.test(k))
        const declared = ((ModelEditorBase as any).emits as string[]).map(e => 'on' + e[0].toUpperCase() + e.slice(1))

        expect(passed.length).toBeGreaterThan(0)
        expect(passed.filter(l => !declared.includes(l))).toEqual([])

        w.unmount()
    })
})

// Every other tags picker in the model editors labels itself inside the field; the Keywords picker had a separate heading
// above it and kept the model's default singular "Keyword" as its own label, so the field was labelled twice, differently.
describe('RecipeEditor - Keywords picker label', () => {
    beforeEach(() => {
        resetApiMock()
    })

    it('labels the Keywords picker inside the field, with no separate heading', () => {
        const w = mountEditor(makeRecipe({id: 5, name: 'Sourdough Bread'}))
        const picker = w.findAllComponents(ModelSelect).find(c => c.vm.$attrs.model === 'Keyword')

        expect(picker).toBeTruthy()
        expect(picker!.vm.$attrs.label).toBe('Keywords')
        expect(w.findAll('label.v-label').filter(l => l.text() === 'Keywords')).toHaveLength(0)

        w.unmount()
    })
})

// A recipe cannot be for zero or fewer servings (the API refuses it), so the field must not offer it.
describe('RecipeEditor - servings', () => {
    beforeEach(() => {
        resetApiMock()
    })

    function servingsField(w: ReturnType<typeof mountEditor>) {
        return w.findAllComponents(vuetifyComponents.VNumberInput).find(c => c.props('label') === 'Servings')
    }

    it('has a minimum of one serving', () => {
        const w = mountEditor(makeRecipe({id: 5, name: 'Sourdough Bread', servings: 4}))

        expect(servingsField(w)).toBeTruthy()
        expect(servingsField(w)!.props('min')).toBe(1)

        w.unmount()
    })

    it('brings a typed zero back to one serving', async () => {
        const w = mountEditor(makeRecipe({id: 5, name: 'Sourdough Bread', servings: 4}))
        const input = servingsField(w)!.find('input')

        await input.trigger('focus')
        await input.setValue('0')
        await input.trigger('blur')
        await flushPromises()

        expect((w.vm as any).editingObj.servings).toBe(1)

        w.unmount()
    })
})
