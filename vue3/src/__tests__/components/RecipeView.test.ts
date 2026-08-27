import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, type PiniaPlugin } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createRouter, createMemoryHistory } from 'vue-router'
import { apiMock, resetApiMock } from '@/__tests__/api-mock'
import { makeRecipe, makeStep, makeIngredient, makeFood, makeUnit, makeKeyword, makeUserPreference, makeSpace } from '@/__tests__/factories'

vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    ApiApi: class { constructor() { return apiMock } },
    ResponseError: class extends Error { response: any; constructor(r: any) { super(); this.response = r } },
}))

vi.mock('@vueuse/core', async () => {
    const { ref } = await import('vue')
    return {
        useStorage: (_key: string, defaultValue: any) => ref(defaultValue),
        useWakeLock: () => ({ request: vi.fn(), release: vi.fn() }),
    }
})

vi.mock('@vueuse/router', () => ({
    useRouteQuery: () => ({ value: false }),
}))

// Mock cookie for useFileApi
vi.mock('@/utils/cookie', () => ({
    getCookie: () => 'test-csrf-token',
}))

// useMessageStore lazily creates its store on first use, and the real store's setup calls
// useI18n() - fine when first triggered from a component's own setup/render, but tests that
// invoke page methods directly (bypassing Vue's instance context) need the real store mocked out.
const { addErrorMock } = vi.hoisted(() => ({ addErrorMock: vi.fn() }))
vi.mock('@/stores/MessageStore', async (imp) => ({
    ...(await imp<any>()),
    useMessageStore: () => ({ addError: addErrorMock, addMessage: vi.fn(), addPreparedMessage: vi.fn() }),
}))

import RecipeView from '@/components/display/RecipeView.vue'
import ImageLightbox from '@/components/display/ImageLightbox.vue'

