/**
 * UseUpDialog contract (D4/D5/M3/M4, DEC-2/3/8).
 *
 * Rows are per (food, unit) — the cross-unit summing bug showed "3 gallon"
 * for a gallon + 2 cups. The consumed button zeroes a row in one tap (and
 * restores on re-tap). A food goes back on the shopping list only when ALL
 * its rows end at zero (DEC-8), once.
 */
import {describe, it, expect, vi, beforeEach} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {createPinia, setActivePinia} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'

import {apiMock, resetApiMock} from '@/__tests__/api-mock'

vi.mock('@/openapi', async (imp) => ({...(await imp<any>()), ApiApi: class { constructor() { return apiMock } }}))

const {addMessageMock, addErrorMock, addToShoppingMock} = vi.hoisted(() => ({
    addMessageMock: vi.fn(),
    addErrorMock: vi.fn(),
    addToShoppingMock: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/stores/MessageStore', async (imp) => ({...(await imp<any>()), useMessageStore: () => ({addMessage: addMessageMock, addError: addErrorMock})}))
vi.mock('@/composables/useShoppingActions', () => ({useShoppingActions: () => ({addToShopping: addToShoppingMock})}))

import UseUpDialog from '@/components/dialogs/UseUpDialog.vue'

const GAL = {id: 7, name: 'gallon'}
const CUP = {id: 8, name: 'cup'}
const MILK = {id: 1, name: 'Milk'}
const BUTTER = {id: 2, name: 'Butter'}

function mountDialog() {
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})
    return mount(UseUpDialog, {
        attachTo: document.body,
        global: {
            plugins: [createPinia(), i18n, vuetify],
            stubs: {
                ModelSelect: {template: '<div class="model-select-stub" />'},
                VClosableCardTitle: {template: '<div class="title-stub" />'},
                // pulls in UserPreferenceStore/useStorage (no jsdom backing); not under test
                ClosableHelpAlert: {template: '<div class="help-alert-stub" />'},
            },
        },
    })
}

function clickSave() {
    const btn = [...document.querySelectorAll('.v-btn')]
        .find(b => b.textContent?.includes('Save')) as HTMLElement | undefined
    btn?.click()
}

async function openWith(lots: any[]) {
    apiMock.apiInventoryEntryList.mockResolvedValue({results: lots})
    apiMock.apiCookLogList.mockResolvedValue({results: []})  // default: no recents (floor)
    const wrapper = mountDialog()
    void (wrapper.vm as any).open()
    await flushPromises()
    return wrapper
}

describe('UseUpDialog (food,unit) rows + consumed + DEC-8', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        resetApiMock()
        addMessageMock.mockClear()
        addErrorMock.mockClear()
        addToShoppingMock.mockClear()
        document.body.innerHTML = ''
    })

    it('UU-01: renders one row per (food, unit) — mixed units never sum', async () => {
        const wrapper = await openWith([
            {food: MILK, unit: GAL, amount: 1},
            {food: MILK, unit: CUP, amount: 2},
            {food: BUTTER, unit: null, amount: 1},
        ])
        const rows = (wrapper.vm as any).rows
        expect(rows).toHaveLength(3)
        expect(rows[0]).toMatchObject({amount: 1, original: 1})
        expect(rows[1]).toMatchObject({amount: 2, original: 2})
    })

    it('UU-02: consumed button zeroes the row; tapping again restores the original', async () => {
        const wrapper = await openWith([{food: MILK, unit: GAL, amount: 3}])
        const btn = document.querySelector('[data-test="consumed-btn"]') as HTMLElement
        expect(btn).toBeTruthy()

        btn.click()
        await flushPromises()
        let row = (document.querySelector('[data-test="useup-row"]') as HTMLElement)
        expect(row.textContent).toContain('0')

        btn.click()
        await flushPromises()
        expect((wrapper.vm as any).rows[0].amount).toBe(3)  // exact restore, not just "some text"
    })

    it('UU-06: re-declaring the unit lifts the stepper cap (1 gallon can become 16 cups)', async () => {
        const wrapper = await openWith([{food: MILK, unit: GAL, amount: 1}])
        const stepper = wrapper.findComponent({name: 'VNumberInput'})
        expect(stepper.props('max')).toBe(1)  // original unit: capped at what's in stock

        ;(wrapper.vm as any).rows[0].newUnit = CUP
        await flushPromises()
        // Vuetify normalizes an undefined :max to MAX_SAFE_INTEGER — i.e. effectively unbounded
        expect(stepper.props('max')).toBe(Number.MAX_SAFE_INTEGER)
    })

    it('UU-07: an add-back failure does not undo the committed draw-down (no retry double-decrement)', async () => {
        apiMock.apiInventoryEntryDrawDownCreate.mockResolvedValue({ok: true})
        addToShoppingMock.mockRejectedValueOnce(new Error('shopping down'))
        const wrapper = await openWith([{food: MILK, unit: GAL, amount: 2}])
        ;(wrapper.vm as any).rows[0].amount = 0
        await flushPromises()

        clickSave()
        await flushPromises()

        // the draw-down succeeded: the dialog must close and report success so a retry
        // cannot re-post the reduction; the add-back failure surfaces as its own warning
        expect(apiMock.apiInventoryEntryDrawDownCreate).toHaveBeenCalledTimes(1)
        expect(wrapper.emitted('used')).toBeTruthy()
        expect(addMessageMock).toHaveBeenCalled()
    })

    it('UU-03: save posts unit-scoped items and counts unit-dirty rows as changed', async () => {
        apiMock.apiInventoryEntryDrawDownCreate.mockResolvedValue({ok: true})
        const wrapper = await openWith([{food: MILK, unit: GAL, amount: 2}])

        const rows = (wrapper.vm as any).rows
        rows[0].amount = 1
        rows[0].newUnit = CUP
        await flushPromises()

        clickSave()
        await flushPromises()

        const {items} = apiMock.apiInventoryEntryDrawDownCreate.mock.calls[0][0].drawDown
        expect(items).toEqual([{food: 1, amount: 1, unit: 7, newUnit: 8}])
    })

    it('UU-04: a food fully zeroed across ALL its rows is added to shopping exactly once', async () => {
        apiMock.apiInventoryEntryDrawDownCreate.mockResolvedValue({ok: true})
        const wrapper = await openWith([
            {food: MILK, unit: GAL, amount: 1},
            {food: MILK, unit: CUP, amount: 2},
        ])
        const rows = (wrapper.vm as any).rows
        rows[0].amount = 0
        rows[1].amount = 0
        await flushPromises()

        clickSave()
        await flushPromises()

        expect(addToShoppingMock).toHaveBeenCalledTimes(1)
        expect(addToShoppingMock.mock.calls[0][0]).toMatchObject({id: 1})
    })

    it('UU-05: a partially zeroed food (other unit still in stock) is NOT re-added to shopping', async () => {
        apiMock.apiInventoryEntryDrawDownCreate.mockResolvedValue({ok: true})
        const wrapper = await openWith([
            {food: MILK, unit: GAL, amount: 1},
            {food: MILK, unit: CUP, amount: 2},
        ])
        ;(wrapper.vm as any).rows[0].amount = 0  // gallon gone, cups remain
        await flushPromises()

        clickSave()
        await flushPromises()

        expect(addToShoppingMock).not.toHaveBeenCalled()
    })

    it('UU-08: open({foodIds}) scopes rows to that recipe (no whole-pantry, no CookLog fetch)', async () => {
        apiMock.apiInventoryEntryList.mockResolvedValue({results: [
            {food: MILK, unit: GAL, amount: 1},
            {food: BUTTER, unit: null, amount: 1},
        ]})
        const wrapper = mountDialog()
        void (wrapper.vm as any).open({foodIds: [1], title: 'Use up: Pancakes'})
        await flushPromises()

        const rows = (wrapper.vm as any).rows
        expect(rows).toHaveLength(1)
        expect(rows[0].food.id).toBe(1)
        expect(apiMock.apiCookLogList).not.toHaveBeenCalled()
    })

    it('UU-09: default open groups recently-cooked foods under the recipe; the rest go behind the expander', async () => {
        apiMock.apiInventoryEntryList.mockResolvedValue({results: [
            {food: MILK, unit: GAL, amount: 1},    // used in Pancakes
            {food: BUTTER, unit: null, amount: 1}, // not cooked -> behind the expander
        ]})
        apiMock.apiCookLogList.mockResolvedValue({results: [{recipe: 10, recipeName: 'Pancakes'}]})
        apiMock.apiRecipeRetrieve.mockResolvedValue({id: 10, name: 'Pancakes', steps: [{ingredients: [{food: {id: 1}}]}]})

        const wrapper = mountDialog()
        void (wrapper.vm as any).open()
        await flushPromises()

        expect((wrapper.vm as any).recipeOrder).toEqual(['Pancakes'])
        expect((wrapper.vm as any).rows.find((r: any) => r.food.id === 1).recipe).toBe('Pancakes')
        expect((wrapper.vm as any).rows.find((r: any) => r.food.id === 2).recipe).toBeUndefined()
        const sections = (wrapper.vm as any).sections
        expect(sections.find((s: any) => s.header === 'Pancakes').rows.map((r: any) => r.food.id)).toEqual([1])
        expect(sections.find((s: any) => s.key === 'rest').expandable).toBe(1)  // BUTTER hidden until "show whole pantry"
    })

    it('UU-10: an empty CookLog shows the whole pantry directly (graceful floor)', async () => {
        const wrapper = await openWith([{food: MILK, unit: GAL, amount: 1}, {food: BUTTER, unit: null, amount: 1}])
        expect((wrapper.vm as any).recipeOrder).toHaveLength(0)
        const sections = (wrapper.vm as any).sections
        expect(sections).toHaveLength(1)
        expect(sections[0].key).toBe('all')
        expect(sections[0].rows).toHaveLength(2)
    })

    it('UU-11: recipe-scoped empty state is "none of this recipe\'s ingredients" not "pantry empty"', async () => {
        apiMock.apiInventoryEntryList.mockResolvedValue({results: [{food: MILK, unit: GAL, amount: 1}]})
        const wrapper = mountDialog()
        void (wrapper.vm as any).open({foodIds: [999], title: 'Use up: X'})  // no pantry food matches
        await flushPromises()

        expect((wrapper.vm as any).rows).toHaveLength(0)
        expect((wrapper.vm as any).scoped).toBe(true)
    })

    it('UU-12: sections put the rest behind a collapsed expander, revealed by showAll', async () => {
        apiMock.apiInventoryEntryList.mockResolvedValue({results: [
            {food: MILK, unit: GAL, amount: 1},    // recent
            {food: BUTTER, unit: null, amount: 1}, // rest
        ]})
        apiMock.apiCookLogList.mockResolvedValue({results: [{recipe: 10, recipeName: 'Pancakes'}]})
        apiMock.apiRecipeRetrieve.mockResolvedValue({id: 10, name: 'Pancakes', steps: [{ingredients: [{food: {id: 1}}]}]})

        const wrapper = mountDialog()
        void (wrapper.vm as any).open()
        await flushPromises()

        // two sections: recents (rendered) + rest (collapsed, exposing a count, no rows yet)
        let sections = (wrapper.vm as any).sections
        expect(sections).toHaveLength(2)
        expect(sections[0].rows.map((r: any) => r.food.id)).toEqual([1])
        expect(sections[1].expandable).toBe(1)
        expect(sections[1].rows).toHaveLength(0)

        ;(wrapper.vm as any).showAll = true
        await flushPromises()
        sections = (wrapper.vm as any).sections
        expect(sections[1].expandable).toBe(0)
        expect(sections[1].rows.map((r: any) => r.food.id)).toEqual([2])
    })
})
