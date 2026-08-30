/**
 * Regression coverage for the post-import image-attach flow (C3).
 *
 * useFileApi's updateRecipeImage was removed/renamed to createRecipeImageFromUrl,
 * but RecipeImportPage still destructured and called updateRecipeImage — so
 * every URL/source import threw "updateRecipeImage is not a function" right
 * after creating the recipe, and the image was never attached (and, for the
 * single-import path, navigation never happened).
 */
import {describe, it, expect, vi, beforeEach} from 'vitest'
import {shallowMount, mount, flushPromises} from '@vue/test-utils'
import {createPinia, setActivePinia} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import {createRouter, createMemoryHistory} from 'vue-router'

const {createRecipeImageFromUrlMock, apiRecipeCreateMock, doAiImportMock, addErrorMock} = vi.hoisted(() => ({
    createRecipeImageFromUrlMock: vi.fn(),
    apiRecipeCreateMock: vi.fn(),
    doAiImportMock: vi.fn(),
    addErrorMock: vi.fn(),
}))

vi.mock('@/composables/useFileApi', () => ({
    useFileApi: () => ({
        createRecipeImageFromUrl: createRecipeImageFromUrlMock,
        doAiImport: doAiImportMock,
        doAppImport: vi.fn(),
        fileApiLoading: {value: false},
    }),
}))
// useMessageStore lazily creates its store on first use, and the real store's setup
// calls useI18n() - fine when first triggered from inside a component's own setup/render,
// but these tests invoke page methods directly (bypassing Vue's instance context), so the
// real store must be mocked out rather than lazily constructed mid-test.
vi.mock('@/stores/MessageStore', async (imp) => ({
    ...(await imp<any>()),
    useMessageStore: () => ({addError: addErrorMock, addMessage: vi.fn(), addPreparedMessage: vi.fn()}),
}))
vi.mock('@/openapi', async (imp) => ({
    ...(await imp<any>()),
    ApiApi: class {
        apiRecipeCreate = apiRecipeCreateMock
        apiAccessTokenList = vi.fn().mockResolvedValue([])
        apiAccessTokenCreate = vi.fn().mockResolvedValue({token: 'bm'})
    },
}))

import RecipeImportPage from '@/pages/RecipeImportPage.vue'

function mountPage() {
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components, directives})
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            {path: '/', name: 'StartPage', component: {template: '<div/>'}},
            {path: '/recipe/view/:id', name: 'RecipeViewPage', component: {template: '<div/>'}},
            {path: '/edit/:model/:id', name: 'ModelEditPage', component: {template: '<div/>'}},
        ],
    })
    const push = vi.spyOn(router, 'push')
    const wrapper = shallowMount(RecipeImportPage, {global: {plugins: [createPinia(), i18n, vuetify, router]}})
    return {wrapper, push}
}

function mountPageFull() {
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components, directives})
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            {path: '/', name: 'StartPage', component: {template: '<div/>'}},
            {path: '/recipe/view/:id', name: 'RecipeViewPage', component: {template: '<div/>'}},
            {path: '/edit/:model/:id', name: 'ModelEditPage', component: {template: '<div/>'}},
        ],
    })
    return mount(RecipeImportPage, {global: {plugins: [createPinia(), i18n, vuetify, router]}})
}

describe('RecipeImportPage — post-import image attach (C3)', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        createRecipeImageFromUrlMock.mockReset().mockResolvedValue({id: 7})
        apiRecipeCreateMock.mockReset().mockResolvedValue({id: 123})
    })

    it('attaches the imported recipe image via createRecipeImageFromUrl', async () => {
        const {wrapper, push} = mountPage()
        ;(wrapper.vm as any).importResponse = {recipe: {keywords: [], imageUrl: 'http://example.com/a.jpg'}}
        ;(wrapper.vm as any).createRecipeFromImport()
        await flushPromises()

        expect(createRecipeImageFromUrlMock).toHaveBeenCalledWith(123, 'http://example.com/a.jpg')
        expect(push).toHaveBeenCalledWith(expect.objectContaining({name: 'RecipeViewPage'}))
    })

    it('navigates without attaching an image when the import has no imageUrl', async () => {
        const {wrapper, push} = mountPage()
        ;(wrapper.vm as any).importResponse = {recipe: {keywords: []}}
        ;(wrapper.vm as any).createRecipeFromImport()
        await flushPromises()

        expect(createRecipeImageFromUrlMock).not.toHaveBeenCalled()
        expect(push).toHaveBeenCalledWith(expect.objectContaining({name: 'RecipeViewPage'}))
    })

    it('creates a RecipeImage for each selected image, first one first (becomes primary)', async () => {
        const {wrapper, push} = mountPage()
        ;(wrapper.vm as any).importResponse = {recipe: {keywords: []}}
        ;(wrapper.vm as any).selectedImages = ['http://example.com/1.jpg', 'http://example.com/2.jpg']
        ;(wrapper.vm as any).createRecipeFromImport()
        await flushPromises()

        // one create per selected URL, in selection order — the first-created is primary (backend auto)
        expect(createRecipeImageFromUrlMock).toHaveBeenCalledTimes(2)
        expect(createRecipeImageFromUrlMock.mock.calls[0]).toEqual([123, 'http://example.com/1.jpg'])
        expect(createRecipeImageFromUrlMock.mock.calls[1]).toEqual([123, 'http://example.com/2.jpg'])
        expect(push).toHaveBeenCalledWith(expect.objectContaining({name: 'RecipeViewPage'}))
    })
})

