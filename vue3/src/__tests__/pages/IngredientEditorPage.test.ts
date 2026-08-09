import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { apiMock, resetApiMock } from '@/__tests__/api-mock'
import { makeFood, makeIngredient } from '@/__tests__/factories'
import { mountPage } from '@/__tests__/pages/page-mount-helper'

vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/openapi')>()),
    ApiApi: class { constructor() { return apiMock } },
}))

vi.mock('@vueuse/core', async () => {
    const { ref } = await import('vue')
    return {
        useStorage: (_key: string, defaultValue: any) => ref(defaultValue),
        useTitle: () => ref(''),
        useUrlSearchParams: () => ({ food_id: '1' }),
    }
})

import IngredientEditorPage from '@/pages/IngredientEditorPage.vue'

describe('IngredientEditorPage', () => {
    beforeEach(() => {
        resetApiMock()
        apiMock.apiFoodRetrieve.mockResolvedValue(makeFood({ id: 1, name: 'Flour' }))
        apiMock.apiIngredientList.mockResolvedValue({
            results: [makeIngredient({ id: 1 }), makeIngredient({ id: 2 })],
            count: 2,
        })
    })

    // ingredient-editor-tc21: the bulk save-all button gave zero feedback when clicked
    // with nothing to save - no request, no toast, no validation message - despite
    // appearing fully enabled. Disable it instead until a row is actually edited.
    it('disables the save-all button until a row is changed', async () => {
        const wrapper = mountPage(IngredientEditorPage)
        await flushPromises()

        const saveAllButton = wrapper.find('[data-test="save-all-button"]')
        expect(saveAllButton.exists()).toBe(true)
        expect(saveAllButton.classes()).toContain('v-btn--disabled')

        const noteInput = wrapper.find('.note-input input')
        expect(noteInput.exists()).toBe(true)
        await noteInput.setValue('chopped')
        await flushPromises()

        expect(saveAllButton.classes()).not.toContain('v-btn--disabled')
    })
})
