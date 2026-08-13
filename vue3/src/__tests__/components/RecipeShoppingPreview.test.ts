import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia, type PiniaPlugin } from 'pinia'
import { useUserPreferenceStore } from '@/stores/UserPreferenceStore'
import { useShoppingStore } from '@/stores/ShoppingStore'
import { createI18n } from 'vue-i18n'
import { createRouter, createMemoryHistory } from 'vue-router'
import { apiMock, resetApiMock } from '@/__tests__/api-mock'
import { makeRecipe, makeStep, makeIngredient, makeFood, makeFoodSimple, makeUnit, makeUserPreference, makeShoppingListEntry } from '@/__tests__/factories'

vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    ApiApi: class { constructor() { return apiMock } },
    ResponseError: class extends Error { response: any; constructor(r: any) { super(); this.response = r } },
}))

// MessageStore calls useI18n() at store-setup time, which requires an active component
// instance - fine when some other component warms the store first (as happens in the real
// app), but this component never does, and no prior test here exercised its success/error path
// to surface it. Mocked like other test files that hit the same gotcha (e.g. SearchPage.test.ts).
vi.mock('@/stores/MessageStore', async (importOriginal) => {
    const actual = await importOriginal<any>()
    return {
        ...actual,
        useMessageStore: () => ({
            addError: vi.fn(),
            addPreparedMessage: vi.fn(),
            addMessage: vi.fn(),
            deleteAllMessages: vi.fn(),
            messages: [],
            snackbarQueue: [],
        }),
    }
})

vi.mock('@vueuse/core', async () => {
    const { ref } = await import('vue')
    return {
        useStorage: (_key: string, defaultValue: any) => ref(defaultValue),
    }
})

vi.mock('@vueuse/router', () => ({
    useRouteQuery: () => ({ value: false }),
}))

import RecipeShoppingPreview from '@/components/display/RecipeShoppingPreview.vue'

