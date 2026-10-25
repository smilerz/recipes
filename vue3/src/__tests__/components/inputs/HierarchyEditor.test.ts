/**
 * Regression coverage for HierarchyEditor.
 *
 * Smoke test: mounts with a valid model + editingObj v-model, stubs
 * the three Hierarchy child components so we're testing the editor's
 * top-level wiring (useHierarchyTree integration, generic model lookup)
 * rather than rendering a full tree.
 */
import {describe, it, expect, vi, beforeEach} from 'vitest'
import {flushPromises, mount} from '@vue/test-utils'
import {createPinia, setActivePinia} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'
import {ref} from 'vue'

import {apiMock, resetApiMock} from '@/__tests__/api-mock'

// HierarchyEditor → HelpView → @/i18n.ts → virtual:locale-coverage,
// which is provided by a Vite plugin not loaded in the vitest env. Short-
// circuit by mocking @/i18n so the virtual module is never reached.
vi.mock('@/i18n', () => ({
    SUPPORT_LOCALES: [{code: 'en', label: 'English'}],
    resolveLocale: (c: string) => c,
    localeCoverage: {en: 100},
    LOCALE_MIN_COVERAGE: 0,
}))

// jsdom is narrower than Vuetify's mobile breakpoint, which would render the bottom sheet
// instead of the desktop tree + side drawer these tests drive.
vi.mock('vuetify', async (imp) => ({...(await imp<any>()), useDisplay: () => ({mobile: ref(false)})}))

vi.mock('vue-router', () => ({
    useRoute: () => ({query: {}}),
    useRouter: () => ({push: vi.fn()}),
}))
vi.mock('@vueuse/core', async (imp) => ({...(await imp<any>()), useStorage: (_k: string, d: any) => ref(d)}))
vi.mock('@vueuse/router', () => ({useRouteQuery: (_k: string, d: any) => ref(d)}))
vi.mock('@/openapi', async (imp) => ({...(await imp<any>()), ApiApi: class { constructor() { return apiMock } }}))
vi.mock('@/stores/MessageStore', () => ({
    useMessageStore: () => ({addError: vi.fn(), addPreparedMessage: vi.fn()}),
    ErrorMessageType: {FETCH_ERROR: 'FETCH_ERROR', UPDATE_ERROR: 'UPDATE_ERROR', CREATE_ERROR: 'CREATE_ERROR', DELETE_ERROR: 'DELETE_ERROR'},
    PreparedMessage: {UPDATE_SUCCESS: 'UPDATE_SUCCESS', MOVE_SUCCESS: 'MOVE_SUCCESS'},
}))

import HierarchyEditor from '@/components/inputs/HierarchyEditor.vue'

function mountEditor() {
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})
    return mount(HierarchyEditor, {
        props: {
            model: 'Food' as any,
            modelValue: {id: 1, name: 'Butter'} as any,
        } as any,
        global: {
            plugins: [createPinia(), i18n, vuetify],
            stubs: {
                // The real drawer needs a v-layout ancestor, which this isolated mount doesn't have.
                VNavigationDrawer: {template: '<div class="stub-drawer"><slot/></div>'},
                HierarchyTree: {name: 'HierarchyTree', emits: ['select'], template: '<div class="stub-tree"/>'},
                HierarchyDrillDown: {template: '<div class="stub-drilldown"/>'},
                HierarchyControls: {template: '<div class="stub-controls"/>'},
                HierarchyMovePrompt: {name: 'HierarchyMovePrompt', props: ['movingItem', 'targetItem', 'operating'], emits: ['move', 'makeRoot', 'manage'], template: '<div class="stub-move-prompt"/>'},
            },
        },
    })
}

