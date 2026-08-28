import {describe, it, expect, vi, beforeEach} from 'vitest'
import {shallowMount} from '@vue/test-utils'
import {createPinia, setActivePinia} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

// useMessageStore lazily creates its store on first use, and the real store's setup calls
// useI18n() - fine when first triggered from a component's own setup/render, but this test
// invokes the page method directly (bypassing Vue's instance context), so the real store
// must be mocked out rather than lazily constructed mid-test.
const {addMessageMock} = vi.hoisted(() => ({addMessageMock: vi.fn()}))
vi.mock('@/stores/MessageStore', async (imp) => ({
    ...(await imp<any>()),
    useMessageStore: () => ({addMessage: addMessageMock, addError: vi.fn(), addPreparedMessage: vi.fn()}),
}))

import RecipeBookEditor from '@/components/model_editors/RecipeBookEditor.vue'

function mountEditor() {
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components, directives})
    return shallowMount(RecipeBookEditor, {
        global: {plugins: [createPinia(), i18n, vuetify]},
    })
}

describe('RecipeBookEditor duplicate-recipe warning (script used $t, undefined outside templates)', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        addMessageMock.mockReset()
    })

    it('addRecipeToBook does not throw and warns when the selected recipe is already in the book', () => {
        const wrapper = mountEditor()
        ;(wrapper.vm as any).recipeBookEntries = [{id: 1, book: 1, recipe: 5}]
        ;(wrapper.vm as any).selectedRecipe = {id: 5, name: 'Duplicate Recipe'}

        expect(() => (wrapper.vm as any).addRecipeToBook()).not.toThrow()
        expect(addMessageMock).toHaveBeenCalled()
    })
})