/**
 * #12: per-step split/merge controls in the import review step editor.
 *
 * handleSplitStep replaces a broken inline template call - splitStep(s, '\n') was invoked
 * with the step object where the utility expects the steps ARRAY as its first argument
 * (signature: splitStep(steps, step, split_character)), so clicking "Split" on an
 * individual step threw immediately (s.findIndex is not a function). mergeStep already
 * merged a step with the next one correctly but had no UI control wired to it at all.
 */
describe('RecipeImportPage step split/merge (#12)', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
    })

    function stepsFixture() {
        return [
            {instruction: 'chop\nonions', ingredients: [{amount: 1, food: {name: 'onion'}, unit: null, note: '', originalText: '1 onion'}]},
            {instruction: 'boil water', ingredients: [{amount: 2, food: {name: 'water'}, unit: null, note: '', originalText: '2 cups water'}]},
            {instruction: 'combine', ingredients: []},
        ]
    }

    it('handleSplitStep splits only the targeted step, leaving the others untouched', async () => {
        const {wrapper} = mountPage()
        ;(wrapper.vm as any).importResponse = {recipe: {keywords: [], steps: stepsFixture()}}
        // read the step back through the reactive proxy - a step object built outside
        // importResponse's own reactive tree is never === the array's own elements
        const reactiveSteps = (wrapper.vm as any).importResponse.recipe.steps
        ;(wrapper.vm as any).handleSplitStep(reactiveSteps[0])

        const result = (wrapper.vm as any).importResponse.recipe.steps
        expect(result).toHaveLength(4)
        expect(result[0].instruction).toBe('chop')
        expect(result[1].instruction).toBe('onions')
        expect(result[2].instruction).toBe('boil water')
        expect(result[3].instruction).toBe('combine')
    })

    it('mergeStep merges a step with the next one (merge-with-next)', async () => {
        const {wrapper} = mountPage()
        ;(wrapper.vm as any).importResponse = {recipe: {keywords: [], steps: stepsFixture()}}
        const reactiveSteps = (wrapper.vm as any).importResponse.recipe.steps
        ;(wrapper.vm as any).mergeStep(reactiveSteps[0])

        const result = (wrapper.vm as any).importResponse.recipe.steps
        expect(result).toHaveLength(2)
        expect(result[0].instruction).toBe('chop\nonions\nboil water')
        expect(result[0].ingredients).toHaveLength(2)
        expect(result[1].instruction).toBe('combine')
    })

    it('mergeStep called with the previous step achieves merge-with-previous', async () => {
        const {wrapper} = mountPage()
        ;(wrapper.vm as any).importResponse = {recipe: {keywords: [], steps: stepsFixture()}}
        const reactiveSteps = (wrapper.vm as any).importResponse.recipe.steps
        // merging step[2] ("combine") with its previous step is mergeStep(steps[1])
        ;(wrapper.vm as any).mergeStep(reactiveSteps[1])

        const result = (wrapper.vm as any).importResponse.recipe.steps
        expect(result).toHaveLength(2)
        expect(result[0].instruction).toBe('chop\nonions')
        expect(result[1].instruction).toBe('boil water\ncombine')
    })
})

describe('RecipeImportPage step name field (#12)', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
    })

    it('is hidden until expanded, then binds to the step', async () => {
        const wrapper = mountPageFull()
        ;(wrapper.vm as any).stepper = 'step_editor'
        ;(wrapper.vm as any).importResponse = {recipe: {keywords: [], steps: [{instruction: 'chop', ingredients: []}]}}
        await flushPromises()

        expect(wrapper.find('[data-test="step-name-field"]').exists()).toBe(false)

        ;(wrapper.vm as any).expandedStepNames.add(0)
        await flushPromises()

        const field = wrapper.find('[data-test="step-name-field"] input')
        expect(field.exists()).toBe(true)
        await field.setValue('Prep')
        await flushPromises()

        expect((wrapper.vm as any).importResponse.recipe.steps[0].name).toBe('Prep')
    })

    it('stays visible once the step already has a name, without needing to expand it', async () => {
        const wrapper = mountPageFull()
        ;(wrapper.vm as any).stepper = 'step_editor'
        ;(wrapper.vm as any).importResponse = {recipe: {keywords: [], steps: [{name: 'Prep', instruction: 'chop', ingredients: []}]}}
        await flushPromises()

        expect(wrapper.find('[data-test="step-name-field"]').exists()).toBe(true)
    })
})

// TS debt sweep found this by removing an incorrect `null` from selectedAiProvider's type: the
// function shows an error toast when no AI provider is selected/configured, but doesn't return -
// execution fell through to `selectedAiProvider.value.id!`, which would throw a real TypeError.
// The "Load" button's :disabled guard doesn't check for a missing provider either.
describe('RecipeImportPage AI import guards against no selected provider', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        doAiImportMock.mockReset()
        addErrorMock.mockReset()
    })

    it('loadRecipeFromAiImport does not throw and does not call doAiImport when no provider is selected', async () => {
        const {wrapper} = mountPage()
        ;(wrapper.vm as any).selectedAiProvider = undefined
        ;(wrapper.vm as any).aiMode = 'file'
        ;(wrapper.vm as any).image = new File(['x'], 'x.pdf')

        expect(() => (wrapper.vm as any).loadRecipeFromAiImport()).not.toThrow()
        expect(doAiImportMock).not.toHaveBeenCalled()
        expect(addErrorMock).toHaveBeenCalled()
    })
})
