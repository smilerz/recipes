import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { apiMock, resetApiMock } from '@/__tests__/api-mock'
import { makeRecipeBook, makeRecipeBookEntry, makeRecipeOverview } from '@/__tests__/factories'
import { mountPage } from '@/__tests__/pages/page-mount-helper'

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

// jsdom is narrower than the md breakpoint; let a test choose the layout
const { desktop } = vi.hoisted(() => ({ desktop: { on: false } }))
vi.mock('vuetify', async (importOriginal) => {
    const original = await importOriginal<any>()
    const { computed } = await import('vue')
    return {
        ...original,
        useDisplay: () => {
            const real = original.useDisplay()
            return new Proxy(real, { get: (target, key) => key === 'mdAndUp' ? computed(() => desktop.on) : (target as any)[key] })
        },
    }
})

import BookViewPage from '@/pages/BookViewPage.vue'

describe('BookViewPage', () => {
    beforeEach(() => {
        resetApiMock()
    })

    function mountBookPage(bookId = '1') {
        return mountPage(BookViewPage, {
            props: { bookId },
        })
    }

    it('mounts without error', async () => {
        apiMock.apiRecipeBookRetrieve.mockResolvedValue(makeRecipeBook({ id: 1, name: 'Favorites' }))
        apiMock.apiRecipeBookEntryList.mockResolvedValue({ results: [], count: 0, next: null })

        const wrapper = mountBookPage()
        await flushPromises()

        expect(wrapper.exists()).toBe(true)
    })

    it('displays book name', async () => {
        apiMock.apiRecipeBookRetrieve.mockResolvedValue(makeRecipeBook({ name: 'Holiday Recipes' }))
        apiMock.apiRecipeBookEntryList.mockResolvedValue({ results: [], count: 0, next: null })

        const wrapper = mountBookPage()
        await flushPromises()

        expect(wrapper.text()).toContain('Holiday Recipes')
    })

    it('calls apiRecipeBookRetrieve with bookId prop', async () => {
        apiMock.apiRecipeBookRetrieve.mockResolvedValue(makeRecipeBook())
        apiMock.apiRecipeBookEntryList.mockResolvedValue({ results: [], count: 0, next: null })

        mountBookPage('42')
        await flushPromises()

        expect(apiMock.apiRecipeBookRetrieve).toHaveBeenCalledWith({ id: '42' })
    })

    it('loads book entries after book loads', async () => {
        apiMock.apiRecipeBookRetrieve.mockResolvedValue(makeRecipeBook({ id: 1 }))
        apiMock.apiRecipeBookEntryList.mockResolvedValue({
            results: [
                makeRecipeBookEntry({ recipeContent: makeRecipeOverview({ name: 'Cookies' }) }),
                makeRecipeBookEntry({ recipeContent: makeRecipeOverview({ name: 'Cake' }) }),
            ],
            count: 2,
            next: null,
        })

        const wrapper = mountBookPage()
        await flushPromises()

        expect(apiMock.apiRecipeBookEntryList).toHaveBeenCalled()
    })

    describe('paging through the recipes', () => {
        async function mountBookOf(count: number) {
            apiMock.apiRecipeBookRetrieve.mockResolvedValue(makeRecipeBook({ id: 1 }))
            apiMock.apiRecipeBookEntryList.mockResolvedValue({
                results: Array.from({ length: count }, (_, i) => makeRecipeBookEntry({ id: i + 1, recipeContent: makeRecipeOverview({ id: i + 1, name: `Recipe ${i + 1}` }) })),
                count,
                next: null,
            })
            const wrapper = mountBookPage()
            await flushPromises()
            return wrapper
        }

        beforeEach(() => {
            desktop.on = false
        })

        it('does not float arrows over the recipes', async () => {
            const wrapper = await mountBookOf(3)
            expect(wrapper.findComponent({ name: 'VWindow' }).props('showArrows')).toBeFalsy()
        })

        it('turns the pages with buttons beside the recipes, not over them', async () => {
            const wrapper = await mountBookOf(3)
            const window = wrapper.findComponent({ name: 'VWindow' })
            expect(window.props('modelValue')).toBe(0)
            expect(wrapper.find('[data-testid="book-previous"]').attributes('disabled')).toBeDefined()

            await wrapper.find('[data-testid="book-next"]').trigger('click')
            expect(window.props('modelValue')).toBe(1)
            expect(wrapper.find('[data-testid="book-previous"]').attributes('disabled')).toBeUndefined()

            await wrapper.find('[data-testid="book-next"]').trigger('click')
            await wrapper.find('[data-testid="book-next"]').trigger('click')
            expect(window.props('modelValue')).toBe(2)
            expect(wrapper.find('[data-testid="book-next"]').attributes('disabled')).toBeDefined()
        })

        it('does not turn back past the first recipe when the table of contents landed on the second', async () => {
            desktop.on = true
            const wrapper = await mountBookOf(5)
            const window = wrapper.findComponent({ name: 'VWindow' })
            await wrapper.find('.v-expansion-panel-title').trigger('click')
            const entry = wrapper.findAll('.v-expansion-panel-text .v-list-item').find(i => i.text().includes('Recipe 2'))
            expect(entry, 'table of contents entry of Recipe 2').toBeTruthy()
            await entry!.trigger('click')
            expect(window.props('modelValue')).toBe(1)

            await wrapper.find('[data-testid="book-previous"]').trigger('click')
            expect(window.props('modelValue')).toBe(0)
            expect(wrapper.find('[data-testid="book-previous"]').attributes('disabled')).toBeDefined()
        })

        it('turns two recipes at a time on a wide screen', async () => {
            desktop.on = true
            const wrapper = await mountBookOf(5)
            const window = wrapper.findComponent({ name: 'VWindow' })
            await wrapper.find('[data-testid="book-next"]').trigger('click')
            expect(window.props('modelValue')).toBe(2)
            await wrapper.find('[data-testid="book-next"]').trigger('click')
            expect(window.props('modelValue')).toBe(4)
            expect(wrapper.find('[data-testid="book-next"]').attributes('disabled')).toBeDefined()
        })

    })

    it('displays shared users when present', async () => {
        const book = makeRecipeBook({
            shared: [{ id: 2, username: 'chef', displayName: 'Chef Bob' } as any],
        })
        apiMock.apiRecipeBookRetrieve.mockResolvedValue(book)
        apiMock.apiRecipeBookEntryList.mockResolvedValue({ results: [], count: 0, next: null })

        const wrapper = mountBookPage()
        await flushPromises()

        expect(wrapper.text()).toContain('Chef Bob')
    })
})
