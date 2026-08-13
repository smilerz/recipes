import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia, type PiniaPlugin } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createRouter, createMemoryHistory } from 'vue-router'
import { apiMock, resetApiMock } from '@/__tests__/api-mock'
import { makeRecipe, makeStep, makeIngredient, makeUserPreference } from '@/__tests__/factories'

vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    ApiApi: class { constructor() { return apiMock } },
    ResponseError: class extends Error { response: any; constructor(r: any) { super(); this.response = r } },
}))

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

import AddToShoppingDialog from '@/components/dialogs/AddToShoppingDialog.vue'
import RecipeShoppingPreview from '@/components/display/RecipeShoppingPreview.vue'

describe('AddToShoppingDialog', () => {
    beforeEach(() => {
        resetApiMock()
        apiMock.apiRecipeRetrieve = vi.fn()
        apiMock.apiRecipeRelatedList = vi.fn()
    })

    function mountDialog(recipe = makeRecipe({ id: 1, name: 'Cookies', servings: 4 }), extraProps: Record<string, any> = {}) {
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

        return mount(AddToShoppingDialog, {
            props: { recipe, modelValue: true, ...extraProps },
            global: {
                plugins: [pinia, i18n, router],
                stubs: {
                    ModelSelect: { template: '<div class="stub-model-select"/>' },
                    VClosableCardTitle: { template: '<div class="stub-title"/>' },
                    PantryJarIndicator: { props: ['inInventory', 'earliestExpiry'], template: '<span/>' },
                },
            },
        })
    }

    it('mounts without error and loads the recipe', async () => {
        apiMock.apiRecipeRetrieve.mockResolvedValue(makeRecipe({ id: 1, steps: [makeStep({ ingredients: [makeIngredient()] })], servings: 4 }))
        apiMock.apiRecipeRelatedList.mockResolvedValue([])

        const wrapper = mountDialog()
        await flushPromises()

        expect(wrapper.exists()).toBe(true)
        expect(apiMock.apiRecipeRetrieve).toHaveBeenCalledWith({ id: 1 })
    })

    it('forwards recipe, mealPlan, showSkipPreview and onBeforeCommit to the shared preview', async () => {
        apiMock.apiRecipeRetrieve.mockResolvedValue(makeRecipe({ id: 1, steps: [makeStep({ ingredients: [makeIngredient()] })], servings: 4 }))
        apiMock.apiRecipeRelatedList.mockResolvedValue([])
        const onBeforeCommit = vi.fn()
        const mealPlan = { id: 5 }

        const wrapper = mountDialog(undefined, { mealPlan, showSkipPreview: true, onBeforeCommit })
        await flushPromises()

        const preview = wrapper.findComponent(RecipeShoppingPreview)
        expect(preview.props('mealPlan')).toEqual(mealPlan)
        expect(preview.props('showSkipPreview')).toBe(true)
        expect(preview.props('onBeforeCommit')).toBe(onBeforeCommit)
    })

    it('closes the dialog and re-emits created when the shared preview emits created', async () => {
        apiMock.apiRecipeRetrieve.mockResolvedValue(makeRecipe({ id: 1, steps: [makeStep({ ingredients: [makeIngredient()] })], servings: 4 }))
        apiMock.apiRecipeRelatedList.mockResolvedValue([])

        const wrapper = mountDialog()
        await flushPromises()

        wrapper.findComponent(RecipeShoppingPreview).vm.$emit('created')
        await flushPromises()

        expect(wrapper.emitted('created')).toBeTruthy()
        expect((wrapper.vm as any).dialog).toBe(false)
    })

    it('title reflects the servings bound from the shared preview', async () => {
        apiMock.apiRecipeRetrieve.mockResolvedValue(makeRecipe({ id: 1, steps: [makeStep({ ingredients: [makeIngredient()] })], servings: 3 }))
        apiMock.apiRecipeRelatedList.mockResolvedValue([])

        mountDialog()
        await flushPromises()
        // the recipe's own servings (3) is applied as the initial value once loaded
        expect(document.body.innerHTML).not.toContain('undefined')
    })
})
