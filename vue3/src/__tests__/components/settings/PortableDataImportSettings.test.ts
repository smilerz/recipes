import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { apiMock, resetApiMock } from '@/__tests__/api-mock'

vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    ApiApi: class { constructor() { return apiMock } },
}))

import PortableDataImportSettings from '@/components/settings/PortableDataImportSettings.vue'

const ENVELOPE = {
    tandoor_export_format: 'portable-data-v1',
    exported_at: '2026-08-13T00:00:00Z',
    content: { foods: [{ name: 'Carrot' }], keywords: [], books: [], warnings: [] },
}

function mountSettings() {
    const pinia = createPinia()
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false })
    return mount(PortableDataImportSettings, {
        global: { plugins: [pinia, i18n] },
    })
}

function makeFile(content: object) {
    return new File([JSON.stringify(content)], 'export.json', { type: 'application/json' })
}

async function selectFile(wrapper: ReturnType<typeof mountSettings>, file: File) {
    // jsdom disallows scripting a native file input's value; drive the VFileInput
    // component's own update:model-value emit instead, exactly as Vuetify would after a real pick.
    const fileInput = wrapper.findComponent('[data-test="portable-import-file"]')
    await fileInput.vm.$emit('update:model-value', [file])
    await flushPromises()
}

describe('PortableDataImportSettings', () => {
    beforeEach(() => {
        resetApiMock()
    })

    it('uploading a valid export file runs analyze and shows a new/matching diff preview', async () => {
        apiMock.apiImportPortableDataCreate.mockResolvedValue({
            foods: { new: ['Carrot'], matching: [], possible_match: [] },
            keywords: { new: [], matching: [], possible_match: [] },
            books: { new: [], matching: [], possible_match: [] },
            warnings: [],
        })

        const wrapper = mountSettings()
        await selectFile(wrapper, makeFile(ENVELOPE))

        expect(apiMock.apiImportPortableDataCreate).toHaveBeenCalledWith({
            portableDataImportRequest: { mode: 'analyze', _export: ENVELOPE, mergePolicy: 'fill_gaps' },
        })
        expect(wrapper.find('[data-test="portable-import-summary-foods"]').text()).toContain('1')
        expect(wrapper.find('[data-test="portable-import-continue"]').exists()).toBe(true)
    })

    it('rejects a file that is not valid JSON without calling the API', async () => {
        const badFile = new File(['not json'], 'bad.json', { type: 'application/json' })
        const wrapper = mountSettings()
        await selectFile(wrapper, badFile)

        expect(apiMock.apiImportPortableDataCreate).not.toHaveBeenCalled()
        expect(wrapper.text()).toContain('Invalid')
    })

    it('continuing to step 2 and confirming commits the import with the chosen merge policy', async () => {
        apiMock.apiImportPortableDataCreate.mockResolvedValueOnce({
            foods: { new: ['Carrot'], matching: [], possible_match: [] },
            keywords: { new: [], matching: [], possible_match: [] },
            books: { new: [], matching: [], possible_match: [] },
            warnings: [],
        })

        const wrapper = mountSettings()
        await selectFile(wrapper, makeFile(ENVELOPE))

        await wrapper.find('[data-test="portable-import-continue"]').trigger('click')
        await flushPromises()

        apiMock.apiImportPortableDataCreate.mockResolvedValueOnce({
            foods: { created: 1, merged: 0, errors: [] },
            keywords: { created: 0, merged: 0, errors: [] },
            books: { created: 0, merged: 0 },
            warnings: [],
        })

        await wrapper.find('[data-test="portable-import-commit"]').trigger('click')
        await flushPromises()

        expect(apiMock.apiImportPortableDataCreate).toHaveBeenLastCalledWith({
            portableDataImportRequest: { mode: 'apply', _export: ENVELOPE, mergePolicy: 'fill_gaps' },
        })
        expect(wrapper.find('[data-test="portable-import-report"]').text()).toContain('1')
    })

    it('surfaces API errors from analyze without crashing', async () => {
        apiMock.apiImportPortableDataCreate.mockRejectedValue(new Error('boom'))

        const wrapper = mountSettings()
        await selectFile(wrapper, makeFile(ENVELOPE))

        expect(wrapper.find('[data-test="portable-import-continue"]').exists()).toBe(false)
    })
})
