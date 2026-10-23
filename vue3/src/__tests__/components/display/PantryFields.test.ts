import {describe, it, expect, afterEach} from 'vitest'
import {createVuetify} from 'vuetify'
import {mountPage} from '@/__tests__/pages/page-mount-helper'

import PantryFields from '@/components/display/PantryFields.vue'

const STUBS = {
    ModelSelect: {name: 'ModelSelect', props: ['modelValue', 'model'], emits: ['update:modelValue'], template: '<div class="stub-model-select"/>'},
}

describe('PantryFields — Food, Location and Add on one line', () => {
    const originalWidth = window.innerWidth
    afterEach(() => {
        window.innerWidth = originalWidth
    })

    function mountFields(props: Record<string, any> = {}, width = 1400) {
        window.innerWidth = width
        // a Vuetify instance created at this width, so the phone/desktop switch follows it
        return mountPage(PantryFields, {props: {foodId: null, ...props}, global: {stubs: STUBS, plugins: [createVuetify()]}})
    }
    const selects = (w: any) => w.findAllComponents({name: 'ModelSelect'})

    it('has the Food picker and the Location picker, in that order', () => {
        expect(selects(mountFields()).map((s: any) => s.props('model'))).toEqual(['Food', 'InventoryLocation'])
    })

    it('shows the chosen food, and reports a new one', () => {
        const w = mountFields({foodId: 104})

        expect(selects(w)[0].props('modelValue')).toBe(104)
        selects(w)[0].vm.$emit('update:modelValue', 7)
        expect(w.emitted('update:foodId')).toEqual([[7]])
    })

    it('reports a cleared food as null', () => {
        const w = mountFields({foodId: 104})

        selects(w)[0].vm.$emit('update:modelValue', undefined)

        expect(w.emitted('update:foodId')).toEqual([[null]])
    })

    it('shows the chosen location, and reports a new one', () => {
        const location = {id: 3, name: 'Pantry'}
        const w = mountFields({inventoryLocation: location})

        expect(selects(w)[1].props('modelValue')).toEqual(location)
        selects(w)[1].vm.$emit('update:modelValue', {id: 4, name: 'Fridge'})
        expect(w.emitted('update:inventoryLocation')).toEqual([[{id: 4, name: 'Fridge'}]])
    })

    it('ends the line with Add, which tells the page to add', async () => {
        const w = mountFields()
        const add = w.element.lastElementChild as HTMLElement

        expect(add.getAttribute('data-test')).toBe('pantry-add')
        await w.find('[data-test="pantry-add"]').trigger('click')
        expect(w.emitted('add')).toHaveLength(1)
    })

    it('labels Add on desktop', () => {
        expect(mountFields({}, 1400).find('[data-test="pantry-add"]').text()).toContain('Add')
    })

    it('shows Add as an icon on a phone, still labelled for screen readers', () => {
        const add = mountFields({}, 600).find('[data-test="pantry-add"]')

        expect(add.attributes('aria-label')).toBe('Add')
        expect(add.text()).toBe('')
    })
})
