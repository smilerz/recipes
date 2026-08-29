import {describe, it, expect, vi, beforeEach} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {createVuetify} from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import {createI18n} from 'vue-i18n'

import {apiMock, resetApiMock} from '@/__tests__/api-mock'

vi.mock('@/openapi', async (imp) => ({...(await imp<any>()), ApiApi: class { constructor() { return apiMock } }}))

const {addErrorMock} = vi.hoisted(() => ({addErrorMock: vi.fn()}))
vi.mock('@/stores/MessageStore', async (imp) => ({...(await imp<any>()), useMessageStore: () => ({addError: addErrorMock})}))

import BatchEditRecipeDialog from '@/components/dialogs/BatchEditRecipeDialog.vue'

const RECIPE_1 = {id: 1, name: 'Soup'}
const BOOK = {id: 9, name: 'Weeknight Dinners'}

function mountDialog() {
    const vuetify = createVuetify({components, directives})
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    return mount(BatchEditRecipeDialog, {
        attachTo: document.body,
        props: {items: [RECIPE_1] as any, modelValue: false},
        global: {
            plugins: [vuetify, i18n],
            stubs: {ModelSelect: {template: '<div class="model-select-stub" />'}},
        },
    })
}

function clickUpdate() {
    const btn = [...document.querySelectorAll('.v-btn')]
        .find(b => b.textContent?.includes('Update')) as HTMLElement | undefined
    btn?.click()
}

describe('BatchEditRecipeDialog', () => {
    beforeEach(() => {
        resetApiMock()
        apiMock.apiRecipeBatchUpdateUpdate.mockResolvedValue({})
    })

    it('includes bookAdd in the batch update request when a book is selected', async () => {
        const wrapper = mountDialog()
        await wrapper.setProps({modelValue: true})
        ;(wrapper.vm as any).selectedBook = BOOK
        await wrapper.vm.$nextTick()

        clickUpdate()
        await flushPromises()

        expect(apiMock.apiRecipeBatchUpdateUpdate).toHaveBeenCalledWith(
            expect.objectContaining({recipeBatchUpdate: expect.objectContaining({bookAdd: BOOK.id})})
        )
    })
})
