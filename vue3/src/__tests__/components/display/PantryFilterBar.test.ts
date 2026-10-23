import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {flushPromises} from '@vue/test-utils'
import {createVuetify} from 'vuetify'
import {mountPage} from '@/__tests__/pages/page-mount-helper'

// the ingredient menu links here with ?food_id=
const routeState = vi.hoisted(() => ({query: {} as Record<string, string>}))
vi.mock('vue-router', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    useRoute: () => ({query: routeState.query, path: '/pantry'}),
}))

// useUrlFilters reads/writes the URL; the bar only cares about the params it exposes.
const state = vi.hoisted(() => ({filterParams: null as any, setFilter: null as any, clearFilter: null as any, getFilter: null as any}))
vi.mock('@/composables/useUrlFilters', async () => {
    const {ref, computed} = await import('vue')
    state.filterParams = ref({})
    state.setFilter = vi.fn()
    state.clearFilter = vi.fn()
    state.getFilter = vi.fn()
    return {
        useUrlFilters: () => ({
            filterDefs: computed(() => []),
            groupedFilterDefs: computed(() => new Map()),
            filterParams: state.filterParams,
            activeFilterCount: computed(() => Object.keys(state.filterParams.value).length),
            getFilter: state.getFilter,
            setFilter: state.setFilter,
            clearFilter: state.clearFilter,
            clearAllFilters: vi.fn(),
        }),
    }
})

import PantryFilterBar from '@/components/display/PantryFilterBar.vue'

const STUBS = {
    ListToolbar: {name: 'ListToolbar', props: {hasMultiSelect: Boolean, selectMode: Boolean, disableSearch: Boolean}, template: '<div class="stub-list-toolbar"><slot name="search"/></div>'},
    ModelSelect: {name: 'ModelSelect', props: ['modelValue', 'model'], emits: ['update:modelValue'], template: '<div class="stub-model-select"/>'},
    TabbedDrawer: {name: 'TabbedDrawer', props: ['modelValue'], template: '<div class="stub-drawer"><slot name="filters"/></div>'},
    FilterPanel: {name: 'FilterPanel', template: '<div class="stub-filter-panel"/>'},
}

// a Vuetify instance created at the chosen width, so the desktop/phone layout follows it
function mountBar(props: Record<string, any> = {}, width = 1400) {
    window.innerWidth = width
    return mountPage(PantryFilterBar, {props, global: {stubs: STUBS, plugins: [createVuetify()]}})
}

function lastUpdate(wrapper: any) {
    const events = wrapper.emitted('update')
    return events ? events[events.length - 1][0] : undefined
}

