import {describe, it, expect} from 'vitest'
import {mount} from '@vue/test-utils'
import {createVuetify} from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import {createI18n} from 'vue-i18n'
import HierarchyMovePrompt from '@/components/hierarchy/HierarchyMovePrompt.vue'

function mountPrompt(moving: any = {id: 1, name: 'Butter', parent: 2}, target: any = {id: 5, name: 'Dairy'}, operating = false) {
    const vuetify = createVuetify({components, directives})
    const i18n = createI18n({
        legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false,
        messages: {en: {hierarchy_move_under: 'Move {item} under {target}', hierarchy_already_under: '{item} is already under {target}'}},
    })
    return mount(HierarchyMovePrompt, {
        props: {movingItem: moving, targetItem: target, operating},
        global: {plugins: [vuetify, i18n]},
    })
}

describe('HierarchyMovePrompt', () => {
    it('names the item being moved and the row it would move under', () => {
        const w = mountPrompt()
        expect(w.get('[data-testid="move-prompt-text"]').text()).toBe('Move Butter under Dairy')
    })

    it('emits move, makeRoot and manage from their buttons', async () => {
        const w = mountPrompt()
        await w.get('[data-testid="move-here-btn"]').trigger('click')
        await w.get('[data-testid="make-root-btn"]').trigger('click')
        await w.get('[data-testid="manage-instead-btn"]').trigger('click')
        expect(w.emitted('move')).toHaveLength(1)
        expect(w.emitted('makeRoot')).toHaveLength(1)
        expect(w.emitted('manage')).toHaveLength(1)
    })

    it('disables the move when the item is already under the clicked row', () => {
        const w = mountPrompt({id: 1, name: 'Butter', parent: 5}, {id: 5, name: 'Dairy'})
        expect(w.get('[data-testid="move-prompt-text"]').text()).toBe('Butter is already under Dairy')
        expect(w.get('[data-testid="move-here-btn"]').attributes('disabled')).toBeDefined()
    })

    it('disables make-root when the item has no parent to remove', () => {
        const w = mountPrompt({id: 1, name: 'Butter', parent: null})
        expect(w.get('[data-testid="make-root-btn"]').attributes('disabled')).toBeDefined()
    })

    it('disables the actions while an operation is in flight', () => {
        const w = mountPrompt(undefined, undefined, true)
        expect(w.get('[data-testid="move-here-btn"]').attributes('disabled')).toBeDefined()
        expect(w.get('[data-testid="make-root-btn"]').attributes('disabled')).toBeDefined()
    })
})
