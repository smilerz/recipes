/**
 * Regression coverage for the post-import image-attach flow (C3).
 *
 * useFileApi's updateRecipeImage was removed/renamed to createRecipeImageFromUrl,
 * but RecipeImportPage still destructured and called updateRecipeImage — so
 * every URL/source import threw "updateRecipeImage is not a function" right
 * after creating the recipe, and the image was never attached (and, for the
 * single-import path, navigation never happened).
 */
import {describe, it, expect, vi, beforeEach} from 'vitest'
import {shallowMount, flushPromises} from '@vue/test-utils'
import {createPinia, setActivePinia} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import {createRouter, createMemoryHistory} from 'vue-router'

const {createRecipeImageFromUrlMock, apiRecipeCreateMock} = vi.hoisted(() => ({
    createRecipeImageFromUrlMock: vi.fn(),
    apiRecipeCreateMock: vi.fn(),
}))

vi.mock('@/composables/useFileApi', () => ({
    useFileApi: () => ({
        createRecipeImageFromUrl: createRecipeImageFromUrlMock,
        doAiImport: vi.fn(),
        doAppImport: vi.fn(),
        fileApiLoading: {value: false},
    }),
}))
vi.mock('@/openapi', async (imp) => ({
    ...(await imp<any>()),
    ApiApi: class {
        apiRecipeCreate = apiRecipeCreateMock
        apiAccessTokenList = vi.fn().mockResolvedValue([])
        apiAccessTokenCreate = vi.fn().mockResolvedValue({token: 'bm'})
    },
}))

import RecipeImportPage from '@/pages/RecipeImportPage.vue'

function mountPage() {
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components, directives})
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            {path: '/', name: 'StartPage', component: {template: '<div/>'}},
            {path: '/recipe/view/:id', name: 'RecipeViewPage', component: {template: '<div/>'}},
            {path: '/edit/:model/:id', name: 'ModelEditPage', component: {template: '<div/>'}},
        ],
    })
    const push = vi.spyOn(router, 'push')
    const wrapper = shallowMount(RecipeImportPage, {global: {plugins: [createPinia(), i18n, vuetify, router]}})
    return {wrapper, push}
}

describe('RecipeImportPage — post-import image attach (C3)', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        createRecipeImageFromUrlMock.mockReset().mockResolvedValue({id: 7})
        apiRecipeCreateMock.mockReset().mockResolvedValue({id: 123})
    })

    it('attaches the imported recipe image via createRecipeImageFromUrl', async () => {
        const {wrapper, push} = mountPage()
        ;(wrapper.vm as any).importResponse = {recipe: {keywords: [], imageUrl: 'http://example.com/a.jpg'}}
        ;(wrapper.vm as any).createRecipeFromImport()
        await flushPromises()

        expect(createRecipeImageFromUrlMock).toHaveBeenCalledWith(123, 'http://example.com/a.jpg')
        expect(push).toHaveBeenCalledWith(expect.objectContaining({name: 'RecipeViewPage'}))
    })

    it('navigates without attaching an image when the import has no imageUrl', async () => {
        const {wrapper, push} = mountPage()
        ;(wrapper.vm as any).importResponse = {recipe: {keywords: []}}
        ;(wrapper.vm as any).createRecipeFromImport()
        await flushPromises()

        expect(createRecipeImageFromUrlMock).not.toHaveBeenCalled()
        expect(push).toHaveBeenCalledWith(expect.objectContaining({name: 'RecipeViewPage'}))
    })
})
