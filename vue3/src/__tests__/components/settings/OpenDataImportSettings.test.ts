import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { apiMock, resetApiMock } from '@/__tests__/api-mock'

vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    ApiApi: class { constructor() { return apiMock } },
}))

vi.mock('@vueuse/core', async () => {
    const { ref } = await import('vue')
    return { useStorage: (_key: string, defaultValue: any) => ref(defaultValue) }
})

import OpenDataImportSettings from '@/components/settings/OpenDataImportSettings.vue'

function mountSettings() {
    const pinia = createPinia()
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false })
    return mount(OpenDataImportSettings, {
        global: { plugins: [pinia, i18n] },
    })
}

describe('OpenDataImportSettings', () => {
    beforeEach(() => {
        resetApiMock()
    })

    // feat-settings-open-data-import-tc02/tc03: a non-admin account 403s on
    // GET /api/import-open-data/. Previously this surfaced as a raw error toast
    // while the page kept rendering an empty Language select with no Save button.
    it('shows a graceful permission message instead of a broken empty form on a 403', async () => {
        apiMock.apiImportOpenDataRetrieve.mockRejectedValue({ response: { status: 403 } })

        const wrapper = mountSettings()
        await flushPromises()

        expect(wrapper.find('[data-test="open-data-permission-denied"]').exists()).toBe(true)
        expect(wrapper.find('button').exists()).toBe(false)
    })

    it('renders the normal import form when the request succeeds', async () => {
        apiMock.apiImportOpenDataRetrieve.mockResolvedValue({
            versions: ['en'],
            datatypes: ['food'],
            en: { food: 10 },
        })

        const wrapper = mountSettings()
        await flushPromises()

        expect(wrapper.find('[data-test="open-data-permission-denied"]').exists()).toBe(false)
    })
})