describe('RecipeView', () => {
    beforeEach(() => {
        resetApiMock()
    })

    function mountRecipeView(recipe = makeRecipe({
        id: 1,
        name: 'Test Recipe',
        servings: 4,
        steps: [makeStep({ ingredients: [makeIngredient()] })],
    })) {
        const prePopulate: PiniaPlugin = ({ store }) => {
            if (store.$id === 'user_preference_store') {
                store.userSettings = makeUserPreference() as any
                store.activeSpace = makeSpace() as any
            }
        }
        const pinia = createPinia()
        pinia.use(prePopulate)

        const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false })
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [
                { path: '/', name: 'StartPage', component: { template: '<div/>' } },
                { path: '/recipe/:id', name: 'RecipeViewPage', component: { template: '<div/>' } },
                { path: '/edit/:model/:id?', name: 'ModelEditPage', component: { template: '<div/>' } },
            ],
        })

        return mount(RecipeView, {
            props: { modelValue: recipe, servings: undefined },
            global: {
                plugins: [pinia, i18n, router],
                stubs: {
                    StepsOverview: { template: '<div class="stub-steps-overview"/>' },
                    RecipeActivity: { template: '<div class="stub-recipe-activity"/>' },
                    RecipeContextMenu: { template: '<div class="stub-context-menu"/>' },
                    KeywordsBar: { template: '<div class="stub-keywords"/>' },
                    KeywordsComponent: { template: '<div class="stub-keywords"/>' },
                    RecipeImage: { template: '<div class="stub-recipe-image"/>' },
                    ExternalRecipeViewer: { template: '<div class="stub-external-viewer"/>' },
                    StepView: { props: ['ingredientFactor'], emits: ['scale'], template: '<div class="stub-step-view" :data-factor="ingredientFactor"/>' },
                    PropertyView: { template: '<div class="stub-property-view"/>' },
                    PrivateRecipeBadge: { template: '<div class="stub-private-badge"/>' },
                    ModelSelect: { template: '<div class="stub-model-select"/>' },
                    NumberScalerDialog: { template: '<div class="stub-number-scaler"/>' },
                    RecipeScalingDialog: { template: '<div class="stub-scaling-dialog"/>' },
                    AddToShoppingDialog: { template: '<div class="stub-add-to-shopping"/>' },
                    RecipeShareDialog: { template: '<div class="stub-share-dialog"/>' },
                    AiActionButton: { template: '<div class="stub-ai-button"/>' },
                },
            },
        })
    }

    it('mounts without error', async () => {
        const wrapper = mountRecipeView()
        await flushPromises()
        expect(wrapper.exists()).toBe(true)
    })

    it('displays recipe name', async () => {
        const wrapper = mountRecipeView()
        await flushPromises()
        expect(wrapper.text()).toContain('Test Recipe')
    })

    it('displays recipe description when present', async () => {
        const recipe = makeRecipe({ name: 'Cookies', description: 'Delicious homemade cookies' })
        const wrapper = mountRecipeView(recipe)
        await flushPromises()
        expect(wrapper.text()).toContain('Delicious homemade cookies')
    })

    it('displays working and waiting time', async () => {
        const recipe = makeRecipe({ workingTime: 30, waitingTime: 60 })
        const wrapper = mountRecipeView(recipe)
        await flushPromises()
        expect(wrapper.text()).toContain('30')
        expect(wrapper.text()).toContain('60')
    })

    it('renders step views for each step', async () => {
        const recipe = makeRecipe({
            steps: [makeStep({ id: 1 }), makeStep({ id: 2 })],
        })
        const wrapper = mountRecipeView(recipe)
        await flushPromises()
        expect(wrapper.findAll('.stub-step-view').length).toBe(2)
    })

    // D03: scaling by ingredient from a per-step view must re-scale the recipe. RecipeView handled
    // @scale on StepsOverview but not on StepView, so step-view scaling was silently dropped.
    it('scales the recipe when a step view emits @scale (D03)', async () => {
        const recipe = makeRecipe({ id: 1, servings: 4, steps: [makeStep({ ingredients: [makeIngredient()] })] })
        const wrapper = mountRecipeView(recipe)
        await flushPromises()

        const stepView = wrapper.findComponent('.stub-step-view')
        expect(stepView.attributes('data-factor')).toBe('1') // base factor (servings 4 / recipe 4)

        ;(stepView as any).vm.$emit('scale', 2) // e.g. doubling an ingredient's amount
        await flushPromises()

        // servings -> 4 * 2 = 8, so ingredientFactor -> 2
        expect(stepView.attributes('data-factor')).toBe('2')
    })

    it('renders keywords when present', async () => {
        const recipe = makeRecipe({
            keywords: [makeKeyword({ name: 'Italian' })],
        })
        const wrapper = mountRecipeView(recipe)
        await flushPromises()
        expect(wrapper.find('.stub-keywords').exists()).toBe(true)
    })

    // Hero image click must open the lightbox at the PRIMARY image's actual position in
    // recipe.images, not hardcoded index 0 - the primary image isn't guaranteed to be gallery
    // position 0 since `order` is an independent, user-reorderable field.
    it('opens the lightbox at the primary image\'s index, not always 0', async () => {
        const recipe = makeRecipe({
            id: 1,
            image: 'https://example.com/primary.jpg',
            images: [
                { id: 1, recipe: 1, file: 'https://example.com/secondary.jpg', order: 0, isPrimary: false, createdBy: 1, createdAt: new Date('2026-01-01') },
                { id: 2, recipe: 1, file: 'https://example.com/primary.jpg', order: 1, isPrimary: true, createdBy: 1, createdAt: new Date('2026-01-01') },
            ],
        })
        const wrapper = mountRecipeView(recipe)
        await flushPromises()

        await wrapper.find('.stub-recipe-image').trigger('click')
        await flushPromises()

        const lightbox = wrapper.findComponent(ImageLightbox)
        expect(lightbox.props('startIndex')).toBe(1)
    })

    // TS debt sweep found this by removing an incorrect `null` from selectedAiProvider's type: like
    // RecipeImportPage's loadRecipeFromAiImport, aiConvertRecipe() had no guard for a missing AI
    // provider and fell through to `selectedAiProvider.value.id!`, which throws a real TypeError.
    it('aiConvertRecipe does not throw when no AI provider is selected/configured', async () => {
        addErrorMock.mockReset()
        const wrapper = mountRecipeView()
        await flushPromises()

        expect(() => (wrapper.vm as any).aiConvertRecipe()).not.toThrow()
        expect(addErrorMock).toHaveBeenCalled()
    })
})

