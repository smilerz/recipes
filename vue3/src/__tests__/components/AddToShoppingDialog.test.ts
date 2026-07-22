import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, type PiniaPlugin } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createRouter, createMemoryHistory } from 'vue-router'
import { apiMock, resetApiMock } from '@/__tests__/api-mock'
import { makeRecipe, makeStep, makeIngredient, makeFood, makeUnit, makeUserPreference } from '@/__tests__/factories'

vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    ApiApi: class { constructor() { return apiMock } },
    ResponseError: class extends Error { response: any; constructor(r: any) { super(); this.response = r } },
}))

vi.mock('@vueuse/core', async () => {
    const { ref } = await import('vue')
    return {
        useStorage: (_key: string, defaultValue: any) => ref(defaultValue),
    }
})

vi.mock('@vueuse/router', () => ({
    useRouteQuery: () => ({ value: false }),
}))

import AddToShoppingDialog from '@/components/dialogs/AddToShoppingDialog.vue'

describe('AddToShoppingDialog', () => {
    beforeEach(() => {
        resetApiMock()
        apiMock.apiRecipeRetrieve = vi.fn()
        apiMock.apiRecipeRelatedList = vi.fn()
        apiMock.apiShoppingListRecipeCreate = vi.fn()
        apiMock.apiShoppingListEntryBulkCreate = vi.fn()
    })

    function mountDialog(recipe = makeRecipe({ id: 1, name: 'Cookies', servings: 4 })) {
        const prePopulate: PiniaPlugin = ({ store }) => {
            if (store.$id === 'user_preference_store') {
                store.userSettings = makeUserPreference() as any
            }
        }
        const pinia = createPinia()
        pinia.use(prePopulate)

        const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false })
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [{ path: '/', component: { template: '<div/>' } }],
        })

        return mount(AddToShoppingDialog, {
            props: { recipe },
            global: {
                plugins: [pinia, i18n, router],
                stubs: {
                    ModelSelect: { template: '<div class="stub-model-select"/>' },
                    VClosableCardTitle: { template: '<div class="stub-title"/>' },
                    // Mirror the real indicator: renders a jar only when in-inventory is truthy.
                    PantryJarIndicator: { props: ['inInventory', 'earliestExpiry'], template: '<span class="stub-jar" v-if="inInventory"/>' },
                },
            },
        })
    }

    it('mounts without error', async () => {
        const fullRecipe = makeRecipe({
            id: 1,
            steps: [makeStep({ ingredients: [makeIngredient()] })],
            servings: 4,
        })
        apiMock.apiRecipeRetrieve.mockResolvedValue(fullRecipe)
        apiMock.apiRecipeRelatedList.mockResolvedValue([])

        const wrapper = mountDialog()
        await flushPromises()

        expect(wrapper.exists()).toBe(true)
    })

    it('calls apiRecipeRetrieve on mount', async () => {
        apiMock.apiRecipeRetrieve.mockResolvedValue(makeRecipe({ id: 1 }))
        apiMock.apiRecipeRelatedList.mockResolvedValue([])

        mountDialog()
        await flushPromises()

        expect(apiMock.apiRecipeRetrieve).toHaveBeenCalledWith({ id: 1 })
    })

    it('calls apiRecipeRelatedList to load related recipes', async () => {
        apiMock.apiRecipeRetrieve.mockResolvedValue(makeRecipe({ id: 1 }))
        apiMock.apiRecipeRelatedList.mockResolvedValue([])

        mountDialog()
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

        const wrapper = mountDialog()
        await flushPromises()
        // open via v-model (the real path), not a private ref — mirrors how RecipeContextMenu drives it
        await wrapper.setProps({ modelValue: true })
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

        const wrapper = mountDialog()
        await flushPromises()
        await wrapper.setProps({ modelValue: true })
        await flushPromises()

        // exactly one jar — on the on-hand food (Flour), not the needed one (Sugar)
        expect(document.body.querySelectorAll('.stub-jar').length).toBe(1)

        const entries = (wrapper.vm as any).dialogRecipes[0].entries
        const flour = entries.find((e: any) => e.food?.name === 'Flour')
        const sugar = entries.find((e: any) => e.food?.name === 'Sugar')
        expect(flour.checked).toBe(false)   // on-hand → pre-unchecked
        expect(sugar.checked).toBe(true)    // needed → checked
    })
})
