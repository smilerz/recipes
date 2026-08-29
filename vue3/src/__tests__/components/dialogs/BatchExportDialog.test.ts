import {describe, it, expect, vi, beforeEach} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {createVuetify} from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import {createI18n} from 'vue-i18n'

import {apiMock, resetApiMock} from '@/__tests__/api-mock'

vi.mock('@/openapi', async (imp) => ({...(await imp<any>()), ApiApi: class { constructor() { return apiMock } }}))

import BatchExportDialog from '@/components/dialogs/BatchExportDialog.vue'

const RECIPE_1 = {id: 1, name: 'Soup'}
const RECIPE_2 = {id: 2, name: 'Salad'}

function mountDialog() {
    const vuetify = createVuetify({components, directives})
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    return mount(BatchExportDialog, {
        attachTo: document.body,
        props: {items: [RECIPE_1, RECIPE_2] as any, modelValue: false},
        global: {plugins: [vuetify, i18n]},
    })
}

function clickButton(text: string) {
    const btn = [...document.querySelectorAll('.v-btn')].find(b => b.textContent?.includes(text)) as HTMLElement | undefined
    btn?.click()
}

describe('BatchExportDialog', () => {
    beforeEach(() => {
        resetApiMock()
    })

    it('exports the selected recipes as JSON-LD only (no format picker) and offers a download once ready', async () => {
        apiMock.apiExportCreate.mockResolvedValue({id: 5, type: 'LDJSON', running: true})
        apiMock.apiExportLogRetrieve.mockResolvedValue({id: 5, type: 'LDJSON', running: false, exportedRecipes: 2})

        const wrapper = mountDialog()
        await wrapper.setProps({modelValue: true})

        clickButton('Export')
        await flushPromises()

        expect(apiMock.apiExportCreate).toHaveBeenCalledWith(
            expect.objectContaining({exportRequest: expect.objectContaining({type: 'LDJSON', recipes: [RECIPE_1, RECIPE_2], all: false})})
        )
        // no format selector rendered — this is JSON-LD-only by design
        expect(document.body.textContent).not.toContain('Cheftap')

        expect(document.querySelector('[data-test="batch-export-download"]')).toBeTruthy()
    })
})
