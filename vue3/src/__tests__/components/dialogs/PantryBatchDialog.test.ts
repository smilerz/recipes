import {describe, it, expect} from 'vitest'
import {flushPromises} from '@vue/test-utils'
import {mountPage} from '@/__tests__/pages/page-mount-helper'

import PantryBatchDialog from '@/components/dialogs/PantryBatchDialog.vue'

const STUBS = {
    VDialog: {template: '<div><slot/></div>'},
    VClosableCardTitle: {template: '<div class="stub-title"/>'},
    ModelSelect: {name: 'ModelSelect', props: ['modelValue'], emits: ['update:modelValue'], template: '<div class="stub-model-select"/>'},
    VDateInput: {name: 'VDateInput', props: ['modelValue'], emits: ['update:modelValue'], template: '<div class="stub-date-input"/>'},
}

function mountDialog(mode: 'location' | 'expires') {
    return mountPage(PantryBatchDialog, {props: {modelValue: true, mode, count: 3}, global: {stubs: STUBS}})
}

describe('PantryBatchDialog — move location', () => {
    it('asks for a location, not a date', () => {
        const w = mountDialog('location')
        expect(w.find('.stub-model-select').exists()).toBe(true)
        expect(w.find('.stub-date-input').exists()).toBe(false)
    })

    it('cannot confirm until a location is picked', () => {
        const w = mountDialog('location')
        expect(w.find('[data-test="batch-confirm"]').attributes('disabled')).toBeDefined()
    })

    it('confirms with the picked location', async () => {
        const w = mountDialog('location')
        const location = {id: 2, name: 'Fridge'}

        w.findComponent({name: 'ModelSelect'}).vm.$emit('update:modelValue', location)
        await flushPromises()
        await w.find('[data-test="batch-confirm"]').trigger('click')

        expect(w.emitted('confirm')![0]).toEqual([location])
    })
})

describe('PantryBatchDialog — set expiry', () => {
    it('asks for a date, not a location', () => {
        const w = mountDialog('expires')
        expect(w.find('.stub-date-input').exists()).toBe(true)
        expect(w.find('.stub-model-select').exists()).toBe(false)
    })

    it('cannot confirm without a date, so nothing is cleared by accident', () => {
        const w = mountDialog('expires')
        expect(w.find('[data-test="batch-confirm"]').attributes('disabled')).toBeDefined()
    })

    it('confirms with the picked date', async () => {
        const w = mountDialog('expires')
        const date = new Date(2027, 5, 15)

        w.findComponent({name: 'VDateInput'}).vm.$emit('update:modelValue', date)
        await flushPromises()
        await w.find('[data-test="batch-confirm"]').trigger('click')

        expect(w.emitted('confirm')![0]).toEqual([date])
    })

    it('clears the expiry only through its own explicit button', async () => {
        const w = mountDialog('expires')

        await w.find('[data-test="batch-clear"]').trigger('click')

        expect(w.emitted('confirm')![0]).toEqual([null])
    })

    it('has no clear button when moving location', () => {
        const w = mountDialog('location')
        expect(w.find('[data-test="batch-clear"]').exists()).toBe(false)
    })
})
