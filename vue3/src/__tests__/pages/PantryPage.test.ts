/**
 * #4: PantryPage had no way to quickly add a lot for the food selected in the top filter -
 * useInventoryActions.quickAddToInventory existed and was already wired into the Food list page,
 * but never wired into PantryPage itself.
 */
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
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

const {addFoodsToShopping, moveLots, setLotsExpiry, addMessage, selectAll, tableLoad} = vi.hoisted(() => ({
    addFoodsToShopping: vi.fn(), moveLots: vi.fn(), setLotsExpiry: vi.fn(), addMessage: vi.fn(), selectAll: vi.fn(), tableLoad: vi.fn(),
}))
vi.mock('@/composables/usePantryBatchActions', () => ({
    usePantryBatchActions: () => ({addFoodsToShopping, moveLots, setLotsExpiry}),
}))
vi.mock('@/stores/MessageStore', async (imp) => ({
    ...(await imp<any>()),
    useMessageStore: () => ({addMessage, addError: vi.fn()}),
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
                'model-select': {name: 'ModelSelect', props: ['model'], template: '<div/>'},
                'inventory-entry-table': {name: 'InventoryEntryTable', props: ['food', 'inventoryLocation', 'query', 'filters', 'selectMode', 'selected'], template: '<div/>', methods: {load: tableLoad, selectAll}},
                'pantry-filter-bar': {name: 'PantryFilterBar', props: ['selectMode'], template: '<div/>'},
                'pantry-batch-dialog': {name: 'PantryBatchDialog', props: ['modelValue', 'mode', 'count'], template: '<div/>'},
                'pantry-booking-dialog': {name: 'PantryBookingDialog', props: ['modelValue', 'bookingMode'], template: '<div/>'},
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

    it('passes the filter bar\'s search and filters on to the entry table', async () => {
        const w = mountPage()
        await flushPromises()

        w.findComponent({name: 'PantryFilterBar'}).vm.$emit('update', {query: 'dairy', filters: {expired: true}})
        await flushPromises()

        const table = w.findComponent({name: 'InventoryEntryTable'})
        expect(table.props('query')).toBe('dairy')
        expect(table.props('filters')).toEqual({expired: true})
        w.unmount()
    })
})

describe('PantryPage — select mode and batch actions', () => {
    // Vuetify counts anything under 1280px as mobile, which moves the batch actions into a closed menu.
    const originalWidth = window.innerWidth
    beforeEach(() => {
        window.innerWidth = 1400
        setActivePinia(createPinia())
        resetApiMock()
        addFoodsToShopping.mockReset()
        moveLots.mockReset()
        setLotsExpiry.mockReset()
        addMessage.mockReset()
        selectAll.mockReset()
        tableLoad.mockReset()
    })

    afterEach(() => {
        window.innerWidth = originalWidth
    })

    const lots = [{id: 1, food: {id: 10, name: 'Flour'}}, {id: 2, food: {id: 11, name: 'Salt'}}]

    async function mountInSelectMode(selected: any[] = lots) {
        const w = mountPage()
        await flushPromises()
        w.findComponent({name: 'PantryFilterBar'}).vm.$emit('toggle-select')
        await flushPromises()
        w.findComponent({name: 'InventoryEntryTable'}).vm.$emit('update:selected', selected)
        await flushPromises()
        return w
    }

    it('shows the selection bar only while in select mode', async () => {
        const w = mountPage()
        await flushPromises()
        expect(w.find('[data-test="batch-shopping"]').exists()).toBe(false)

        w.findComponent({name: 'PantryFilterBar'}).vm.$emit('toggle-select')
        await flushPromises()

        expect(w.find('[data-test="batch-shopping"]').exists()).toBe(true)
        expect(w.findComponent({name: 'InventoryEntryTable'}).props('selectMode')).toBe(true)
        w.unmount()
    })

    it('adds the selected lots\' foods to the shopping list and reports the result', async () => {
        addFoodsToShopping.mockResolvedValue({added: 2, alreadyListed: 0, failed: 0})
        const w = await mountInSelectMode()

        await w.find('[data-test="batch-shopping"]').trigger('click')
        await flushPromises()

        expect(addFoodsToShopping).toHaveBeenCalledWith(lots)
        expect(addMessage).toHaveBeenCalled()
        w.unmount()
    })

    it('leaves select mode and reloads after a batch action', async () => {
        addFoodsToShopping.mockResolvedValue({added: 2, alreadyListed: 0, failed: 0})
        const w = await mountInSelectMode()

        await w.find('[data-test="batch-shopping"]').trigger('click')
        await flushPromises()

        expect(w.find('[data-test="batch-shopping"]').exists()).toBe(false)
        expect(tableLoad).toHaveBeenCalled()
        w.unmount()
    })

    it('does nothing with an empty selection', async () => {
        const w = await mountInSelectMode([])

        expect(w.find('[data-test="batch-shopping"]').attributes('disabled')).toBeDefined()
        w.unmount()
    })

    it('moves the selected lots to the chosen location', async () => {
        moveLots.mockResolvedValue({updated: 2, failed: 0})
        const w = await mountInSelectMode()

        await w.find('[data-test="batch-move"]').trigger('click')
        const dialog = w.findComponent({name: 'PantryBatchDialog'})
        expect(dialog.props('mode')).toBe('location')
        expect(dialog.props('modelValue')).toBe(true)
        dialog.vm.$emit('confirm', {id: 3, name: 'Fridge'})
        await flushPromises()

        expect(moveLots).toHaveBeenCalledWith(lots, {id: 3, name: 'Fridge'})
        expect(tableLoad).toHaveBeenCalled()
        w.unmount()
    })

    it('sets the expiry of the selected lots, and can clear it with null', async () => {
        setLotsExpiry.mockResolvedValue({updated: 2, failed: 0})
        const w = await mountInSelectMode()

        await w.find('[data-test="batch-expiry"]').trigger('click')
        const dialog = w.findComponent({name: 'PantryBatchDialog'})
        expect(dialog.props('mode')).toBe('expires')
        const date = new Date(2027, 5, 15)
        dialog.vm.$emit('confirm', date)
        await flushPromises()

        expect(setLotsExpiry).toHaveBeenCalledWith(lots, date)
        w.unmount()
    })

    it('warns instead of celebrating when some lots failed', async () => {
        moveLots.mockResolvedValue({updated: 1, failed: 1})
        const w = await mountInSelectMode()

        await w.find('[data-test="batch-move"]').trigger('click')
        w.findComponent({name: 'PantryBatchDialog'}).vm.$emit('confirm', {id: 3, name: 'Fridge'})
        await flushPromises()

        expect(addMessage.mock.calls[0][0]).toBe('warning')
        w.unmount()
    })

    it('select-all asks the table to select everything it loaded', async () => {
        const w = await mountInSelectMode([])

        ;(w.vm as any).selectAll()

        expect(selectAll).toHaveBeenCalled()
        w.unmount()
    })
})

describe('PantryPage — layout order', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        resetApiMock()
    })

    it('puts the search toolbar above the food and location pickers', async () => {
        const w = mountPage()
        await flushPromises()

        const searchBar = w.findComponent({name: 'PantryFilterBar'}).element
        const pickers = w.find('.v-row').element

        expect(searchBar.compareDocumentPosition(pickers) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        w.unmount()
    })
})