describe('RecipeShoppingPreview', () => {
    let mountedWrappers: ReturnType<typeof mount>[] = []

    beforeEach(() => {
        resetApiMock()
        apiMock.apiRecipeRetrieve = vi.fn()
        apiMock.apiRecipeRelatedList = vi.fn()
        apiMock.apiShoppingListRecipeCreate = vi.fn()
        ;(apiMock as any).apiShoppingListRecipeBulkCreateEntriesCreate = vi.fn()
        ;(apiMock as any).apiShoppingListEntryCreate = vi.fn()
        ;(apiMock as any).apiShoppingListEntryDestroy = vi.fn()
        mountedWrappers = []
    })

    afterEach(() => {
        // attachTo: document.body means these don't auto-clean between tests like a
        // detached mount would - unmount explicitly so document.body queries in the next
        // test don't match leftover content from this one.
        mountedWrappers.forEach(w => w.unmount())
    })

    function mountPreview(recipe = makeRecipe({ id: 1, name: 'Cookies', servings: 4 }), extraProps: Record<string, any> = {}) {
        const prePopulate: PiniaPlugin = ({ store }) => {
            if (store.$id === 'user_preference_store') {
                store.userSettings = makeUserPreference() as any
            }
        }
        const pinia = createPinia()
        pinia.use(prePopulate)
        setActivePinia(pinia)

        const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false })
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [{ path: '/', component: { template: '<div/>' } }],
        })

        const wrapper = mount(RecipeShoppingPreview, {
            // unlike AddToShoppingDialog (a v-dialog, which teleports its content to
            // document.body), this component renders inline - attach it so document.body
            // queries still work the same way the original dialog tests relied on.
            attachTo: document.body,
            props: { recipe, ...extraProps },
            global: {
                plugins: [pinia, i18n, router],
                stubs: {
                    ModelSelect: { template: '<div class="stub-model-select"/>' },
                    // Mirror the real indicator: renders a jar only when in-inventory is truthy.
                    PantryJarIndicator: { props: ['inInventory', 'earliestExpiry'], template: '<span class="stub-jar" v-if="inInventory"/>' },
                },
            },
        })
        mountedWrappers.push(wrapper)
        return wrapper
    }

    it('mounts without error', async () => {
        const fullRecipe = makeRecipe({
            id: 1,
            steps: [makeStep({ ingredients: [makeIngredient()] })],
            servings: 4,
        })
        apiMock.apiRecipeRetrieve.mockResolvedValue(fullRecipe)
        apiMock.apiRecipeRelatedList.mockResolvedValue([])

        const wrapper = mountPreview()
        await flushPromises()

        expect(wrapper.exists()).toBe(true)
    })

    it('calls apiRecipeRetrieve on mount', async () => {
        apiMock.apiRecipeRetrieve.mockResolvedValue(makeRecipe({ id: 1 }))
        apiMock.apiRecipeRelatedList.mockResolvedValue([])

        mountPreview()
        await flushPromises()

        expect(apiMock.apiRecipeRetrieve).toHaveBeenCalledWith({ id: 1 })
    })

    it('calls apiRecipeRelatedList to load related recipes', async () => {
        apiMock.apiRecipeRetrieve.mockResolvedValue(makeRecipe({ id: 1 }))
        apiMock.apiRecipeRelatedList.mockResolvedValue([])

        mountPreview()
        await flushPromises()

        expect(apiMock.apiRecipeRelatedList).toHaveBeenCalledWith({ id: 1 })
    })

    it('builds dialog entries from recipe ingredients', async () => {
        const ingredient = makeIngredient({ food: makeFood({ name: 'Flour' }), amount: 2, unit: makeUnit({ name: 'cups' }) })
        const recipe = makeRecipe({
            id: 1,
            servings: 4,
            steps: [makeStep({ ingredients: [ingredient] })],
        })
        apiMock.apiRecipeRetrieve.mockResolvedValue(recipe)
        apiMock.apiRecipeRelatedList.mockResolvedValue([])

        mountPreview()
        await flushPromises()

        expect(document.body.innerHTML).toContain('Flour')
    })

    // D11 Phase 1: the dialog already auto-unchecks on-hand ingredients silently — make that
    // visible with a pantry jar on the on-hand rows so the pre-uncheck is explained (and still
    // overridable via the row checkbox).
    it('shows a pantry jar on on-hand ingredients and pre-unchecks them', async () => {
        const onHand = makeIngredient({ food: makeFood({ name: 'Flour', foodOnhand: true, inInventory: 'True', earliestExpiry: null }) })
        const needed = makeIngredient({ food: makeFood({ id: 2, name: 'Sugar', foodOnhand: false, inInventory: 'False', earliestExpiry: null }) })
        const recipe = makeRecipe({ id: 1, servings: 4, steps: [makeStep({ ingredients: [onHand, needed] })] })
        apiMock.apiRecipeRetrieve.mockResolvedValue(recipe)
        apiMock.apiRecipeRelatedList.mockResolvedValue([])

        const wrapper = mountPreview()
        await flushPromises()

        // exactly one jar — on the on-hand food (Flour), not the needed one (Sugar)
        expect(document.body.querySelectorAll('.stub-jar').length).toBe(1)

        const entries = (wrapper.vm as any).dialogRecipes[0].entries
        const flour = entries.find((e: any) => e.food?.name === 'Flour')
        const sugar = entries.find((e: any) => e.food?.name === 'Sugar')
        expect(flour.checked).toBe(false)   // on-hand → pre-unchecked
        expect(sugar.checked).toBe(true)    // needed → checked
    })

    // Bug reported live: a recipe with both "lime juice" (on hand) and "lemon juice" (a
    // substitute relationship, not itself on hand) pre-checked lemon juice for shopping - wrong,
    // since a substitute is already available. The pre-check only looked at the food's OWN
    // onhand/ignoreShopping flags, ignoring Food.substituteOnhand (already computed backend-side,
    // reused by #2/#3's substitute-aware availability work elsewhere in the app).
    it('pre-unchecks an ingredient whose substitute is on hand, not itself', async () => {
        const substituteCovered = makeIngredient({ food: makeFood({ name: 'Lemon juice', foodOnhand: false, substituteOnhand: true, inInventory: 'False', earliestExpiry: null, availableSubstitutes: [makeFoodSimple({name: 'Lime juice'})] }) })
        const recipe = makeRecipe({ id: 1, servings: 4, steps: [makeStep({ ingredients: [substituteCovered] })] })
        apiMock.apiRecipeRetrieve.mockResolvedValue(recipe)
        apiMock.apiRecipeRelatedList.mockResolvedValue([])

        const wrapper = mountPreview()
        await flushPromises()

        const entries = (wrapper.vm as any).dialogRecipes[0].entries
        const lemonJuice = entries.find((e: any) => e.food?.name === 'Lemon juice')
        expect(lemonJuice.checked).toBe(false)
    })

    // Follow-up: a substitute-only row should look visibly different from an actually-on-hand
    // row (a distinct swap icon, not the pantry jar) and name the substitute inline - not just in
    // a hover-only tooltip/aria-label - so the user can decide without extra interaction. When
    // several substitutes are available, show specifically the FIRST one (not a random pick like
    // the recipe-view page's IngredientsTable.vue - this is a one-time decision, not a long-lived
    // display, so determinism was chosen over IngredientsTable's session-stable-random spread).
    it('shows a distinct substitute icon and names the first available substitute, not the pantry jar', async () => {
        const substituteCovered = makeIngredient({
            food: makeFood({
                name: 'Lemon juice', foodOnhand: false, substituteOnhand: true, inInventory: 'False', earliestExpiry: null,
                availableSubstitutes: [makeFoodSimple({name: 'Lime juice'}), makeFoodSimple({name: 'Bottled lemon juice'})],
            }),
        })
        const recipe = makeRecipe({ id: 1, servings: 4, steps: [makeStep({ ingredients: [substituteCovered] })] })
        apiMock.apiRecipeRetrieve.mockResolvedValue(recipe)
        apiMock.apiRecipeRelatedList.mockResolvedValue([])

        mountPreview()
        await flushPromises()

        expect(document.body.querySelectorAll('.stub-jar').length).toBe(0)
        expect(document.body.textContent).toContain('Lime juice')
        expect(document.body.textContent).not.toContain('Bottled lemon juice')
    })

    it('still shows the pantry jar (not the substitute icon) when the food itself is on hand', async () => {
        const onHand = makeIngredient({ food: makeFood({ name: 'Flour', foodOnhand: true, substituteOnhand: false, inInventory: 'True', earliestExpiry: null }) })
        const recipe = makeRecipe({ id: 1, servings: 4, steps: [makeStep({ ingredients: [onHand] })] })
        apiMock.apiRecipeRetrieve.mockResolvedValue(recipe)
        apiMock.apiRecipeRelatedList.mockResolvedValue([])

        mountPreview()
        await flushPromises()

        expect(document.body.querySelectorAll('.stub-jar').length).toBe(1)
    })

    // D11 P2a: when opened as the meal-plan auto-add preview (showSkipPreview), offers a
    // browser-remembered "skip preview next time" toggle bound to the device setting.
    it('does not show the skip-preview toggle by default', async () => {
        apiMock.apiRecipeRetrieve.mockResolvedValue(makeRecipe({ id: 1, steps: [makeStep({ ingredients: [makeIngredient()] })], servings: 4 }))
        apiMock.apiRecipeRelatedList.mockResolvedValue([])
        mountPreview()
        await flushPromises()
        expect(document.body.querySelector('.skip-preview-toggle')).toBeNull()
    })

    it('shows the skip-preview toggle when showSkipPreview is set and writes the device setting', async () => {
        apiMock.apiRecipeRetrieve.mockResolvedValue(makeRecipe({ id: 1, steps: [makeStep({ ingredients: [makeIngredient()] })], servings: 4 }))
        apiMock.apiRecipeRelatedList.mockResolvedValue([])
        mountPreview(undefined, { showSkipPreview: true })
        await flushPromises()

        const store = useUserPreferenceStore()
        expect(store.deviceSettings.mealplan_shopping_skipPreview).toBe(false)

        const toggle = document.body.querySelector('.skip-preview-toggle input') as HTMLInputElement
        expect(toggle).not.toBeNull()
        toggle.click()
        await flushPromises()
        expect(store.deviceSettings.mealplan_shopping_skipPreview).toBe(true)
    })

    // Staging (loading the recipe, computing ingredients/pantry state) never needed a saved meal
    // plan - only committing does, to link the entries. onBeforeCommit lets the opener (e.g.
    // MealPlanEditor) save an unsaved plan right at that moment instead of forcing it upfront.
    describe('commit with an unsaved meal plan (onBeforeCommit)', () => {
        function setupCommittablePreview(extraProps: Record<string, any> = {}) {
            apiMock.apiRecipeRetrieve.mockResolvedValue(makeRecipe({id: 1, steps: [makeStep({ingredients: [makeIngredient()]})], servings: 4}))
            apiMock.apiRecipeRelatedList.mockResolvedValue([])
            apiMock.apiShoppingListRecipeCreate.mockResolvedValue({id: 99})
            ;(apiMock as any).apiShoppingListRecipeBulkCreateEntriesCreate.mockResolvedValue({})
            return mountPreview(undefined, extraProps)
        }

        it('does not call onBeforeCommit when mealPlan already has an id', async () => {
            const onBeforeCommit = vi.fn()
            const wrapper = setupCommittablePreview({mealPlan: {id: 5}, onBeforeCommit})
            await flushPromises()

            await (wrapper.vm as any).createShoppingListRecipe()
            await flushPromises()

            expect(onBeforeCommit).not.toHaveBeenCalled()
            expect(apiMock.apiShoppingListRecipeCreate).toHaveBeenCalledWith(
                expect.objectContaining({shoppingListRecipe: expect.objectContaining({mealplan: 5})})
            )
        })

        it('calls onBeforeCommit and links entries to the returned id when mealPlan has none yet', async () => {
            const onBeforeCommit = vi.fn().mockResolvedValue({id: 42})
            const wrapper = setupCommittablePreview({onBeforeCommit})
            await flushPromises()

            await (wrapper.vm as any).createShoppingListRecipe()
            await flushPromises()

            expect(onBeforeCommit).toHaveBeenCalled()
            expect(apiMock.apiShoppingListRecipeCreate).toHaveBeenCalledWith(
                expect.objectContaining({shoppingListRecipe: expect.objectContaining({mealplan: 42})})
            )
            expect(wrapper.emitted('created')).toBeTruthy()
        })

        it('aborts without creating anything when onBeforeCommit fails to produce an id', async () => {
            const onBeforeCommit = vi.fn().mockResolvedValue(undefined)
            const wrapper = setupCommittablePreview({onBeforeCommit})
            await flushPromises()

            await (wrapper.vm as any).createShoppingListRecipe()
            await flushPromises()

            expect(onBeforeCommit).toHaveBeenCalled()
            expect(apiMock.apiShoppingListRecipeCreate).not.toHaveBeenCalled()
            expect(wrapper.emitted('created')).toBeFalsy()
        })
    })

    // Once entries already exist for this recipe+meal plan, the same component switches to
    // live mode: checkboxes reflect the real ShoppingListEntry rows and toggling one immediately
    // creates/deletes it via the API - there's no separate "commit" step to review/undo.
    describe('live mode (existingEntries provided)', () => {
        function setupLivePreview(existingEntries: any[], extraProps: Record<string, any> = {}) {
            apiMock.apiRecipeRetrieve.mockResolvedValue(makeRecipe({
                id: 1, servings: 4,
                steps: [makeStep({ingredients: [makeIngredient({id: 11, food: makeFood({name: 'Flour'})})]})],
            }))
            apiMock.apiRecipeRelatedList.mockResolvedValue([])
            return mountPreview(undefined, {existingEntries, mealPlan: {id: 7}, ...extraProps})
        }

        it('hides the commit button, skip-preview toggle and shopping-list picker', async () => {
            setupLivePreview([])
            await flushPromises()

            expect(document.body.querySelector('.stub-model-select')).toBeNull()
            expect(document.body.querySelector('.skip-preview-toggle')).toBeNull()
            expect(document.body.textContent).not.toContain('Add_to_Shopping')
        })

        it('pre-checks a row that already has a matching entry, by ingredient id', async () => {
            const wrapper = setupLivePreview([makeShoppingListEntry({id: 501, ingredient: 11})])
            await flushPromises()

            const entries = (wrapper.vm as any).dialogRecipes[0].entries
            expect(entries[0].checked).toBe(true)
            expect(entries[0].entryId).toBe(501)
        })

        it('leaves a row unchecked when no matching entry exists', async () => {
            const wrapper = setupLivePreview([])
            await flushPromises()

            const entries = (wrapper.vm as any).dialogRecipes[0].entries
            expect(entries[0].checked).toBe(false)
            expect(entries[0].entryId).toBeUndefined()
        })

        it('checking an unchecked row creates a shopping list entry linked to the meal plan', async () => {
            ;(apiMock as any).apiShoppingListEntryCreate.mockResolvedValue(makeShoppingListEntry({id: 900, ingredient: 11}))
            const wrapper = setupLivePreview([])
            await flushPromises()

            await (wrapper.vm as any).toggleEntry((wrapper.vm as any).dialogRecipes[0].entries[0])
            await flushPromises()

            expect(apiMock.apiShoppingListEntryCreate).toHaveBeenCalledWith(
                expect.objectContaining({shoppingListEntry: expect.objectContaining({mealplanId: 7, ingredient: 11})})
            )
            expect((wrapper.vm as any).dialogRecipes[0].entries[0].checked).toBe(true)
            expect((wrapper.vm as any).dialogRecipes[0].entries[0].entryId).toBe(900)
        })

        it('unchecking a checked row deletes the linked shopping list entry', async () => {
            ;(apiMock as any).apiShoppingListEntryDestroy.mockResolvedValue(undefined)
            const wrapper = setupLivePreview([makeShoppingListEntry({id: 501, ingredient: 11})])
            await flushPromises()

            await (wrapper.vm as any).toggleEntry((wrapper.vm as any).dialogRecipes[0].entries[0])
            await flushPromises()

            expect(apiMock.apiShoppingListEntryDestroy).toHaveBeenCalledWith(expect.objectContaining({id: 501}))
            expect((wrapper.vm as any).dialogRecipes[0].entries[0].checked).toBe(false)
            expect((wrapper.vm as any).dialogRecipes[0].entries[0].entryId).toBeUndefined()
        })
    })
})
