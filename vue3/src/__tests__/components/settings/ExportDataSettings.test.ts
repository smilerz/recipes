import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { apiMock, resetApiMock } from '@/__tests__/api-mock'

vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    ApiApi: class { constructor() { return apiMock } },
}))

import ExportDataSettings from '@/components/settings/ExportDataSettings.vue'

function mountSettings() {
    const pinia = createPinia()
    const i18n = createI18n({
        legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false,
        messages: { en: { PortableDataExportSummary: '{foods} foods, {keywords} keywords, {books} books exported.' } },
    })
    return mount(ExportDataSettings, {
        global: { plugins: [pinia, i18n] },
    })
}

describe('ExportDataSettings', () => {
    beforeEach(() => {
        resetApiMock()
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
        // jsdom doesn't implement URL.createObjectURL/revokeObjectURL
        global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
        global.URL.revokeObjectURL = vi.fn()
    })

    it('defaults to the Recipes scope and shows the existing recipe export form', () => {
        const wrapper = mountSettings()
        expect(wrapper.find('[data-test="portable-export-foods"]').exists()).toBe(false)
    })

    it('switching to the Food/Keywords/Books scope shows scope checkboxes, all checked by default', async () => {
        const wrapper = mountSettings()
        await wrapper.find('[data-test="export-scope-portable"]').trigger('click')
        await flushPromises()

        expect(wrapper.find('[data-test="portable-export-foods"]').exists()).toBe(true)
        expect(wrapper.find('[data-test="portable-export-keywords"]').exists()).toBe(true)
        expect(wrapper.find('[data-test="portable-export-books"]').exists()).toBe(true)
    })

    it('exporting portable data calls the API with the selected scope and triggers a download', async () => {
        // raw envelope passthrough (no typed model) - keys stay snake_case, as Django sends them
        apiMock.apiExportPortableDataCreate.mockResolvedValue({
            tandoor_export_format: 'portable-data-v1',
            exported_at: '2026-08-13T00:00:00Z',
            content: { foods: [{ name: 'Carrot' }], keywords: [], books: [], warnings: [] },
        })

        const wrapper = mountSettings()
        await wrapper.find('[data-test="export-scope-portable"]').trigger('click')
        await flushPromises()

        await wrapper.find('[data-test="portable-export-btn"]').trigger('click')
        await flushPromises()

        expect(apiMock.apiExportPortableDataCreate).toHaveBeenCalledWith({
            portableDataExportRequest: { includeFoods: true, includeKeywords: true, includeBooks: true },
        })
        expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled()
        expect(wrapper.find('[data-test="portable-export-summary"]').text()).toContain('1')
    })

    it('unchecking a scope checkbox excludes it from the export request', async () => {
        apiMock.apiExportPortableDataCreate.mockResolvedValue({
            tandoor_export_format: 'portable-data-v1', exported_at: '2026-08-13T00:00:00Z',
            content: { foods: [], keywords: [], books: [], warnings: [] },
        })

        const wrapper = mountSettings()
        await wrapper.find('[data-test="export-scope-portable"]').trigger('click')
        await flushPromises()
        await wrapper.find('[data-test="portable-export-books"] input').setValue(false)

        await wrapper.find('[data-test="portable-export-btn"]').trigger('click')
        await flushPromises()

        expect(apiMock.apiExportPortableDataCreate).toHaveBeenCalledWith({
            portableDataExportRequest: { includeFoods: true, includeKeywords: true, includeBooks: false },
        })
    })
})
