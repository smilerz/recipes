import {describe, it, expect, beforeEach, vi} from 'vitest'
import {flushPromises} from '@vue/test-utils'
import {mountPage} from '@/__tests__/pages/page-mount-helper'

// the ingredient menu links here with ?food_id=
const routeState = vi.hoisted(() => ({query: {} as Record<string, string>}))
vi.mock('vue-router', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    useRoute: () => ({query: routeState.query, path: '/pantry'}),
}))

// useUrlFilters reads/writes the URL; the bar only cares about the params it exposes.
const state = vi.hoisted(() => ({filterParams: null as any, setFilter: null as any}))
vi.mock('@/composables/useUrlFilters', async () => {
    const {ref, computed} = await import('vue')
    state.filterParams = ref({})
    state.setFilter = vi.fn()
    return {
        useUrlFilters: () => ({
            filterDefs: computed(() => []),
            groupedFilterDefs: computed(() => new Map()),
            filterParams: state.filterParams,
            activeFilterCount: computed(() => Object.keys(state.filterParams.value).length),
            getFilter: vi.fn(),
            setFilter: state.setFilter,
            clearFilter: vi.fn(),
            clearAllFilters: vi.fn(),
        }),
    }
})

import PantryFilterBar from '@/components/display/PantryFilterBar.vue'

const STUBS = {
    ListToolbar: {name: 'ListToolbar', props: {hasMultiSelect: Boolean, selectMode: Boolean, disableSearch: Boolean}, template: '<div class="stub-list-toolbar"/>'},
    TabbedDrawer: {name: 'TabbedDrawer', props: ['modelValue'], template: '<div class="stub-drawer"><slot name="filters"/></div>'},
    FilterPanel: {name: 'FilterPanel', template: '<div class="stub-filter-panel"/>'},
}

function lastUpdate(wrapper: any) {
    const events = wrapper.emitted('update')
    return events ? events[events.length - 1][0] : undefined
}

describe('PantryFilterBar', () => {
    beforeEach(() => {
        state.filterParams.value = {}
        state.setFilter.mockClear()
        routeState.query = {}
    })

    // search lives in the filter drawer now (a text filter), not in the toolbar
    it('sends the drawer\'s search text separately from the other filters', async () => {
        const wrapper = mountPage(PantryFilterBar, {global: {stubs: STUBS}})
        await flushPromises()

        state.filterParams.value = {query: 'dairy', expired: true}
        await flushPromises()

        expect(lastUpdate(wrapper)).toEqual({query: 'dairy', filters: {expired: true}})
    })

    it('leaves the search to the drawer: the toolbar has no search box of its own', async () => {
        const wrapper = mountPage(PantryFilterBar, {global: {stubs: STUBS}})
        await flushPromises()

        expect(wrapper.findComponent({name: 'ListToolbar'}).props('disableSearch')).toBe(true)
    })

    it('turns the ingredient menu\'s ?food_id= link into the Food filter', async () => {
        routeState.query = {food_id: '5'}
        mountPage(PantryFilterBar, {global: {stubs: STUBS}})
        await flushPromises()

        expect(state.setFilter).toHaveBeenCalledWith('foodId', '5')
    })

    it('sets no Food filter when there is no ?food_id=', async () => {
        mountPage(PantryFilterBar, {global: {stubs: STUBS}})
        await flushPromises()

        expect(state.setFilter).not.toHaveBeenCalled()
    })

    it('emits the active filters', async () => {
        const wrapper = mountPage(PantryFilterBar, {global: {stubs: STUBS}})
        await flushPromises()

        state.filterParams.value = {expired: true}
        await flushPromises()

        expect(lastUpdate(wrapper)).toEqual({query: '', filters: {expired: true}})
    })

    it('offers select mode and reflects whether it is on', async () => {
        const wrapper = mountPage(PantryFilterBar, {props: {selectMode: true}, global: {stubs: STUBS}})
        await flushPromises()

        const toolbar = wrapper.findComponent({name: 'ListToolbar'})
        expect(toolbar.props('hasMultiSelect')).toBe(true)
        expect(toolbar.props('selectMode')).toBe(true)
    })

    it('passes the toolbar\'s select toggle up to the page', async () => {
        const wrapper = mountPage(PantryFilterBar, {global: {stubs: STUBS}})
        await flushPromises()

        wrapper.findComponent({name: 'ListToolbar'}).vm.$emit('toggle-select')

        expect(wrapper.emitted('toggle-select')).toHaveLength(1)
    })

    it('opens the filter drawer from the toolbar', async () => {
        const wrapper = mountPage(PantryFilterBar, {global: {stubs: STUBS}})
        await flushPromises()
        expect(wrapper.findComponent({name: 'TabbedDrawer'}).props('modelValue')).toBe(false)

        wrapper.findComponent({name: 'ListToolbar'}).vm.$emit('open-filters')
        await flushPromises()

        expect(wrapper.findComponent({name: 'TabbedDrawer'}).props('modelValue')).toBe(true)
    })
})
