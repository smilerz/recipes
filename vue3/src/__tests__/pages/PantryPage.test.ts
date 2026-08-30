/**
 * #4: PantryPage had no way to quickly add a lot for the food selected in the top filter -
 * useInventoryActions.quickAddToInventory existed and was already wired into the Food list page,
 * but never wired into PantryPage itself.
 */
import {describe, it, expect, vi, beforeEach} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {createPinia, setActivePinia} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'

import {apiMock, resetApiMock} from '@/__tests__/api-mock'

vi.mock('vue-router', () => ({
    useRoute: () => ({query: {}}),
}))
vi.mock('vue-i18n', async (importOriginal) => ({
    ...(await importOriginal<typeof import('vue-i18n')>()),
    useI18n: () => ({t: (key: string) => key}),
}))
vi.mock('@/openapi', async (imp) => ({...(await imp<any>()), ApiApi: class { constructor() { return apiMock } }}))

const quickAddToInventory = vi.fn()
vi.mock('@/composables/useInventoryActions', () => ({
    useInventoryActions: () => ({quickAddToInventory}),
}))

import PantryPage from '@/pages/PantryPage.vue'

function mountPage() {
    const pinia = createPinia()
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})
    return mount(PantryPage, {
        global: {
            plugins: [pinia, i18n, vuetify],
            stubs: {
                'model-select': {template: '<div/>'},
                'inventory-entry-table': {template: '<div/>', methods: {load: vi.fn()}},
                'stock-up-dialog': {template: '<div/>', methods: {open: vi.fn()}},
                'use-up-dialog': {template: '<div/>', methods: {open: vi.fn()}},
                'inventory-quick-add-dialog': {template: '<div/>'},
            },
        },
    })
}

describe('PantryPage', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        resetApiMock()
        quickAddToInventory.mockReset()
    })

    it('quickAdd does nothing when no food is selected', async () => {
        const w = mountPage()
        await flushPromises()

        ;(w.vm as any).quickAdd()
        await flushPromises()

        expect(quickAddToInventory).not.toHaveBeenCalled()
        w.unmount()
    })

    it('quickAdd adds the selected food to inventory and reloads the entry table', async () => {
        quickAddToInventory.mockResolvedValue(true)
        const w = mountPage()
        await flushPromises()

        ;(w.vm as any).food = {id: 5, name: 'Flour'}
        const loadSpy = vi.spyOn((w.vm as any).entryTable, 'load')

        ;(w.vm as any).quickAdd()
        await flushPromises()

        expect(quickAddToInventory).toHaveBeenCalledTimes(1)
        const [food, dialog, t] = quickAddToInventory.mock.calls[0]
        expect(food).toEqual({id: 5, name: 'Flour'})
        expect(dialog).toBeTruthy()
        expect(typeof t).toBe('function')
        expect(loadSpy).toHaveBeenCalledTimes(1)

        w.unmount()
    })
})
