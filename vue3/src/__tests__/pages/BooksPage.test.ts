import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { apiMock, resetApiMock } from '@/__tests__/api-mock'
import { makeRecipeBook, makeUser } from '@/__tests__/factories'
import { mountPage } from '@/__tests__/pages/page-mount-helper'
import { SEARCH_DEBOUNCE_MS } from '@/utils/utils'

vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    ApiApi: class { constructor() { return apiMock } },
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

import BooksPage from '@/pages/BooksPage.vue'

describe('BooksPage', () => {
    beforeEach(() => {
        resetApiMock()
    })

    it('mounts without error', async () => {
        apiMock.apiRecipeBookList.mockResolvedValue({ results: [], count: 0 })
        const wrapper = mountPage(BooksPage)
        await flushPromises()
        expect(wrapper.exists()).toBe(true)
    })

    it('calls apiRecipeBookList on mount', async () => {
        apiMock.apiRecipeBookList.mockResolvedValue({ results: [], count: 0 })
        mountPage(BooksPage)
        await flushPromises()
        expect(apiMock.apiRecipeBookList).toHaveBeenCalled()
    })

    it('renders book cards from API response', async () => {
        const books = [
            makeRecipeBook({ id: 1, name: 'Favorites' }),
            makeRecipeBook({ id: 2, name: 'Weeknight Dinners' }),
        ]
        apiMock.apiRecipeBookList.mockResolvedValue({ results: books, count: 2 })

        const wrapper = mountPage(BooksPage)
        await flushPromises()

        expect(wrapper.text()).toContain('Favorites')
        expect(wrapper.text()).toContain('Weeknight Dinners')
    })

    it('renders empty state when no books', async () => {
        apiMock.apiRecipeBookList.mockResolvedValue({ results: [], count: 0 })
        const wrapper = mountPage(BooksPage)
        await flushPromises()

        expect(wrapper.text()).not.toContain('Favorites')
    })

    describe('search', () => {
        beforeEach(() => {
            vi.useFakeTimers()
        })
        afterEach(() => {
            vi.useRealTimers()
        })

        it('re-fetches with the typed query after the debounce', async () => {
            apiMock.apiRecipeBookList.mockResolvedValue({ results: [], count: 0 })
            const wrapper = mountPage(BooksPage)
            await flushPromises()
            expect(apiMock.apiRecipeBookList).toHaveBeenCalledTimes(1)

            await wrapper.find('input').setValue('Weeknight')
            vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS + 10)
            await flushPromises()

            const lastCall = apiMock.apiRecipeBookList.mock.calls.at(-1)
            expect(lastCall?.[0]).toEqual(expect.objectContaining({ query: 'Weeknight' }))
        })
    })
})
