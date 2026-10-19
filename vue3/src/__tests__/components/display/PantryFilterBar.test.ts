import {describe, it, expect, beforeEach, vi} from 'vitest'
import {flushPromises} from '@vue/test-utils'
import {mountPage} from '@/__tests__/pages/page-mount-helper'

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
    ListToolbar: {name: 'ListToolbar', template: '<div class="stub-list-toolbar"/>'},
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
    })

    it('emits the typed search query', async () => {
        const wrapper = mountPage(PantryFilterBar, {global: {stubs: STUBS}})
        await flushPromises()

        wrapper.findComponent({name: 'ListToolbar'}).vm.$emit('update:query', 'dairy')
        await flushPromises()

        expect(lastUpdate(wrapper)).toEqual({query: 'dairy', filters: {}})
    })

    it('emits the active filters', async () => {
        const wrapper = mountPage(PantryFilterBar, {global: {stubs: STUBS}})
        await flushPromises()

        state.filterParams.value = {expired: true}
        await flushPromises()

        expect(lastUpdate(wrapper)).toEqual({query: '', filters: {expired: true}})
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