// #10 follow-up: a persistent icon overlay on the hero image (not a buried menu item) triggers
// the photo editor via a ref into RecipeContextMenu, since its dialog/state live there. This
// stub requires a real expose() call to work, unlike a trivial template stub - it would fail if
// RecipeView's ref wiring (or RecipeContextMenu's defineExpose) regressed.
describe('photo edit icon overlay on the hero image (#10 follow-up)', () => {
    const openPhotoEditorSpy = vi.fn()

    beforeEach(() => {
        resetApiMock()
        openPhotoEditorSpy.mockClear()
    })

    function mountAuthenticated(recipe = makeRecipe({ id: 1, name: 'Test Recipe', servings: 4, steps: [] })) {
        const prePopulate: PiniaPlugin = ({ store }) => {
            if (store.$id === 'user_preference_store') {
                store.userSettings = makeUserPreference() as any
                store.activeSpace = makeSpace() as any
                store.isAuthenticated = true
            }
        }
        const pinia = createPinia()
        pinia.use(prePopulate)
        const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: { Edit_Photo: 'Edit Photo' } }, missingWarn: false, fallbackWarn: false })
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [
                { path: '/', name: 'StartPage', component: { template: '<div/>' } },
                { path: '/recipe/:id', name: 'RecipeViewPage', component: { template: '<div/>' } },
                { path: '/edit/:model/:id?', name: 'ModelEditPage', component: { template: '<div/>' } },
                { path: '/advanced-search', name: 'SearchPage', component: { template: '<div/>' } },
            ],
        })

        return mount(RecipeView, {
            props: { modelValue: recipe, servings: undefined },
            global: {
                plugins: [pinia, i18n, router],
                stubs: {
                    StepsOverview: { template: '<div class="stub-steps-overview"/>' },
                    RecipeActivity: { template: '<div class="stub-recipe-activity"/>' },
                    RecipeContextMenu: {
                        setup(_, { expose }) {
                            expose({ openPhotoEditor: openPhotoEditorSpy })
                            return () => null
                        },
                    },
                    KeywordsBar: { template: '<div class="stub-keywords"/>' },
                    KeywordsComponent: { template: '<div class="stub-keywords"/>' },
                    RecipeImage: { template: '<div class="stub-recipe-image"/>' },
                    ExternalRecipeViewer: { template: '<div class="stub-external-viewer"/>' },
                    StepView: { template: '<div class="stub-step-view"/>' },
                    PropertyView: { template: '<div class="stub-property-view"/>' },
                    PrivateRecipeBadge: { template: '<div class="stub-private-badge"/>' },
                    ModelSelect: { template: '<div class="stub-model-select"/>' },
                    NumberScalerDialog: { template: '<div class="stub-number-scaler"/>' },
                    RecipeScalingDialog: { template: '<div class="stub-scaling-dialog"/>' },
                    AddToShoppingDialog: { template: '<div class="stub-add-to-shopping"/>' },
                    RecipeShareDialog: { template: '<div class="stub-share-dialog"/>' },
                    AiActionButton: { template: '<div class="stub-ai-button"/>' },
                },
            },
        })
    }

    it('shows the edit-photo icon and calls the exposed openPhotoEditor when clicked', async () => {
        const wrapper = mountAuthenticated()
        await flushPromises()

        const icon = wrapper.find('[data-test="photo-edit-overlay-btn"]')
        expect(icon.exists()).toBe(true)

        await icon.trigger('click')
        expect(openPhotoEditorSpy).toHaveBeenCalledTimes(1)
    })

    it('hides the icon for anonymous (unauthenticated) viewers', async () => {
        const prePopulate: PiniaPlugin = ({ store }) => {
            if (store.$id === 'user_preference_store') {
                store.userSettings = makeUserPreference() as any
                store.activeSpace = makeSpace() as any
                store.isAuthenticated = false
            }
        }
        const pinia = createPinia()
        pinia.use(prePopulate)
        const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false })
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [
                { path: '/', name: 'StartPage', component: { template: '<div/>' } },
                { path: '/recipe/:id', name: 'RecipeViewPage', component: { template: '<div/>' } },
            ],
        })
        const wrapper = mount(RecipeView, {
            props: { modelValue: makeRecipe({ id: 1, name: 'Test Recipe', servings: 4, steps: [] }), servings: undefined },
            global: {
                plugins: [pinia, i18n, router],
                stubs: {
                    StepsOverview: { template: '<div/>' }, RecipeActivity: { template: '<div/>' },
                    RecipeContextMenu: { template: '<div/>' }, KeywordsBar: { template: '<div/>' },
                    KeywordsComponent: { template: '<div/>' }, RecipeImage: { template: '<div/>' },
                    ExternalRecipeViewer: { template: '<div/>' }, StepView: { template: '<div/>' },
                    PropertyView: { template: '<div/>' }, PrivateRecipeBadge: { template: '<div/>' },
                    ModelSelect: { template: '<div/>' }, NumberScalerDialog: { template: '<div/>' },
                    RecipeScalingDialog: { template: '<div/>' }, AddToShoppingDialog: { template: '<div/>' },
                    RecipeShareDialog: { template: '<div/>' }, AiActionButton: { template: '<div/>' },
                },
            },
        })
        await flushPromises()
        expect(wrapper.find('[data-test="photo-edit-overlay-btn"]').exists()).toBe(false)
    })
})
