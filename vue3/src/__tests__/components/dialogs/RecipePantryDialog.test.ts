/**
 * RecipePantryDialog (FR-I4 "Pantry for this recipe").
 * Reads have/missing straight off the recipe payload's nested foods; missing
 * ingredients get a one-tap "→ list" that routes through addToShopping.
 */
import {describe, it, expect, vi, beforeEach} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {createPinia, setActivePinia} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'

const {addToShoppingMock, addErrorMock} = vi.hoisted(() => ({
    addToShoppingMock: vi.fn().mockResolvedValue(undefined),
    addErrorMock: vi.fn(),
}))
vi.mock('@/composables/useShoppingActions', () => ({useShoppingActions: () => ({addToShopping: addToShoppingMock})}))
vi.mock('@/stores/MessageStore', async (imp) => ({...(await imp<any>()), useMessageStore: () => ({addError: addErrorMock})}))

import RecipePantryDialog from '@/components/dialogs/RecipePantryDialog.vue'

const RECIPE = {
    id: 5, name: 'Pancakes',
    steps: [{ingredients: [
        {amount: 2, unit: {name: 'cup'}, food: {id: 1, name: 'Flour', inInventory: 'True'}},   // have
        {amount: 1, unit: null, food: {id: 2, name: 'Egg', inInventory: 'False'}},              // missing
    ]}],
}

function mountDialog() {
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})
    return mount(RecipePantryDialog, {
        attachTo: document.body,
        global: {
            plugins: [createPinia(), i18n, vuetify],
            stubs: {VClosableCardTitle: {template: '<div class="title-stub" />'}},
        },
    })
}

describe('RecipePantryDialog', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        addToShoppingMock.mockClear()
        addErrorMock.mockClear()
        document.body.innerHTML = ''
    })

    it('RP-01: builds a row per recipe ingredient with have/missing state', async () => {
        const wrapper = mountDialog()
        ;(wrapper.vm as any).open(RECIPE)
        await flushPromises()

        const rows = (wrapper.vm as any).rows
        expect(rows).toHaveLength(2)
        expect(rows[0]).toMatchObject({inPantry: true})
        expect(rows[1]).toMatchObject({inPantry: false})
    })

    it('RP-02: only a missing row shows an add-to-list button', async () => {
        const wrapper = mountDialog()
        ;(wrapper.vm as any).open(RECIPE)
        await flushPromises()
        expect(document.querySelectorAll('[data-test="add-missing-btn"]')).toHaveLength(1)
    })

    it('RP-03: adding a missing ingredient routes through addToShopping and marks it added', async () => {
        const wrapper = mountDialog()
        ;(wrapper.vm as any).open(RECIPE)
        await flushPromises()

        ;(document.querySelector('[data-test="add-missing-btn"]') as HTMLElement).click()
        await flushPromises()

        expect(addToShoppingMock).toHaveBeenCalledTimes(1)
        expect(addToShoppingMock.mock.calls[0][0]).toMatchObject({id: 2, name: 'Egg'})
        expect((wrapper.vm as any).rows[1].added).toBe(true)
    })

    it('RP-04: adding a food used in two steps marks every row of that food added (no double-add)', async () => {
        const twoStep = {
            id: 6, name: 'Cake',
            steps: [
                {ingredients: [{amount: 2, unit: {name: 'cup'}, food: {id: 9, name: 'Flour', inInventory: 'False'}}]},
                {ingredients: [{amount: 1, unit: {name: 'cup'}, food: {id: 9, name: 'Flour', inInventory: 'False'}}]},
            ],
        }
        const wrapper = mountDialog()
        ;(wrapper.vm as any).open(twoStep)
        await flushPromises()

        const btns = document.querySelectorAll('[data-test="add-missing-btn"]')
        expect(btns).toHaveLength(2)  // per-line display
        ;(btns[0] as HTMLElement).click()
        await flushPromises()

        // both rows for food 9 flip to added; a second add is impossible
        expect((wrapper.vm as any).rows.every((r: any) => r.added)).toBe(true)
        expect(document.querySelectorAll('[data-test="add-missing-btn"]')).toHaveLength(0)
        expect(addToShoppingMock).toHaveBeenCalledTimes(1)
    })
})