describe('HierarchyEditor', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        resetApiMock()
        apiMock.apiFoodList = vi.fn().mockResolvedValue({results: [], count: 0})
        apiMock.apiFoodRetrieve.mockResolvedValue({id: 1, name: 'Butter'})
    })

    it('mounts without error', () => {
        const w = mountEditor()
        expect(w.exists()).toBe(true)
    })

    it('renders at least one of the hierarchy child stubs', () => {
        const w = mountEditor()
        const hasStub = w.find('.stub-tree').exists()
            || w.find('.stub-drilldown').exists()
            || w.find('.stub-controls').exists()
        expect(hasStub).toBe(true)
    })

    // Move opens this tab for the item being moved (id 1, Butter). Clicking the destination row
    // used to open controls for the CLICKED row, so saving a parent re-parented the destination.
    describe('moving the item being edited', () => {
        const dairy = {id: 5, name: 'Dairy', parent: null}

        async function clickRow(w: ReturnType<typeof mountEditor>, item: any) {
            w.findComponent({name: 'HierarchyTree'}).vm.$emit('select', {id: item.id, name: item.name, data: item})
            await flushPromises()
        }

        beforeEach(() => {
            apiMock.apiFoodMoveUpdate = vi.fn().mockResolvedValue({id: 1, name: 'Butter'})
        })

        it('offers to move the edited item under the clicked row instead of managing the clicked row', async () => {
            const w = mountEditor()
            await clickRow(w, dairy)

            expect(w.find('.stub-move-prompt').exists()).toBe(true)
            expect(w.find('.stub-controls').exists()).toBe(false)
        })

        it('moves the edited item, not the clicked row, when the move is confirmed', async () => {
            const w = mountEditor()
            await clickRow(w, dairy)

            w.findComponent({name: 'HierarchyMovePrompt'}).vm.$emit('move')
            await flushPromises()

            expect(apiMock.apiFoodMoveUpdate).toHaveBeenCalledTimes(1)
            expect(apiMock.apiFoodMoveUpdate.mock.calls[0][0]).toMatchObject({id: 1, parent: 5})
        })

        // The move is already saved server-side, so touching the edited object would flag the
        // editor "unsaved" and arm the leave-page confirmation for a change that is persisted.
        it('does not flag the edited object as changed after a successful move', async () => {
            const w = mountEditor()
            await clickRow(w, dairy)

            w.findComponent({name: 'HierarchyMovePrompt'}).vm.$emit('move')
            await flushPromises()

            expect(apiMock.apiFoodMoveUpdate).toHaveBeenCalledTimes(1)
            expect(w.emitted('update:modelValue')).toBeUndefined()
        })

        it('offers the next move from the parent the first move put the item under', async () => {
            const w = mountEditor()
            await clickRow(w, dairy)
            w.findComponent({name: 'HierarchyMovePrompt'}).vm.$emit('move')
            await flushPromises()

            await clickRow(w, {id: 7, name: 'Cheese', parent: null})

            expect(w.findComponent({name: 'HierarchyMovePrompt'}).props('movingItem')).toMatchObject({id: 1, parent: 5})
        })

        it('removes the edited item\'s parent when "make root" is chosen', async () => {
            const w = mountEditor()
            await clickRow(w, dairy)

            w.findComponent({name: 'HierarchyMovePrompt'}).vm.$emit('makeRoot')
            await flushPromises()

            expect(apiMock.apiFoodMoveUpdate.mock.calls[0][0]).toMatchObject({id: 1, parent: 0})
        })

        it('shows the controls for the clicked row after choosing to manage it instead', async () => {
            const w = mountEditor()
            await clickRow(w, dairy)

            w.findComponent({name: 'HierarchyMovePrompt'}).vm.$emit('manage')
            await flushPromises()

            expect(w.find('.stub-controls').exists()).toBe(true)
            expect(w.find('.stub-move-prompt').exists()).toBe(false)
        })

        it('keeps the manage controls when the clicked row is the edited item itself', async () => {
            const w = mountEditor()
            await clickRow(w, {id: 1, name: 'Butter', parent: null})

            expect(w.find('.stub-controls').exists()).toBe(true)
            expect(w.find('.stub-move-prompt').exists()).toBe(false)
        })
    })
})
