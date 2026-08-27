import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createVuetify } from 'vuetify'
import { createRouter, createMemoryHistory } from 'vue-router'
import { makeRecipeOverview } from '../factories'

// onMounted fetches the full recipe (for the ingredients table); stub the API so
// the fetch resolves with a known recipe, and stub the ingredient builder so we can
// assert the built list reaches the table without exercising its internals.
const { retrieveMock, buildIngredientsMock } = vi.hoisted(() => ({
    retrieveMock: vi.fn(),
    buildIngredientsMock: vi.fn((..._args: any[]) => [{ id: 1, food: { name: 'flour' } }]),
}))
vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/openapi')>()),
    ApiApi: class {
        apiRecipeRetrieve = retrieveMock
    },
}))

vi.mock('@/utils/model_utils', () => ({
    getRecipeIngredients: (...args: any[]) => buildIngredientsMock(...args),
}))

import BookEntryCard from '@/components/display/BookEntryCard.vue'

function mountBookEntryCard() {
    setActivePinia(createPinia())
    const i18n = createI18n({
        legacy: false, locale: 'en',
        messages: { en: { Open: 'Open' } },
        missingWarn: false, fallbackWarn: false,
    })
    const vuetify = createVuetify()
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/recipe/:id', name: 'RecipeViewPage', component: { template: '<div/>' } }],
    })
    return mount(BookEntryCard, {
        props: { recipeOverview: makeRecipeOverview({ id: 42, description: 'A tasty dish' }) },
        global: {
            plugins: [createPinia(), i18n, vuetify, router],
            stubs: {
                RecipeCard: { name: 'RecipeCard', props: ['recipe', 'disableLink', 'showMenu', 'height'], template: '<div class="stub-recipe-card"/>' },
                IngredientsTable: { name: 'IngredientsTable', props: ['modelValue'], template: '<div class="stub-ingredients-table"/>' },
            },
        },
    })
}

describe('BookEntryCard (D08 — reuses RecipeCard for the display)', () => {
    it('renders RecipeCard as the display with navigation and context menu disabled', () => {
        retrieveMock.mockResolvedValue({ id: 42, steps: [] })
        const w = mountBookEntryCard()
        const card = w.findComponent({ name: 'RecipeCard' })
        expect(card.exists()).toBe(true)
        expect(card.props('disableLink')).toBe(true)
        expect(card.props('showMenu')).toBe(false)
        expect(card.props('recipe')).toMatchObject({ id: 42 })
    })

    it('provides an "Open" button as the sole navigation', () => {
        retrieveMock.mockResolvedValue({ id: 42, steps: [] })
        const w = mountBookEntryCard()
        const openLink = w.findAll('a').find(a => a.text().includes('Open'))
        expect(openLink).toBeTruthy()
        expect(openLink!.attributes('href')).toContain('/recipe/42')
    })

    it('fetches the recipe and passes the built ingredients to the table', async () => {
        retrieveMock.mockResolvedValue({ id: 42, steps: [] })
        const w = mountBookEntryCard()
        await flushPromises()
        expect(retrieveMock).toHaveBeenCalledWith({ id: 42 })
        expect(buildIngredientsMock).toHaveBeenCalled()
        expect(w.findComponent({ name: 'IngredientsTable' }).props('modelValue'))
            .toEqual([{ id: 1, food: { name: 'flour' } }])
    })
})
