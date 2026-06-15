import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, type PiniaPlugin } from 'pinia'

// useDisplay().mobile is read directly by RecipeView to pick the mobile vs desktop
// hero layout. Mock it with a ref we can flip per test; default desktop so the
// pre-existing tests are unaffected. (Vuetify components still use the plugin's
// own display, so only RecipeView's branch selection is driven by this.)
const mobileRef = ref(false)
vi.mock('vuetify', async (importOriginal) => {
    const orig = await importOriginal<any>()
    return { ...orig, useDisplay: () => ({ mobile: mobileRef }) }
})
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

import RecipeView from '@/components/display/RecipeView.vue'

describe('RecipeView', () => {
    beforeEach(() => {
        resetApiMock()
    })

    function mountRecipeView(
        recipe = makeRecipe({
            id: 1,
            name: 'Test Recipe',
            servings: 4,
            steps: [makeStep({ ingredients: [makeIngredient()] })],
        }),
        deviceOverrides: Record<string, any> = {},
    ) {
        const prePopulate: PiniaPlugin = ({ store }) => {
            if (store.$id === 'user_preference_store') {
                store.userSettings = makeUserPreference() as any
                store.activeSpace = makeSpace() as any
                if (Object.keys(deviceOverrides).length > 0) {
                    Object.assign(store.deviceSettings, deviceOverrides)
                }
            }
        }
        const pinia = createPinia()
        pinia.use(prePopulate)

        const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {
            Servings: 'Servings',
            CreatedBy: 'Created by',
            Created: 'Created',
            Updated: 'Updated',
            Imported_From: 'Imported from',
            created_by: 'created by',
            WorkingTime: 'Working time',
            WaitingTime: 'Waiting time',
        } }, missingWarn: false, fallbackWarn: false })
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

    it('renders keywords when present', async () => {
        const recipe = makeRecipe({
            keywords: [makeKeyword({ name: 'Italian' })],
        })
        const wrapper = mountRecipeView(recipe)
        await flushPromises()
        expect(wrapper.find('.stub-keywords').exists()).toBe(true)
    })

    describe('Recipe Layout flags', () => {
        const sourceRecipe = () => makeRecipe({
            name: 'Carbonara',
            servings: 4,
            workingTime: 30,
            waitingTime: 60,
            sourceUrl: 'https://example.com/carbonara',
            steps: [makeStep({ ingredients: [makeIngredient()] })],
        })

        it('hides Working time and Waiting time chips when recipe_showTimeChips is false', async () => {
            const wrapper = mountRecipeView(sourceRecipe(), { recipe_showTimeChips: false })
            await flushPromises()
            const text = wrapper.text()
            expect(text).not.toContain('Working time')
            expect(text).not.toContain('Waiting time')
        })

        it('hides the Servings col when recipe_showServings is false', async () => {
            const wrapper = mountRecipeView(sourceRecipe(), { recipe_showServings: false })
            await flushPromises()
            expect(wrapper.text()).not.toContain('Servings')
        })

        it('hides the foot Created by card when recipe_showFootCreatedBy is false', async () => {
            const wrapper = mountRecipeView(sourceRecipe(), {
                recipe_showFootCreatedBy: false,
                recipe_showFootCreatedDate: true,
                recipe_showFootUpdatedDate: true,
                recipe_showFootImportedFrom: true,
            })
            await flushPromises()
            const html = wrapper.html()
            expect(html).toContain('data-test="foot-card"')
            // CreatedBy card hidden — its prepend-icon is fa-solid fa-user.
            expect(html).not.toContain('fa-solid fa-user')
            // CreatedDate, UpdatedDate, ImportedFrom cards visible — count inner foot v-cards.
            const innerCards = wrapper.findAll('[data-test="foot-card"] .v-card')
            expect(innerCards).toHaveLength(3)
        })

        it('hides the foot Imported from card when recipe_showFootImportedFrom is false', async () => {
            const wrapper = mountRecipeView(sourceRecipe(), { recipe_showFootImportedFrom: false })
            await flushPromises()
            expect(wrapper.html()).not.toContain('title="Imported from"')
        })

        it('renders sourceUrl anchor with overflow-wrap to prevent viewport overflow', async () => {
            // Long URLs (e.g. https://cocktailswithsuderman.substack.com/p/a-rye-for-all-reasons)
            // extended 200–400px past the viewport edge at all breakpoints when rendered as plain
            // inline text. The anchor must carry overflow-wrap so it breaks within its column.
            const wrapper = mountRecipeView(
                makeRecipe({
                    sourceUrl: 'https://cocktailswithsuderman.substack.com/p/a-rye-for-all-reasons',
                    steps: [],
                }),
                { recipe_showFootImportedFrom: true },
            )
            await flushPromises()
            const html = wrapper.html()
            // The anchor must exist
            expect(html).toContain('cocktailswithsuderman')
            // It must carry overflow-wrap:anywhere (or break-all) so long URLs wrap
            const anchor = wrapper.find('a[href*="cocktailswithsuderman"]')
            expect(anchor.exists(), 'sourceUrl anchor not found').toBe(true)
            const style = anchor.attributes('style') ?? ''
            const hasWrap = style.includes('overflow-wrap') || style.includes('word-break')
            expect(hasWrap, 'sourceUrl anchor must have overflow-wrap or word-break style to prevent viewport overflow').toBe(true)
        })

        it('hides the entire foot wrapper when all four foot flags are false', async () => {
            const wrapper = mountRecipeView(sourceRecipe(), {
                recipe_showFootCreatedBy: false,
                recipe_showFootCreatedDate: false,
                recipe_showFootUpdatedDate: false,
                recipe_showFootImportedFrom: false,
            })
            await flushPromises()
            expect(wrapper.html()).not.toContain('data-test="foot-card"')
        })
    })

    describe('hero image', () => {
        beforeEach(() => { mobileRef.value = false })

        const withImage = () => makeRecipe({
            image: 'http://example.test/media/recipes/img.jpg',
            images: [{ id: 1, recipe: 1, file: 'http://example.test/media/recipes/img.jpg', cropData: null, order: 0, isPrimary: true } as any],
        })

        it('renders the RecipeImage hero on mobile when the recipe has no image (regression: mobile previously rendered nothing)', async () => {
            mobileRef.value = true
            const wrapper = mountRecipeView(makeRecipe({ image: null, images: [] }))
            await flushPromises()
            expect(wrapper.find('.stub-recipe-image').exists()).toBe(true)
        })

        it('renders the RecipeImage hero on mobile when the recipe has a gallery image (single hero path, not the bespoke crop-image)', async () => {
            mobileRef.value = true
            const wrapper = mountRecipeView(withImage())
            await flushPromises()
            expect(wrapper.find('.stub-recipe-image').exists()).toBe(true)
        })

        it('renders the RecipeImage hero on desktop (placeholder path for an image-less recipe)', async () => {
            const wrapper = mountRecipeView(makeRecipe({ image: null, images: [] }))
            await flushPromises()
            expect(wrapper.find('.stub-recipe-image').exists()).toBe(true)
        })
    })

    describe("servingsText 'none' fallback", () => {
        it.each(['none', 'None', 'NONE', '  none  '])(
            'shows the Servings label when servingsText is %s',
            async (value) => {
                const recipe = makeRecipe({ servings: 4, servingsText: value })
                const wrapper = mountRecipeView(recipe)
                await flushPromises()
                const text = wrapper.text()
                expect(text).toContain('Servings')
                expect(text).not.toMatch(/\bnone\b/i)
            }
        )

        it('shows the servingsText verbatim when it is a real label', async () => {
            const recipe = makeRecipe({ servings: 4, servingsText: 'Serves' })
            const wrapper = mountRecipeView(recipe)
            await flushPromises()
            expect(wrapper.text()).toContain('Serves')
        })
    })
})