describe('PantryFilterBar', () => {
    const originalWidth = window.innerWidth
    afterEach(() => {
        window.innerWidth = originalWidth
    })
    beforeEach(() => {
        state.filterParams.value = {}
        state.setFilter.mockClear()
        state.clearFilter.mockClear()
        state.getFilter.mockReset()
        routeState.query = {}
    })

    // search lives in the filter drawer now (a text filter), not in the toolbar
    it('sends the drawer\'s search text separately from the other filters', async () => {
        const wrapper = mountBar()
        await flushPromises()

        state.filterParams.value = {query: 'dairy', expired: true}
        await flushPromises()

        expect(lastUpdate(wrapper)).toEqual({query: 'dairy', filters: {expired: true}})
    })

    it('leaves the search to the drawer: the toolbar has no search box of its own', async () => {
        const wrapper = mountBar()
        await flushPromises()

        expect(wrapper.findComponent({name: 'ListToolbar'}).props('disableSearch')).toBe(true)
    })

    it('turns the ingredient menu\'s ?food_id= link into the Food filter', async () => {
        routeState.query = {food_id: '5'}
        mountBar()
        await flushPromises()

        expect(state.setFilter).toHaveBeenCalledWith('foodId', '5')
    })

    it('sets no Food filter when there is no ?food_id=', async () => {
        mountBar()
        await flushPromises()

        expect(state.setFilter).not.toHaveBeenCalled()
    })

    it('emits the active filters', async () => {
        const wrapper = mountBar()
        await flushPromises()

        state.filterParams.value = {expired: true}
        await flushPromises()

        expect(lastUpdate(wrapper)).toEqual({query: '', filters: {expired: true}})
    })

    it('offers select mode and reflects whether it is on', async () => {
        const wrapper = mountBar({selectMode: true})
        await flushPromises()

        const toolbar = wrapper.findComponent({name: 'ListToolbar'})
        expect(toolbar.props('hasMultiSelect')).toBe(true)
        expect(toolbar.props('selectMode')).toBe(true)
    })

    it('passes the toolbar\'s select toggle up to the page', async () => {
        const wrapper = mountBar()
        await flushPromises()

        wrapper.findComponent({name: 'ListToolbar'}).vm.$emit('toggle-select')

        expect(wrapper.emitted('toggle-select')).toHaveLength(1)
    })

    it('opens the filter drawer from the toolbar', async () => {
        const wrapper = mountBar()
        await flushPromises()
        expect(wrapper.findComponent({name: 'TabbedDrawer'}).props('modelValue')).toBe(false)

        wrapper.findComponent({name: 'ListToolbar'}).vm.$emit('open-filters')
        await flushPromises()

        expect(wrapper.findComponent({name: 'TabbedDrawer'}).props('modelValue')).toBe(true)
    })

    describe('Food selector and Add, inline with Filters and Select', () => {
        const toolbar = (w: any) => w.findComponent({name: 'ListToolbar'})
        const foodSelect = (w: any) => toolbar(w).findComponent({name: 'ModelSelect'})

        it('puts a Food selector in the toolbar row', async () => {
            const wrapper = mountBar()
            await flushPromises()

            expect(foodSelect(wrapper).exists()).toBe(true)
            expect(foodSelect(wrapper).props('model')).toBe('Food')
        })

        it('shows the Food filter\'s food in the selector (the same state as the drawer\'s Food filter)', async () => {
            state.getFilter.mockImplementation((key: string) => key === 'foodId' ? '104' : undefined)
            const wrapper = mountBar()
            await flushPromises()

            expect(foodSelect(wrapper).props('modelValue')).toBe(104)
        })

        it('shows nothing selected when there is no Food filter', async () => {
            const wrapper = mountBar()
            await flushPromises()

            expect(foodSelect(wrapper).props('modelValue')).toBeNull()
        })

        it('picking a food sets the Food filter', async () => {
            const wrapper = mountBar()
            await flushPromises()

            foodSelect(wrapper).vm.$emit('update:modelValue', 7)

            expect(state.setFilter).toHaveBeenCalledWith('foodId', '7')
        })

        it('clearing the selector clears the Food filter', async () => {
            const wrapper = mountBar()
            await flushPromises()

            foodSelect(wrapper).vm.$emit('update:modelValue', null)

            expect(state.setFilter).toHaveBeenCalledWith('foodId', undefined)
        })

        it('has an Add button beside the selector that tells the page to add', async () => {
            const wrapper = mountBar()
            await flushPromises()

            await toolbar(wrapper).find('[data-test="pantry-add"]').trigger('click')

            expect(wrapper.emitted('add')).toHaveLength(1)
        })
    })

    describe('layout: Food, Location and Add on one line, Filters and Select with them', () => {
        const toolbar = (w: any) => w.findComponent({name: 'ListToolbar'})
        const fields = (w: any) => w.findComponent({name: 'PantryFields'})

        it('desktop: the fields share the toolbar row, and there is no sort icon (the column titles sort)', async () => {
            const wrapper = mountBar({}, 1400)
            await flushPromises()

            expect(toolbar(wrapper).findComponent({name: 'PantryFields'}).exists()).toBe(true)
            expect(wrapper.find('[data-test="pantry-sort"]').exists()).toBe(false)
        })

        it('phone: the toolbar row holds a sort icon, and the fields get their own row below it', async () => {
            const wrapper = mountBar({}, 600)
            await flushPromises()

            expect(toolbar(wrapper).find('[data-test="pantry-sort"]').exists()).toBe(true)
            expect(toolbar(wrapper).findComponent({name: 'PantryFields'}).exists()).toBe(false)
            expect(fields(wrapper).exists()).toBe(true)
        })

        it('phone: picking a sort field tells the page, starting ascending', async () => {
            const wrapper = mountBar({}, 600)
            await flushPromises()

            wrapper.findComponent({name: 'SortMenuButton'}).vm.$emit('select', 'amount')

            expect(wrapper.emitted('update:sortField')![0]).toEqual(['amount'])
        })

        it('phone: picking the sorted field again flips it to descending', async () => {
            const wrapper = mountBar({sortField: 'amount', sortDescending: false}, 600)
            await flushPromises()

            wrapper.findComponent({name: 'SortMenuButton'}).vm.$emit('select', 'amount')

            expect(wrapper.emitted('update:sortDescending')![0]).toEqual([true])
        })

        it('passes the chosen location up to the page', async () => {
            const wrapper = mountBar()
            await flushPromises()

            fields(wrapper).vm.$emit('update:inventoryLocation', {id: 4, name: 'Fridge'})

            expect(wrapper.emitted('update:inventoryLocation')![0]).toEqual([{id: 4, name: 'Fridge'}])
        })
    })
})
