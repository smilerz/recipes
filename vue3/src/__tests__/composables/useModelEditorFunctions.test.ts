import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { apiMock, resetApiMock } from '@/__tests__/api-mock'
import { makeFood } from '@/__tests__/factories'
import type { Food } from '@/openapi'

vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    ApiApi: class { constructor() { return apiMock } },
    ResponseError: class extends Error {
        response: any
        constructor(r: any) { super('ResponseError'); this.response = r }
    },
}))

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
    createI18n: vi.fn(() => ({ install: vi.fn() })),
}))

vi.mock('vuetify', () => ({
    useTheme: () => ({ change: vi.fn() }),
    createVuetify: vi.fn(() => ({ install: vi.fn() })),
}))

vi.mock('vue-router', () => ({
    useRouter: () => ({ push: vi.fn().mockResolvedValue(undefined) }),
}))

vi.mock('@vueuse/router', () => ({
    useRouteQuery: () => ({ value: false }),
}))

vi.mock('@vueuse/core', async () => {
    const { ref } = await import('vue')
    return {
        useStorage: (_key: string, defaultValue: any) => ref(defaultValue),
        useTitle: () => ref(''),
    }
})

import { useModelEditorFunctions } from '@/composables/useModelEditorFunctions'

function mountWithComposable() {
    let composableResult: ReturnType<typeof useModelEditorFunctions<Food>>

    const emit = vi.fn()

    const Wrapper = defineComponent({
        setup() {
            composableResult = useModelEditorFunctions<Food>('Food', emit)
            return {}
        },
        template: '<div/>',
    })

    const pinia = createPinia()
    const wrapper = mount(Wrapper, {
        global: { plugins: [pinia] },
    })

    return { composable: composableResult!, emit, wrapper }
}

describe('useModelEditorFunctions', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        resetApiMock()
        apiMock.apiFoodRetrieve = vi.fn()
        apiMock.apiFoodUpdate = vi.fn()
        apiMock.apiFoodCreate = vi.fn()
        apiMock.apiFoodDestroy = vi.fn()
    })

    describe('setupState with direct item', () => {
        it('sets editingObj from provided item', async () => {
            const { composable } = mountWithComposable()
            const food = makeFood({ name: 'Butter' })

            await composable.setupState(food, undefined)

            expect(composable.editingObj.value.name).toBe('Butter')
            expect(composable.loading.value).toBe(false)
        })

        it('sets editingObjChanged to false after setup', async () => {
            const { composable } = mountWithComposable()

            await composable.setupState(makeFood(), undefined)

            expect(composable.editingObjChanged.value).toBe(false)
        })
    })

    describe('setupState with new item', () => {
        it('applies item defaults when no item or id given', async () => {
            const { composable } = mountWithComposable()

            await composable.setupState(null, undefined, {
                itemDefaults: { name: 'Default' } as Food,
            })

            expect(composable.editingObj.value.name).toBe('Default')
        })
    })

    describe('setupState with itemId', () => {
        it('fetches item from API', async () => {
            const food = makeFood({ id: 5, name: 'Cheese' })
            apiMock.apiFoodRetrieve.mockResolvedValue(food)

            const { composable } = mountWithComposable()

            await composable.setupState(null, 5)

            expect(composable.editingObj.value.name).toBe('Cheese')
            expect(composable.loading.value).toBe(false)
        })

        it('applies item defaults on a 404 (missing id) instead of leaving editingObj empty', async () => {
            const { ResponseError } = await import('@/openapi')
            apiMock.apiFoodRetrieve.mockRejectedValue(new (ResponseError as any)({ status: 404 }))

            const { composable } = mountWithComposable()

            await composable.setupState(null, 999, {
                itemDefaults: { name: 'Default' } as Food,
            })

            expect(composable.editingObj.value.name).toBe('Default')
            expect(composable.loading.value).toBe(false)
        })
    })

    describe('isUpdate', () => {
        it('returns true for existing items', async () => {
            const { composable } = mountWithComposable()
            await composable.setupState(makeFood({ id: 1 }), undefined)

            expect(composable.isUpdate()).toBe(true)
        })

        it('returns false for new items', async () => {
            const { composable } = mountWithComposable()
            await composable.setupState(null, undefined)

            expect(composable.isUpdate()).toBe(false)
        })
    })

    describe('saveObject', () => {
        it('calls update for existing objects and emits save', async () => {
            const updated = makeFood({ id: 1, name: 'Updated' })
            apiMock.apiFoodUpdate.mockResolvedValue(updated)

            const { composable, emit } = mountWithComposable()
            await composable.setupState(makeFood({ id: 1 }), undefined)

            await composable.saveObject()

            expect(emit).toHaveBeenCalledWith('save', updated)
        })

        it('calls create for new objects and emits create', async () => {
            const created = makeFood({ id: 99 })
            apiMock.apiFoodCreate.mockResolvedValue(created)

            const { composable, emit } = mountWithComposable()
            await composable.setupState(null, undefined)

            await composable.saveObject()

            expect(emit).toHaveBeenCalledWith('create', created)
        })
    })

    describe('page-leave warning cleanup', () => {
        // feat-list-food-tc69: a double-click on the "+" create button opens then
        // immediately re-closes the dialog (see ModelListCreateButton's own fix),
        // but the editor's onMounted() unconditionally sets window.onbeforeunload
        // with no corresponding teardown. Once the editor unmounts, that handler
        // (closed over the now-destroyed instance's editingObjChanged ref) is
        // orphaned - the next hard navigation gets an unexplained "leave site?"
        // prompt even though no editing UI is on screen anymore.
        it('clears window.onbeforeunload when the editor unmounts', () => {
            const { wrapper } = mountWithComposable()
            expect(typeof window.onbeforeunload).toBe('function')

            wrapper.unmount()

            expect(window.onbeforeunload).toBeNull()
        })

        // A nested editor (e.g. a create dialog opened from inside another editor's page)
        // mounting on top of an outer editor overwrites window.onbeforeunload with its own
        // handler. Unmounting the nested editor must restore the OUTER editor's still-active
        // handler, not unconditionally null it out - the outer editor is still mounted and may
        // still have unsaved changes.
        it('restores the outer editor\'s warning when a nested editor unmounts, instead of clobbering it', () => {
            const outer = mountWithComposable()
            const outerHandler = window.onbeforeunload
            expect(typeof outerHandler).toBe('function')

            const inner = mountWithComposable()
            expect(window.onbeforeunload).not.toBe(outerHandler)

            inner.wrapper.unmount()
            expect(window.onbeforeunload).toBe(outerHandler)

            outer.wrapper.unmount()
            expect(window.onbeforeunload).toBeNull()
        })
    })

    describe('deleteObject', () => {
        it('calls destroy and emits delete', async () => {
            apiMock.apiFoodDestroy.mockResolvedValue(undefined)

            const { composable, emit } = mountWithComposable()
            await composable.setupState(makeFood({ id: 1 }), undefined)

            await composable.deleteObject()

            expect(emit).toHaveBeenCalledWith('delete', expect.any(Object))
        })
    })
})
