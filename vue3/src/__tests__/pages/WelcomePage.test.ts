import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, type PiniaPlugin } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createRouter, createMemoryHistory } from 'vue-router'
import { apiMock, resetApiMock } from '@/__tests__/api-mock'
import { makeSpace, makeUserPreference } from '@/__tests__/factories'

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

import WelcomePage from '@/pages/WelcomePage.vue'

describe('WelcomePage', () => {
    beforeEach(() => {
        resetApiMock()
    })

    function mountWelcome() {
        const prePopulatePlugin: PiniaPlugin = ({ store }) => {
            if (store.$id === 'user_preference_store') {
                store.userSettings = makeUserPreference() as any
            }
        }

        const pinia = createPinia()
        pinia.use(prePopulatePlugin)

        const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false })
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [
                { path: '/', name: 'StartPage', component: { template: '<div/>' } },
                { path: '/welcome', name: 'WelcomePage', component: { template: '<div/>' } },
                { path: '/edit/:model/:id?', name: 'ModelEditPage', component: { template: '<div/>' } },
                { path: '/import', name: 'RecipeImportPage', component: { template: '<div/>' } },
            ],
        })

        return mount(WelcomePage, {
            global: {
                plugins: [pinia, i18n, router],
                stubs: {
                    OpenDataImportSettings: { template: '<div class="stub-open-data"/>' },
                    ModelEditDialog: { template: '<div class="stub-model-edit-dialog"/>' },
                },
            },
        })
    }

    it('mounts without error', async () => {
        apiMock.apiSpaceCurrentRetrieve.mockResolvedValue(makeSpace())
        const wrapper = mountWelcome()
        await flushPromises()
        expect(wrapper.exists()).toBe(true)
    })

    it('loads space on mount', async () => {
        apiMock.apiSpaceCurrentRetrieve.mockResolvedValue(makeSpace())
        mountWelcome()
        await flushPromises()
        expect(apiMock.apiSpaceCurrentRetrieve).toHaveBeenCalled()
    })

    it('displays welcome message', async () => {
        apiMock.apiSpaceCurrentRetrieve.mockResolvedValue(makeSpace())
        const wrapper = mountWelcome()
        await flushPromises()
        expect(wrapper.text()).toContain('WelcometoTandoor')
    })

    it('shows user display name', async () => {
        apiMock.apiSpaceCurrentRetrieve.mockResolvedValue(makeSpace())
        const wrapper = mountWelcome()
        await flushPromises()
        expect(wrapper.text()).toContain('testuser')
    })

    // feat-welcome-tc07/tc08/tc09/tc10: clicking step-1 "Next" with no fields
    // changed unconditionally PATCHed /api/space/{id}/, which 403s for non-admin
    // accounts and logs a console error on every normal wizard interaction - even
    // when there was nothing to save. Only PATCH when the space name actually changed.
    it('does not PATCH the space when clicking Next with the name unchanged', async () => {
        apiMock.apiSpaceCurrentRetrieve.mockResolvedValue(makeSpace({ name: 'My Space' }))
        apiMock.apiUserPreferencePartialUpdate.mockResolvedValue(makeUserPreference())
        const wrapper = mountWelcome()
        await flushPromises()

        const nextButton = wrapper.findAll('button').find(b => b.text() === 'Next')
        await nextButton!.trigger('click')
        await flushPromises()

        expect(apiMock.apiSpacePartialUpdate).not.toHaveBeenCalled()
    })

    it('PATCHes the space when the name was changed', async () => {
        apiMock.apiSpaceCurrentRetrieve.mockResolvedValue(makeSpace({ name: 'My Space' }))
        apiMock.apiSpacePartialUpdate.mockResolvedValue(makeSpace({ name: 'New Name' }))
        apiMock.apiUserPreferencePartialUpdate.mockResolvedValue(makeUserPreference())
        const wrapper = mountWelcome()
        await flushPromises()

        await wrapper.find('input[type="text"]').setValue('New Name')
        const nextButton = wrapper.findAll('button').find(b => b.text() === 'Next')
        await nextButton!.trigger('click')
        await flushPromises()

        expect(apiMock.apiSpacePartialUpdate).toHaveBeenCalled()
    })
})