describe('PantryPage — Food lives in the filter drawer', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        resetApiMock()
        quickAddToInventory.mockReset()
    })

    const filterBar = (w: any) => w.findComponent({name: 'PantryFilterBar'})

    it('has no Food picker of its own, only the location picker', async () => {
        const w = mountPage()
        await flushPromises()

        expect(w.findAllComponents({name: 'ModelSelect'}).map(c => c.props('model'))).toEqual(['InventoryLocation'])
        w.unmount()
    })

    it('knows the food chosen in the drawer\'s Food filter', async () => {
        apiMock.apiFoodRetrieve.mockResolvedValue({id: 5, name: 'Flour'})
        const w = mountPage()
        await flushPromises()

        filterBar(w).vm.$emit('update', {query: '', filters: {foodId: 5}})
        await flushPromises()

        expect(apiMock.apiFoodRetrieve).toHaveBeenCalledWith({id: 5})
        expect((w.vm as any).food).toMatchObject({id: 5, name: 'Flour'})
        w.unmount()
    })

    it('forgets the food when the Food filter is cleared', async () => {
        apiMock.apiFoodRetrieve.mockResolvedValue({id: 5, name: 'Flour'})
        const w = mountPage()
        await flushPromises()
        filterBar(w).vm.$emit('update', {query: '', filters: {foodId: 5}})
        await flushPromises()

        filterBar(w).vm.$emit('update', {query: '', filters: {}})
        await flushPromises()

        expect((w.vm as any).food).toBeUndefined()
        w.unmount()
    })

    it('Add quick-adds the filtered food when there is one', async () => {
        quickAddToInventory.mockResolvedValue(true)
        const w = mountPage()
        await flushPromises()
        ;(w.vm as any).food = {id: 5, name: 'Flour'}

        await w.find('[data-test="pantry-add"]').trigger('click')
        await flushPromises()

        expect(quickAddToInventory).toHaveBeenCalledTimes(1)
        w.unmount()
    })

    it('Add opens the add dialog (which has its own food picker) when no food is filtered', async () => {
        const w = mountPage()
        await flushPromises()

        await w.find('[data-test="pantry-add"]').trigger('click')
        await flushPromises()

        const dialog = w.findComponent({name: 'PantryBookingDialog'})
        expect(quickAddToInventory).not.toHaveBeenCalled()
        expect(dialog.props('modelValue')).toBe(true)
        expect(dialog.props('bookingMode')).toBe('add')
        w.unmount()
    })

    it('reloads the list after the add dialog saves', async () => {
        const w = mountPage()
        await flushPromises()
        await w.find('[data-test="pantry-add"]').trigger('click')

        w.findComponent({name: 'PantryBookingDialog'}).vm.$emit('update')
        await flushPromises()

        expect(tableLoad).toHaveBeenCalled()
        w.unmount()
    })

    it('keeps the location picker and Add on one line instead of wrapping Add onto its own row', async () => {
        const w = mountPage()
        await flushPromises()

        expect(w.find('[data-test="pantry-add-row"]').classes()).toContain('flex-nowrap')
        w.unmount()
    })
})
