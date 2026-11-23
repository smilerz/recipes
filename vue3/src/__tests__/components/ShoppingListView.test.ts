/**
 * Opening the meal-plan-scoped Shopping List tab (MealPlanEditor -> ShoppingListView with
 * a mealPlanId prop) triggered a full, unfiltered load of every shopping list entry in the
 * household instead of just the entries for that one meal plan - onMounted() called
 * useShoppingStore().refreshFromAPI() with no arguments even though the API (and the store
 * function itself) already support scoping the request via a mealplan filter.
 */
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {createPinia, setActivePinia} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import {VTabs} from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'
import {apiMock, resetApiMock} from '@/__tests__/api-mock'
import {useUserPreferenceStore} from '@/stores/UserPreferenceStore'

vi.mock('@/openapi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/openapi')>()
    return {
        ...actual,
        ApiApi: class {constructor() { return apiMock }},
    }
})

vi.mock('@vueuse/core', async (importOriginal) => {
    const {ref} = await import('vue')
    return {
        ...(await importOriginal<typeof import('@vueuse/core')>()),
        useStorage: (_key: string, defaultValue: any) => ref(defaultValue),
    }
})

vi.mock('vue-i18n', async (importOriginal) => ({
    ...(await importOriginal<typeof import('vue-i18n')>()),
    useI18n: () => ({t: (key: string) => key}),
}))

vi.mock('vue-router', () => ({
    useRouter: () => ({push: vi.fn().mockResolvedValue(undefined)}),
    onBeforeRouteLeave: () => {},
}))

vi.mock('@vueuse/router', () => ({
    useRouteQuery: () => ({value: false}),
}))

import ShoppingListView from '@/components/display/ShoppingListView.vue'
import SelectionBar from '@/components/common/SelectionBar.vue'
import ShoppingUndoButton from '@/components/display/ShoppingUndoButton.vue'
import SupermarketSwitchMenu from '@/components/display/SupermarketSwitchMenu.vue'
import ListToolbar from '@/components/model_list/ListToolbar.vue'
import ModelListFilterChips from '@/components/model_list/ModelListFilterChips.vue'
import TabbedDrawer from '@/components/common/TabbedDrawer.vue'
import {useShoppingStore} from '@/stores/ShoppingStore'
import {useMessageStore} from '@/stores/MessageStore'

const confirmResult = {value: true}
const confirmOpen = vi.fn(async () => confirmResult.value)

function mountView(props: Record<string, any> = {}) {
    const pinia = createPinia()
    setActivePinia(pinia)

    // avoid the auto-sync setTimeout loop scheduling with a NaN delay from an empty userSettings default
    useUserPreferenceStore().userSettings.shoppingAutoSync = 0

    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})

    return mount(ShoppingListView, {
        props,
        global: {
            plugins: [pinia, i18n, vuetify],
            stubs: {
                ModelSelect: {template: '<div class="stub-model-select"/>'},
                ShoppingLineItem: {template: '<div class="stub-shopping-line-item"/>'},
                NumberScalerDialog: {template: '<div class="stub-number-scaler"/>'},
                SupermarketEditor: {template: '<div class="stub-supermarket-editor"/>'},
                DeleteConfirmDialog: {template: '<div class="stub-delete-confirm"/>'},
                ShoppingListEntryInput: {template: '<div class="stub-shopping-list-entry-input"/>'},
                ModelEditDialog: {template: '<div class="stub-model-edit-dialog"/>'},
                ShoppingExportDialog: {template: '<div class="stub-shopping-export-dialog"/>'},
                StockUpDialog: {template: '<div class="stub-stock-up-dialog"/>'},
                AddToShoppingDialog: {template: '<div class="stub-add-to-shopping-dialog"/>'},
                ShoppingListSelectChip: {template: '<div class="stub-shopping-list-select-chip"/>'},
                CategorySelectChip: {template: '<div class="stub-category-select-chip"/>'},
                // answers the Ignore confirmation with whatever the test sets
                ActionConfirmDialog: {
                    template: '<div class="stub-action-confirm"/>',
                    setup(_: any, {expose}: any) {
                        expose({open: confirmOpen})
                        return {}
                    },
                },
                // the real chips look up the label of a model-select filter through the generic model API
                ModelListFilterChips: {props: ['filterDefs', 'activeFilterCount'], template: '<div class="stub-filter-chips"/>'},
                // the real drawer is a v-navigation-drawer, which needs the app's v-layout around it
                TabbedDrawer: {
                    props: ['modelValue', 'activeTab', 'tabs', 'pinnable', 'pinned'],
                    template: '<div class="stub-tabbed-drawer"><slot name="filters"/><slot name="settings"/></div>',
                },
            },
        },
    })
}

