/**
 * #5: "Track as pantry food" checkbox in RecipeEditor's Settings tab. Only tests this specific
 * addition, not the whole (large, otherwise-untested) editor - everything else is stubbed.
 */
import {describe, it, expect, vi, beforeEach} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {createPinia, setActivePinia, type PiniaPlugin} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'

import {apiMock, resetApiMock} from '@/__tests__/api-mock'
import {makeRecipe, makeUserPreference, makeSpace} from '@/__tests__/factories'

vi.mock('@/openapi', async (imp) => ({...(await imp<any>()), ApiApi: class { constructor() { return apiMock } }}))
vi.mock('@vueuse/core', async (imp) => ({...(await imp<any>()), useStorage: (_k: string, d: any) => ({value: d}), useTitle: () => ({value: ''})}))
vi.mock('@vueuse/router', () => ({useRouteQuery: () => ({value: false})}))

import RecipeEditor from '@/components/model_editors/RecipeEditor.vue'

function mountEditor(recipe: any) {
    const prePopulate: PiniaPlugin = ({store}) => {
        if (store.$id === 'user_preference_store') {
            store.userSettings = makeUserPreference() as any
            store.activeSpace = makeSpace() as any
        }
    }
    const pinia = createPinia()
    pinia.use(prePopulate)
    const i18n = createI18n({
        legacy: false, locale: 'en',
        messages: {en: {Miscellaneous: 'Miscellaneous', TrackAsFood: 'Track as pantry food'}},
        missingWarn: false, fallbackWarn: false,
    })
    const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})

    return mount(RecipeEditor, {
        props: {item: recipe},
        global: {
            plugins: [pinia, i18n, vuetify],
            stubs: {
                ModelEditorBase: {template: '<div><slot/></div>'},
                AiActionButton: {template: '<div/>'},
                ClosableHelpAlert: {template: '<div/>'},
                DeleteConfirmDialog: {template: '<div/>'},
                ModelSelect: {template: '<div/>'},
                NumberScalerDialog: {template: '<div/>'},
                PropertiesEditor: {template: '<div/>'},
                RecipeImageEditor: {template: '<div/>'},
                StepEditor: {template: '<div/>'},
                VueDraggable: {template: '<div><slot/></div>'},
            },
        },
    })
}

async function switchToSettingsTab(wrapper: ReturnType<typeof mountEditor>) {
    const tab = wrapper.findAll('.v-tab').find(t => t.text().includes('Miscellaneous'))
    await tab!.trigger('click')
    await flushPromises()
}

describe('RecipeEditor "Track as pantry food" (#5)', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        resetApiMock()
    })

    it('is unchecked when the recipe has no linked food', async () => {
        const wrapper = mountEditor(makeRecipe({id: 1, name: 'Pancakes', food: null}))
        await flushPromises()
        await switchToSettingsTab(wrapper)

        const checkbox = wrapper.find('[data-test="track-as-food-checkbox"] input[type="checkbox"]')
        expect((checkbox.element as HTMLInputElement).checked).toBe(false)
    })

    it('is checked when the recipe already has a linked food', async () => {
        const wrapper = mountEditor(makeRecipe({id: 1, name: 'Pancakes', food: {id: 9, name: 'Pancakes'}}))
        await flushPromises()
        await switchToSettingsTab(wrapper)

        const checkbox = wrapper.find('[data-test="track-as-food-checkbox"] input[type="checkbox"]')
        expect((checkbox.element as HTMLInputElement).checked).toBe(true)
    })

    it('checking it creates a Food named after the recipe, linked by id', async () => {
        apiMock.apiFoodCreate.mockResolvedValue({id: 9, name: 'Pancakes'})
        apiMock.apiRecipeRetrieve.mockResolvedValue(makeRecipe({id: 1, name: 'Pancakes', food: {id: 9, name: 'Pancakes'}}))
        const wrapper = mountEditor(makeRecipe({id: 1, name: 'Pancakes', food: null}))
        await flushPromises()
        await switchToSettingsTab(wrapper)

        const checkbox = wrapper.find('[data-test="track-as-food-checkbox"] input[type="checkbox"]')
        await checkbox.setValue(true)
        await flushPromises()

        expect(apiMock.apiFoodCreate).toHaveBeenCalledTimes(1)
        const {food} = apiMock.apiFoodCreate.mock.calls[0][0]
        expect(food.name).toBe('Pancakes')
        expect(food.recipe).toMatchObject({id: 1})
        expect((checkbox.element as HTMLInputElement).checked).toBe(true)
    })

    it('unchecking it unlinks (not deletes) the food', async () => {
        apiMock.apiFoodPartialUpdate.mockResolvedValue({id: 9, name: 'Pancakes', recipe: null})
        apiMock.apiRecipeRetrieve.mockResolvedValue(makeRecipe({id: 1, name: 'Pancakes', food: null}))
        const wrapper = mountEditor(makeRecipe({id: 1, name: 'Pancakes', food: {id: 9, name: 'Pancakes'}}))
        await flushPromises()
        await switchToSettingsTab(wrapper)

        const checkbox = wrapper.find('[data-test="track-as-food-checkbox"] input[type="checkbox"]')
        await checkbox.setValue(false)
        await flushPromises()

        expect(apiMock.apiFoodPartialUpdate).toHaveBeenCalledWith({id: 9, patchedFood: {recipe: null}})
        expect(apiMock.apiFoodDestroy).not.toHaveBeenCalled()
        expect((checkbox.element as HTMLInputElement).checked).toBe(false)
    })

    it('does not mark the recipe as unsaved, since the link change is already persisted', async () => {
        apiMock.apiFoodCreate.mockResolvedValue({id: 9, name: 'Pancakes'})
        apiMock.apiRecipeRetrieve.mockResolvedValue(makeRecipe({id: 1, name: 'Pancakes', food: {id: 9, name: 'Pancakes'}}))
        const wrapper = mountEditor(makeRecipe({id: 1, name: 'Pancakes', food: null}))
        await flushPromises()
        await switchToSettingsTab(wrapper)

        const checkbox = wrapper.find('[data-test="track-as-food-checkbox"] input[type="checkbox"]')
        await checkbox.setValue(true)
        await flushPromises()

        expect(wrapper.emitted('changedState')?.at(-1)).toEqual([false])
    })
})
