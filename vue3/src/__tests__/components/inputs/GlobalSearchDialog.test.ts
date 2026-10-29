import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createVuetify } from 'vuetify'
import { createRouter, createMemoryHistory } from 'vue-router'
import { apiMock, resetApiMock } from '@/__tests__/api-mock'

vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    ApiApi: class { constructor() { return apiMock } },
}))
vi.mock('@vueuse/core', async (importOriginal) => ({ ...(await importOriginal<any>()), useStorage: (_k: string, d: any) => ({ value: d }) }))
vi.mock('@vueuse/router', () => ({ useRouteQuery: () => ({ value: false }) }))

import GlobalSearchDialog from '@/components/inputs/GlobalSearchDialog.vue'

describe('GlobalSearchDialog', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        resetApiMock()
        apiMock.apiRecipeList = vi.fn().mockResolvedValue({ results: [], count: 0 })
        apiMock.apiRecipeFlatList = vi.fn().mockResolvedValue([])
    })
    afterEach(() => vi.useRealTimers())

    it('does not ask the server which recipes can be made now for every search, it shows names and no cards', async () => {
        const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }, { path: '/advanced-search', name: 'SearchPage', component: { template: '<div/>' } }] })
        const wrapper = mount(GlobalSearchDialog, {
            global: {
                plugins: [createPinia(), createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false }), createVuetify(), router],
                stubs: { VDialog: { template: '<div><slot/></div>' }, VClosableCardTitle: true },
            },
        })
        ;(wrapper.vm as any).searchQuery = 'soup'
        await vi.advanceTimersByTimeAsync(2000)
        await flushPromises()
        expect(apiMock.apiRecipeList).toHaveBeenCalledWith(expect.objectContaining({ query: 'soup', makenowBadge: false }), expect.anything())
    })
})