describe('ShoppingListView', () => {
    beforeEach(() => {
        resetApiMock()
        ;(apiMock as any).apiShoppingListEntryList = vi.fn().mockResolvedValue({count: 0, next: null, previous: null, results: [], timestamp: new Date()})
        ;(apiMock as any).apiSupermarketCategoryList = vi.fn().mockResolvedValue({count: 0, next: null, previous: null, results: []})
        ;(apiMock as any).apiSupermarketList = vi.fn().mockResolvedValue({count: 0, next: null, previous: null, results: []})
        ;(apiMock as any).apiShoppingListList = vi.fn().mockResolvedValue({count: 0, next: null, previous: null, results: []})
    })

    it('scopes the initial entry load to the given meal plan instead of fetching the whole shopping list', async () => {
        const w = mountView({mealPlanId: 42})
        await flushPromises()

        expect(apiMock.apiShoppingListEntryList).toHaveBeenCalledWith(expect.objectContaining({mealplan: 42}))

        w.unmount()
    })

    it('loads the full, unscoped list when no meal plan id is given', async () => {
        const w = mountView({})
        await flushPromises()

        expect(apiMock.apiShoppingListEntryList).toHaveBeenCalledWith(expect.not.objectContaining({mealplan: expect.anything()}))

        w.unmount()
    })

    // The batch actions live in the shared SelectionBar (same bar as the model lists and the pantry),
    // not in a bespoke banner, so more actions can be added without crowding it.
    describe('select mode', () => {
        // Vuetify counts anything under 1280px as mobile, which moves the actions into a closed menu.
        const originalWidth = window.innerWidth
        beforeEach(() => {
            window.innerWidth = 1400
        })
        afterEach(() => {
            window.innerWidth = originalWidth
        })

        it('shows the shared SelectionBar with the batch chips only while select mode is on', async () => {
            const w = mountView({})
            await flushPromises()
            expect(w.findComponent(SelectionBar).exists()).toBe(false)

            ;(w.vm as any).selectEnabled = true
            await flushPromises()

            const bar = w.findComponent(SelectionBar)
            expect(bar.exists()).toBe(true)
            expect(bar.find('.stub-shopping-list-select-chip').exists()).toBe(true)
            expect(bar.find('.stub-category-select-chip').exists()).toBe(true)

            w.unmount()
        })

        it('closing the bar leaves select mode and clears the selection', async () => {
            const w = mountView({})
            await flushPromises()
            ;(w.vm as any).selectEnabled = true
            ;(w.vm as any).selectedLines = [{food: {id: 1}, entries: new Map()}]
            await flushPromises()

            w.findComponent(SelectionBar).vm.$emit('close')
            await flushPromises()

            expect((w.vm as any).selectEnabled).toBe(false)
            expect((w.vm as any).selectedLines).toEqual([])

            w.unmount()
        })

        it('Select none clears the selection but stays in select mode', async () => {
            const w = mountView({})
            await flushPromises()
            ;(w.vm as any).selectEnabled = true
            ;(w.vm as any).selectedLines = [{food: {id: 1}, entries: new Map()}]
            await flushPromises()

            w.findComponent(SelectionBar).vm.$emit('select-none')
            await flushPromises()

            expect((w.vm as any).selectEnabled).toBe(true)
            expect((w.vm as any).selectedLines).toEqual([])

            w.unmount()
        })

        it('shows how many items are selected in the bar', async () => {
            const w = mountView({})
            await flushPromises()
            ;(w.vm as any).selectEnabled = true
            ;(w.vm as any).selectedLines = [{food: {id: 1}, entries: new Map()}, {food: {id: 2}, entries: new Map()}]
            await flushPromises()

            expect(w.findComponent(SelectionBar).props('selectedCount')).toBe(2)

            w.unmount()
        })
    })

    // The controls row is the shared ListToolbar (same Select toggle as the recipe search, the model
    // lists and the pantry) instead of a row of icon-only chip-group buttons.
    describe('toolbar', () => {
        const originalWidth = window.innerWidth
        beforeEach(() => {
            window.innerWidth = 1400
        })
        afterEach(() => {
            window.innerWidth = originalWidth
        })

        it('uses the shared ListToolbar with a Select toggle, not the icon-only select buttons', async () => {
            const w = mountView({})
            await flushPromises()

            const toolbar = w.findComponent(ListToolbar)
            expect(toolbar.exists()).toBe(true)
            expect(toolbar.props('hasMultiSelect')).toBe(true)
            expect(toolbar.props('disableSearch')).toBe(false)
            expect(w.find('.fa-list-check').exists()).toBe(false)

            w.unmount()
        })

        it('toggling Select in the toolbar enters and leaves select mode and clears the selection', async () => {
            const w = mountView({})
            await flushPromises()
            const toolbar = w.findComponent(ListToolbar)

            toolbar.vm.$emit('toggle-select')
            await flushPromises()
            expect((w.vm as any).selectEnabled).toBe(true)
            expect(toolbar.props('selectMode')).toBe(true)

            ;(w.vm as any).selectedLines = [{food: {id: 1}, entries: new Map()}]
            toolbar.vm.$emit('toggle-select')
            await flushPromises()
            expect((w.vm as any).selectEnabled).toBe(false)
            expect((w.vm as any).selectedLines).toEqual([])

            w.unmount()
        })

        // Undo lives in the top bar (the tab row next to Stock up), not in the search field. The top bar is replaced
        // by the select bar in select mode and does not exist in the meal plan dialog, so Undo is there too.
        it('puts Undo in the top bar next to Stock up, not in the search toolbar', async () => {
            const w = mountView({})
            await flushPromises()

            expect(w.findComponent(ListToolbar).find('[data-test="shopping-undo"]').exists()).toBe(false)
            expect(w.find('.v-tabs').find('[data-test="shopping-undo"]').exists()).toBe(true)

            w.unmount()
        })

        it('keeps Undo reachable in select mode, in the select bar', async () => {
            const w = mountView({})
            await flushPromises()
            ;(w.vm as any).selectEnabled = true
            await flushPromises()

            expect(w.findComponent(SelectionBar).find('[data-test="shopping-undo"]').exists()).toBe(true)
            expect(w.findComponent(ListToolbar).find('[data-test="shopping-undo"]').exists()).toBe(false)

            w.unmount()
        })

        it('the meal plan list has no tab bar, so Undo gets a row of its own, still outside the search toolbar', async () => {
            const w = mountView({mealPlanId: 42})
            await flushPromises()

            expect(w.find('.v-tabs').exists()).toBe(false)
            expect(w.findComponent(ShoppingUndoButton).exists()).toBe(true)
            expect(w.findComponent(ListToolbar).find('[data-test="shopping-undo"]').exists()).toBe(false)

            w.unmount()
        })

        // The supermarket is a button in the top bar with a down arrow to switch supermarkets right there.
        it('switches supermarket from a down arrow on the supermarket tab', async () => {
            const w = mountView({})
            await flushPromises()
            const settings = useUserPreferenceStore().deviceSettings
            const store = useShoppingStore()
            store.supermarkets = [{id: 3, name: 'Marianos'}, {id: 4, name: 'Jewel'}] as any
            settings.shopping_selected_supermarket = {id: 3, name: 'Marianos', categoryToSupermarket: []} as any
            await flushPromises()

            const menu = w.find('.v-tabs').findComponent(SupermarketSwitchMenu)
            expect(menu.exists()).toBe(true)
            expect(menu.props('selectedId')).toBe(3)
            expect(menu.props('supermarkets').map((s: any) => s.name)).toEqual(['Marianos', 'Jewel'])

            const setFilter = vi.spyOn((w.vm as any).shoppingFilters, 'setFilter').mockImplementation(() => {})
            ;(menu as any).vm.$emit('select', 4)
            expect(setFilter).toHaveBeenCalledWith('supermarket', '4')

            ;(menu as any).vm.$emit('select', null)
            expect(setFilter).toHaveBeenCalledWith('supermarket', undefined)
            w.unmount()
        })

        it('with no supermarket chosen, a Supermarket button with a down arrow lets you pick one', async () => {
            const w = mountView({})
            await flushPromises()
            useShoppingStore().supermarkets = [{id: 3, name: 'Marianos'}] as any
            useUserPreferenceStore().deviceSettings.shopping_selected_supermarket = null
            await flushPromises()

            const tabs = w.find('.v-tabs')
            expect(tabs.find('[data-test="pick-supermarket"]').exists()).toBe(true)
            expect(tabs.findComponent(SupermarketSwitchMenu).exists()).toBe(true)
            w.unmount()
        })

        it('has no supermarket or shopping list chips of its own: they are filters in the panel', async () => {
            const w = mountView({})
            await flushPromises()

            const toolbar = w.findComponent(ListToolbar)
            expect(toolbar.text()).not.toContain('Supermarket')
            expect(toolbar.find('.stub-shopping-list-select-chip').exists()).toBe(false)
            expect((w.vm as any).shoppingFilters.filterDefs.value.map((d: any) => d.key)).toEqual(expect.arrayContaining(['supermarket', 'lists']))

            w.unmount()
        })
    })

    // Search over the items, the filter drawer and chips, and the settings tab: the same controls the other
    // list pages have. The view filters the already-loaded, grouped list on the client.
    describe('search and filters', () => {
        const originalWidth = window.innerWidth
        beforeEach(() => {
            window.innerWidth = 1400
        })
        afterEach(() => {
            window.innerWidth = originalWidth
        })

        function category(name: string, foods: {id: number, name: string}[]) {
            return {name, foods: new Map(foods.map(f => [f.id, {food: {id: f.id, name: f.name}, entries: new Map()}]))}
        }

        async function mountWithList(props: Record<string, any> = {}) {
            const w = mountView(props)
            await flushPromises()
            const store = useShoppingStore()
            store.initialized = true
            store.supermarketCategories = [{id: 3, name: 'Dairy'}, {id: 4, name: 'Produce'}] as any
            const grouped = [
                category('Produce', [{id: 1, name: 'apple'}, {id: 2, name: 'banana'}]),
                category('Dairy', [{id: 3, name: 'milk'}]),
            ] as any
            store.entriesByGroup = grouped
            store.entriesByGroupMealPlan = grouped
            await flushPromises()
            return w
        }

        it('shows every item when nothing is searched or filtered', async () => {
            const w = await mountWithList()
            expect(w.findAll('.stub-shopping-line-item').length).toBe(3)
            w.unmount()
        })

        it('searching filters the items by name and drops categories left empty', async () => {
            const w = await mountWithList()

            w.findComponent(ListToolbar).vm.$emit('update:query', 'APP')
            await flushPromises()

            expect(w.findAll('.stub-shopping-line-item').length).toBe(1)
            expect(w.text()).toContain('Produce')
            expect(w.text()).not.toContain('Dairy')
            w.unmount()
        })

        it('the category filter shows only that category', async () => {
            const w = await mountWithList()

            ;(w.vm as any).shoppingFilters.setFilter('category', '3')
            await flushPromises()

            expect(w.findAll('.stub-shopping-line-item').length).toBe(1)
            expect(w.text()).toContain('Dairy')
            expect(w.text()).not.toContain('Produce')
            w.unmount()
        })

        it('select all only selects the items that are showing', async () => {
            const w = await mountWithList()
            w.findComponent(ListToolbar).vm.$emit('update:query', 'milk')
            await flushPromises()

            ;(w.vm as any).selectAll()

            expect((w.vm as any).selectedLines.map((l: any) => l.food.name)).toEqual(['milk'])
            w.unmount()
        })

        it('offers Filters and Settings in a drawer on the main list, with active filters as chips', async () => {
            const w = await mountWithList()
            const toolbar = w.findComponent(ListToolbar)
            expect(toolbar.props('hasFilters')).toBe(true)
            expect(toolbar.props('disableSearch')).toBe(false)
            expect(w.findComponent(TabbedDrawer).props('tabs').map((t: any) => t.key)).toEqual(['filters', 'settings'])
            expect(w.findComponent(ModelListFilterChips).exists()).toBe(false)

            toolbar.vm.$emit('open-filters')
            await flushPromises()
            expect(w.findComponent(TabbedDrawer).props('modelValue')).toBe(true)

            ;(w.vm as any).shoppingFilters.setFilter('delayed', '1')
            await flushPromises()
            expect(w.findComponent(ModelListFilterChips).exists()).toBe(true)
            w.unmount()
        })

        // Editing the shopping lists was only possible from the old picker's menu; now it is in the Settings tab.
        it('the Settings tab lists the shopping lists with a way to edit each and to create one', async () => {
            const w = await mountWithList()
            useShoppingStore().shoppingLists = [{id: 5, name: 'Weekly'}, {id: 6, name: 'Party'}] as any
            await flushPromises()

            expect(w.findAll('[data-test="edit-shopping-list"]').length).toBe(2)
            expect(w.find('[data-test="create-shopping-list"]').exists()).toBe(true)
            expect(w.text()).toContain('Weekly')
            w.unmount()
        })

        // The top row sits in a container like the rest of the page, so it has the same side margins.
        it('has the top bar and the select bar in a container, like the rest of the page', async () => {
            const w = await mountWithList()
            expect(w.find('.v-tabs').element.closest('.v-container')).not.toBeNull()

            ;(w.vm as any).selectEnabled = true
            await flushPromises()
            expect(w.findComponent(SelectionBar).element.closest('.v-container')).not.toBeNull()
            w.unmount()
        })

        // On a phone the top bar (tabs, Undo, Stock up) can be wider than the screen: show the slide group's arrows
        // whenever it overflows, as a hint that there is more (the search toolbar has the same kind of hint).
        it('shows arrows on the top bar when it overflows, as a hint that there is more', async () => {
            const w = await mountWithList()
            const tabs = w.findComponent(VTabs)
            expect(tabs.props('showArrows')).toBe(true)
            // the same plain chevrons as the search toolbar's scroll hint, not the default arrow buttons
            expect(tabs.props('nextIcon')).toBe('fa-solid fa-chevron-right')
            w.unmount()
        })

        // The search field can be hidden per device (a setting in the Settings tab); a search typed before it is
        // hidden must not go on filtering the list unseen.
        it('hides the search field with a per-device setting, and clears a search typed before', async () => {
            const w = await mountWithList()
            expect(w.findComponent(ListToolbar).props('disableSearch')).toBe(false)
            w.findComponent(ListToolbar).vm.$emit('update:query', 'milk')
            await flushPromises()
            expect(w.findAll('.stub-shopping-line-item').length).toBe(1)

            ;(useUserPreferenceStore().deviceSettings as any).shopping_show_search = false
            await flushPromises()

            expect(w.findComponent(ListToolbar).props('disableSearch')).toBe(true)
            // (a device setting change rebuilds the grouped list from the store, which this test seeded by hand)
            expect((w.vm as any).query).toBe('')
            w.unmount()
        })

        it('shows the search field unless the setting is explicitly off (devices that never had the setting)', async () => {
            const w = await mountWithList()
            ;(useUserPreferenceStore().deviceSettings as any).shopping_show_search = undefined
            await flushPromises()

            expect(w.findComponent(ListToolbar).props('disableSearch')).toBe(false)
            w.unmount()
        })

        it('the Settings tab has a switch for showing the search field', async () => {
            const w = await mountWithList()
            expect(w.text()).toContain('ShowSearchField')
            w.unmount()
        })

        // Information and the shopping lists are collapsible sections (the lists start collapsed), in the order
        // Information, Shopping list, Export.
        it('the Settings tab has collapsible Information and Shopping list sections above Export, the lists collapsed', async () => {
            const w = await mountWithList()
            useShoppingStore().shoppingLists = [{id: 5, name: 'Weekly'}] as any
            await flushPromises()

            const parts = w.findAll('.collapsible-header, [data-test="export-shopping"]')
                .filter(el => el.attributes('data-test') === 'export-shopping' || ['Information', 'Shopping_list'].includes(el.text()))
            expect(parts.map(el => el.attributes('data-test') ?? el.text())).toEqual(['Information', 'Shopping_list', 'export-shopping'])

            expect(parts[0].attributes('aria-expanded')).toBe('true')
            expect(parts[1].attributes('aria-expanded')).toBe('false')
            w.unmount()
        })

        it('the filter and settings panel can be pinned, and the pin is remembered per device', async () => {
            const w = await mountWithList()
            const settings = useUserPreferenceStore().deviceSettings as any
            const drawer = () => w.findComponent(TabbedDrawer)
            expect(drawer().props('pinnable')).not.toBe(false)
            expect(drawer().props('pinned')).toBe(false)

            settings.shopping_settingsPinned = true
            await flushPromises()
            expect(drawer().props('pinned')).toBe(true)

            drawer().vm.$emit('update:pinned', false)
            await flushPromises()
            expect(settings.shopping_settingsPinned).toBe(false)
            w.unmount()
        })

        it('Reset clears the search and the filters', async () => {
            const w = await mountWithList()
            w.findComponent(ListToolbar).vm.$emit('update:query', 'milk')
            ;(w.vm as any).shoppingFilters.setFilter('category', '3')
            await flushPromises()
            expect(w.findComponent(ListToolbar).props('showReset')).toBe(true)

            w.findComponent(ListToolbar).vm.$emit('reset')
            await flushPromises()

            expect(w.findAll('.stub-shopping-line-item').length).toBe(3)
            expect(w.findComponent(ListToolbar).props('showReset')).toBe(false)
            w.unmount()
        })

        it('the meal plan list keeps search but has no filter drawer', async () => {
            const w = await mountWithList({mealPlanId: 42})
            const toolbar = w.findComponent(ListToolbar)

            expect(toolbar.props('disableSearch')).toBe(false)
            expect(toolbar.props('hasFilters')).toBe(false)
            expect(w.findComponent(TabbedDrawer).exists()).toBe(false)
            w.unmount()
        })
    })

    // Batch actions on the selected foods, in the shared SelectionBar. Every action works on all entries of
    // the selected foods.
    describe('batch actions', () => {
        const originalWidth = window.innerWidth
        beforeEach(() => {
            window.innerWidth = 1400
            confirmResult.value = true
            confirmOpen.mockClear()
        })
        afterEach(() => {
            window.innerWidth = originalWidth
        })

        const entryA = {id: 10, amount: 2, food: {id: 1}} as any
        const entryB = {id: 11, amount: 3, food: {id: 1}} as any
        const entryC = {id: 12, amount: 1, food: {id: 2}} as any

        function line(id: number, name: string, entries: any[], inInventory = 'False') {
            return {food: {id, name, inInventory}, entries: new Map(entries.map(e => [e.id, e]))}
        }

        async function selectApplesAndBananas(inventory: {apple?: string, banana?: string} = {}) {
            const w = mountView({})
            await flushPromises()
            ;(w.vm as any).selectEnabled = true
            ;(w.vm as any).selectedLines = [line(1, 'apple', [entryA, entryB], inventory.apple), line(2, 'banana', [entryC], inventory.banana)]
            await flushPromises()
            return w
        }

        const button = (w: any, key: string) => w.findComponent(SelectionBar).find(`[data-test="batch-${key}"]`)

        it('offers delay, double, halve, ignore and bought, disabled until something is selected', async () => {
            const w = mountView({})
            await flushPromises()
            ;(w.vm as any).selectEnabled = true
            await flushPromises()

            for (const key of ['delay', 'double', 'halve', 'ignore', 'bought']) {
                expect(button(w, key).exists()).toBe(true)
                expect(button(w, key).attributes('disabled')).toBeDefined()
            }

            ;(w.vm as any).selectedLines = [line(1, 'apple', [entryA])]
            await flushPromises()
            expect(button(w, 'delay').attributes('disabled')).toBeUndefined()
            w.unmount()
        })

        it('Delay postpones every entry of the selected foods, with undo', async () => {
            const w = await selectApplesAndBananas()
            const spy = vi.spyOn(useShoppingStore(), 'delayEntries').mockImplementation(() => {})

            await button(w, 'delay').trigger('click')

            expect(spy).toHaveBeenCalledWith([entryA, entryB, entryC], true, true)
            expect((w.vm as any).selectedLines).toEqual([])
            w.unmount()
        })

        it('Double and Halve scale every entry of the selected foods, with undo', async () => {
            const w = await selectApplesAndBananas()
            const spy = vi.spyOn(useShoppingStore(), 'scaleEntries').mockResolvedValue([] as any)

            await button(w, 'double').trigger('click')
            expect(spy).toHaveBeenLastCalledWith([entryA, entryB, entryC], 2, true)

            ;(w.vm as any).selectedLines = [line(2, 'banana', [entryC])]
            await flushPromises()
            await button(w, 'halve').trigger('click')
            expect(spy).toHaveBeenLastCalledWith([entryC], 0.5, true)
            w.unmount()
        })

        it('Ignore asks first, then ignores the foods; cancelling changes nothing', async () => {
            const w = await selectApplesAndBananas()
            const spy = vi.spyOn(useShoppingStore(), 'setFoodIgnoredState').mockImplementation(() => {})

            confirmResult.value = false
            await button(w, 'ignore').trigger('click')
            await flushPromises()
            expect(confirmOpen).toHaveBeenCalledTimes(1)
            expect(spy).not.toHaveBeenCalled()

            confirmResult.value = true
            await button(w, 'ignore').trigger('click')
            await flushPromises()
            expect(spy).toHaveBeenCalledWith([entryA, entryB, entryC], true, true)
            w.unmount()
        })

        it('Bought checks the entries off and puts foods that are not in the pantry there in one request', async () => {
            const w = await selectApplesAndBananas({banana: 'True'})
            const check = vi.spyOn(useShoppingStore(), 'setEntriesCheckedState').mockImplementation(() => {})
            ;(apiMock as any).apiInventoryEntryStockUpCreate = vi.fn().mockResolvedValue({})

            await button(w, 'bought').trigger('click')
            await flushPromises()

            expect(check).toHaveBeenCalledWith([entryA, entryB, entryC], true, true)
            expect((apiMock as any).apiInventoryEntryStockUpCreate).toHaveBeenCalledTimes(1)
            expect((apiMock as any).apiInventoryEntryStockUpCreate).toHaveBeenCalledWith({stockUp: {items: [{food: 1, amount: 1}]}})
            w.unmount()
        })

        it('Bought does not call the pantry when every selected food is already in it', async () => {
            const w = await selectApplesAndBananas({apple: 'True', banana: 'True'})
            vi.spyOn(useShoppingStore(), 'setEntriesCheckedState').mockImplementation(() => {})
            ;(apiMock as any).apiInventoryEntryStockUpCreate = vi.fn().mockResolvedValue({})

            await button(w, 'bought').trigger('click')
            await flushPromises()

            expect((apiMock as any).apiInventoryEntryStockUpCreate).not.toHaveBeenCalled()
            w.unmount()
        })

        it('the shopping list chip adds the chosen lists to the selection and can create a new list', async () => {
            const w = await selectApplesAndBananas()
            const spy = vi.spyOn(useShoppingStore(), 'addEntriesToShoppingLists').mockResolvedValue(undefined as any)
            ;(w.vm as any).selectedShoppingLists = [{id: 5, name: 'Party'}]

            const chip = w.findComponent(SelectionBar).findComponent('.stub-shopping-list-select-chip')
            expect(chip.attributes('hide-create')).toBeUndefined()
            ;(chip as any).vm.$emit('update')
            await flushPromises()

            expect(spy).toHaveBeenCalledWith([entryA, entryB, entryC], [{id: 5, name: 'Party'}], true)
            w.unmount()
        })

        it('the category chip changes the category of the selection, with undo', async () => {
            const w = await selectApplesAndBananas()
            const spy = vi.spyOn(useShoppingStore(), 'updateCategories').mockImplementation(() => {})
            const selection = (w.vm as any).selectedLines

            const chip = w.findComponent(SelectionBar).findComponent('.stub-category-select-chip')
            ;(chip as any).vm.$emit('update', {id: 3, name: 'Baking'})
            await flushPromises()

            expect(spy).toHaveBeenCalledWith(selection, {id: 3, name: 'Baking'}, true)
            w.unmount()
        })

        // Checking off and adding to the pantry are two separate things in the history; the pantry one is a note
        // that cannot be undone, so nothing is announced with a toast.
        it('Bought adds a separate "added to pantry" note to the history and shows the foods as in the pantry', async () => {
            const w = await selectApplesAndBananas({banana: 'True'})
            vi.spyOn(useShoppingStore(), 'setEntriesCheckedState').mockImplementation(() => {})
            ;(apiMock as any).apiInventoryEntryStockUpCreate = vi.fn().mockResolvedValue({})
            const toast = vi.spyOn(useMessageStore(), 'addPreparedMessage')

            await button(w, 'bought').trigger('click')
            await flushPromises()

            const note = useShoppingStore().undoStack.at(-1)!
            expect(note.type).toBe('PANTRY_ADD')
            expect(note.count).toBe(1)
            expect(toast).not.toHaveBeenCalled()
            expect(entryA.food.inInventory).toBe('True')
            w.unmount()
        })

        it('Bought leaves no pantry note when every selected food was already in the pantry', async () => {
            const w = await selectApplesAndBananas({apple: 'True', banana: 'True'})
            vi.spyOn(useShoppingStore(), 'setEntriesCheckedState').mockImplementation(() => {})
            ;(apiMock as any).apiInventoryEntryStockUpCreate = vi.fn().mockResolvedValue({})

            await button(w, 'bought').trigger('click')
            await flushPromises()

            expect(useShoppingStore().undoStack.some(i => i.type === 'PANTRY_ADD')).toBe(false)
            w.unmount()
        })
    })
})
