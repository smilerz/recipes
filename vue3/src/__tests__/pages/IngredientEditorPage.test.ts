import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
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

// On a phone the table scrolls sideways, which left the row Save/Delete buttons and the Save All button (both in the
// last column) off-screen. Phones get a leading row menu and a Save All bar above the table; desktop is unchanged.
describe('IngredientEditorPage on a phone', () => {
    function mountMobile() {
        const vuetify = createVuetify({components, directives, display: { mobileBreakpoint: 9999 }})
        // the helper's stub of the delete confirmation is inert; this one says "confirmed" when clicked
        const DeleteConfirmDialog = { emits: ['delete'], template: '<span class="stub-confirm-delete" @click="$emit(\'delete\')"/>' }
        return mountPage(IngredientEditorPage, { global: { plugins: [vuetify], stubs: { DeleteConfirmDialog } }, attachTo: document.body })
    }

    async function loaded(mount: () => ReturnType<typeof mountMobile>) {
        const wrapper = mount()
        await flushPromises()
        return wrapper
    }

    const noteOf = (wrapper: ReturnType<typeof mountMobile>, row: number) => wrapper.findAll('.note-input input')[row]

    beforeEach(() => {
        resetApiMock()
        apiMock.apiFoodRetrieve.mockResolvedValue(makeFood({ id: 1, name: 'Flour' }))
        apiMock.apiIngredientList.mockResolvedValue({
            results: [makeIngredient({ id: 1 }), makeIngredient({ id: 2 })],
            count: 2,
        })
        apiMock.apiIngredientUpdate.mockImplementation(async ({ ingredient }: any) => ingredient)
        apiMock.apiIngredientDestroy.mockResolvedValue(undefined)
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('replaces the trailing Save/Delete buttons with a menu button at the start of every row', async () => {
        const wrapper = await loaded(mountMobile)
        expect(wrapper.findAll('[data-test="row-menu"]')).toHaveLength(2)
        expect(wrapper.findAll('.v-btn-group')).toHaveLength(0)
    })

    it('shows Save All in a bar above the table, disabled until a row changes and then with the unsaved count', async () => {
        const wrapper = await loaded(mountMobile)
        const bar = wrapper.find('[data-test="save-bar"]')
        expect(bar.exists()).toBe(true)
        expect(bar.find('[data-test="save-all-button"]').classes()).toContain('v-btn--disabled')
        expect(bar.text()).not.toContain('unsaved')

        await noteOf(wrapper, 0).setValue('chopped')
        await flushPromises()
        expect(bar.find('[data-test="save-all-button"]').classes()).not.toContain('v-btn--disabled')
        expect(bar.text()).toContain('1')
        expect(bar.text()).toContain('unsaved')
    })

    it('Save All in the bar saves every changed row', async () => {
        const wrapper = await loaded(mountMobile)
        await noteOf(wrapper, 0).setValue('a')
        await noteOf(wrapper, 1).setValue('b')
        await flushPromises()
        await wrapper.find('[data-test="save-bar"] [data-test="save-all-button"]').trigger('click')
        await flushPromises()
        expect(apiMock.apiIngredientUpdate).toHaveBeenCalledTimes(2)
    })

    it('marks a changed row so the unsaved edit can be seen', async () => {
        const wrapper = await loaded(mountMobile)
        expect(wrapper.findAll('tr.ingredient-row--changed')).toHaveLength(0)
        await noteOf(wrapper, 1).setValue('x')
        await flushPromises()
        expect(wrapper.findAll('tr.ingredient-row--changed')).toHaveLength(1)
    })

    it('the row menu saves only that row, and only offers it once the row has changed', async () => {
        const wrapper = await loaded(mountMobile)
        await wrapper.findAll('[data-test="row-menu"]')[0].trigger('click')
        await flushPromises()
        expect(document.body.querySelector('[data-test="row-save"]')?.classList.contains('v-list-item--disabled')).toBe(true)
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

        await noteOf(wrapper, 0).setValue('chopped')
        await flushPromises()
        await wrapper.findAll('[data-test="row-menu"]')[0].trigger('click')
        await flushPromises()
        const save = document.body.querySelector('[data-test="row-save"]') as HTMLElement
        expect(save.classList.contains('v-list-item--disabled')).toBe(false)
        save.click()
        await flushPromises()
        expect(apiMock.apiIngredientUpdate).toHaveBeenCalledTimes(1)
        expect(apiMock.apiIngredientUpdate.mock.calls[0][0].id).toBe(1)
    })

    it('the row menu deletes that row once the delete confirmation says so', async () => {
        const wrapper = await loaded(mountMobile)
        await wrapper.findAll('[data-test="row-menu"]')[1].trigger('click')
        await flushPromises()
        const confirm = document.body.querySelector('.stub-confirm-delete') as HTMLElement
        expect(confirm).not.toBeNull()
        confirm.click()
        await flushPromises()
        expect(apiMock.apiIngredientDestroy).toHaveBeenCalledWith({ id: 2 })
    })
})

describe('IngredientEditorPage on a desktop', () => {
    beforeEach(() => {
        resetApiMock()
        apiMock.apiFoodRetrieve.mockResolvedValue(makeFood({ id: 1, name: 'Flour' }))
        apiMock.apiIngredientList.mockResolvedValue({
            results: [makeIngredient({ id: 1 }), makeIngredient({ id: 2 })],
            count: 2,
        })
    })

    it('keeps the Save/Delete buttons in the last column and has no phone save bar or row menu', async () => {
        const wrapper = mountPage(IngredientEditorPage)
        await flushPromises()
        expect(wrapper.findAll('.v-btn-group')).toHaveLength(2)
        expect(wrapper.find('[data-test="save-bar"]').exists()).toBe(false)
        expect(wrapper.find('[data-test="row-menu"]').exists()).toBe(false)
    })
})
