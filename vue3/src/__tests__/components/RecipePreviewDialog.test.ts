import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createVuetify } from 'vuetify'
import { makeRecipeOverview } from '../factories'

import RecipePreviewDialog from '@/components/dialogs/RecipePreviewDialog.vue'

function mountDialog(modelValue = true) {
    return mount(RecipePreviewDialog, {
        props: { recipe: makeRecipeOverview({ id: 42, name: 'Lemon Chicken' }), modelValue },
        global: {
            plugins: [createPinia(), createI18n({ legacy: false, locale: 'en', messages: { en: { Preview: 'Preview' } }, missingWarn: false, fallbackWarn: false }), createVuetify()],
            stubs: {
                VDialog: { props: ['modelValue'], emits: ['update:modelValue'], template: '<div class="stub-dialog" :data-open="modelValue"><slot/></div>' },
                VClosableCardTitle: { name: 'VClosableCardTitle', props: ['title', 'modelValue'], emits: ['update:modelValue'], template: '<div class="stub-title">{{ title }}</div>' },
                BookEntryCard: { name: 'BookEntryCard', props: ['recipeOverview'], template: '<div class="stub-book-entry-card"/>' },
            },
        },
    })
}

describe('RecipePreviewDialog', () => {
    it('titles the dialog "Preview", the recipe name is on the card inside', () => {
        expect(mountDialog().find('.stub-title').text()).toBe('Preview')
    })

    it('shows the recipe in the book card', () => {
        const card = mountDialog().findComponent({ name: 'BookEntryCard' })
        expect(card.exists()).toBe(true)
        expect(card.props('recipeOverview')).toMatchObject({ id: 42 })
    })

    it('is open or closed as the model says', async () => {
        const w = mountDialog(true)
        expect(w.find('.stub-dialog').attributes('data-open')).toBe('true')
        await w.setProps({ modelValue: false })
        expect(w.find('.stub-dialog').attributes('data-open')).toBe('false')
    })

    it('reports that it was closed from the title bar', async () => {
        const w = mountDialog()
        w.findComponent({ name: 'VClosableCardTitle' }).vm.$emit('update:modelValue', false)
        expect(w.emitted('update:modelValue')).toEqual([[false]])
    })
})
