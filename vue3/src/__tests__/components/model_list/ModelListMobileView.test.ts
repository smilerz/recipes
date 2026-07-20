import {describe, it, expect, vi, beforeEach} from 'vitest'
import {mount} from '@vue/test-utils'
import {createPinia, setActivePinia} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'
import {computed, ref} from 'vue'

vi.mock('vue-router', () => ({
    useRoute: () => ({query: {}}),
    useRouter: () => ({push: vi.fn()}),
}))

import ModelListMobileView from '@/components/model_list/ModelListMobileView.vue'
import {MODEL_LIST_SETTINGS_KEY} from '@/composables/modellist/useModelListSettings'
import type {ModelItem} from '@/composables/modellist/types'

function mountView(props: Partial<Parameters<typeof mount>[1]>['props'] = {}) {
    const settings = {
        quickActionKeys: computed(() => []),
        mobileSubtitleKeys: computed(() => []),
        swipeEnabled: ref(false),
        swipeLeftKeys: computed(() => []),
        swipeRightKeys: computed(() => []),
        showMobileHeaders: ref(false),
        swipeHintDismissed: ref(false),
    } as any
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})
    return mount(ModelListMobileView, {
        props: {
            items: [],
            itemsLength: 0,
            loading: false,
            page: 1,
            itemsPerPage: 10,
            selectMode: false,
            selectedItems: [],
            allColumns: [],
            actionDefs: [],
            groupedActionDefs: new Map(),
            getToggleState: () => false,
            treeActive: false,
            treeSuspended: false,
            expandedIds: new Set<number>(),
            loadingIds: new Set<number>(),
            toggleExpand: vi.fn(),
            settingsKey: 'food',
            labelField: 'name',
            ...(props as any),
        },
        global: {
            plugins: [createPinia(), i18n, vuetify],
            provide: {[MODEL_LIST_SETTINGS_KEY as unknown as string]: settings},
            stubs: {ActionMenu: {template: '<div class="stub-action-menu"/>'}},
        },
    })
}

describe('ModelListMobileView', () => {
    beforeEach(() => setActivePinia(createPinia()))

    it('mounts without error with empty items', () => {
        const w = mountView()
        expect(w.exists()).toBe(true)
    })

    it('renders a v-list when items are provided', () => {
        const items: ModelItem[] = [
            {id: 1, name: 'Alpha'} as any,
            {id: 2, name: 'Beta'} as any,
        ]
        const w = mountView({items, itemsLength: 2})
        expect(w.find('.v-list').exists()).toBe(true)
    })

    it('renders the item name when labelField matches', () => {
        const items: ModelItem[] = [{id: 1, name: 'Butter'} as any]
        const w = mountView({items, itemsLength: 1})
        expect(w.text()).toContain('Butter')
    })

    it('shows a progress bar when loading=true', () => {
        const w = mountView({loading: true})
        expect(w.find('.v-progress-linear').exists()).toBe(true)
    })

    it('swipeHintDismissed comes from injected settings, not localStorage', () => {
        // Settings provides swipeHintDismissed as a reactive ref — no localStorage access
        const dismissed = ref(true)
        const settings = {
            quickActionKeys: computed(() => []),
            mobileSubtitleKeys: computed(() => []),
            swipeEnabled: ref(false),
            swipeLeftKeys: computed(() => []),
            swipeRightKeys: computed(() => []),
            showMobileHeaders: ref(false),
            swipeHintDismissed: dismissed,
        } as any
        const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
        const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})
        const w = mount(ModelListMobileView, {
            props: {
                items: [], itemsLength: 0, loading: false, page: 1, itemsPerPage: 10,
                selectMode: false, selectedItems: [], allColumns: [], actionDefs: [],
                groupedActionDefs: new Map(), getToggleState: () => false,
                treeActive: false, treeSuspended: false,
                expandedIds: new Set<number>(), loadingIds: new Set<number>(),
                toggleExpand: vi.fn(), settingsKey: 'food', labelField: 'name',
            },
            global: {
                plugins: [createPinia(), i18n, vuetify],
                provide: {[MODEL_LIST_SETTINGS_KEY as unknown as string]: settings},
                stubs: {ActionMenu: {template: '<div/>'}},
            },
        })
        expect(w.exists()).toBe(true)
        // If the component read localStorage directly it would fail on Node 25;
        // reading from injected settings means no localStorage access at all.
    })
})

describe('ModelListMobileView — subtitle filter links', () => {
    beforeEach(() => setActivePinia(createPinia()))

    // vue-router is module-mocked (top of file) without RouterLink, so register a stub
    // that exposes the resolved `to` target for assertion.
    const RouterLinkStub = {
        name: 'RouterLink',
        props: ['to'],
        template: '<a class="rl-stub" :data-to="JSON.stringify(to)"><slot/></a>',
    }
    const numrecipeCol = {key: 'numrecipe', title: 'Recipes', filterLink: {route: 'SearchPage', param: 'foods'}}

    function mountWithSubtitle(item: any) {
        const settings = {
            quickActionKeys: computed(() => []),
            mobileSubtitleKeys: computed(() => ['numrecipe']),
            swipeEnabled: ref(false),
            swipeLeftKeys: computed(() => []),
            swipeRightKeys: computed(() => []),
            showMobileHeaders: ref(false),
            swipeHintDismissed: ref(false),
        } as any
        const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {Recipes: 'Recipes'}}, missingWarn: false, fallbackWarn: false})
        const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})
        return mount(ModelListMobileView, {
            props: {
                items: [item], itemsLength: 1, loading: false, page: 1, itemsPerPage: 10,
                selectMode: false, selectedItems: [], allColumns: [numrecipeCol], actionDefs: [],
                groupedActionDefs: new Map(), getToggleState: () => false,
                treeActive: false, treeSuspended: false,
                expandedIds: new Set<number>(), loadingIds: new Set<number>(),
                toggleExpand: vi.fn(), settingsKey: 'food', labelField: 'name',
            },
            global: {
                plugins: [createPinia(), i18n, vuetify],
                provide: {[MODEL_LIST_SETTINGS_KEY as unknown as string]: settings},
                components: {RouterLink: RouterLinkStub},
                stubs: {ActionMenu: {template: '<div/>'}},
            },
        })
    }

    it('renders the recipe count as a filter link when > 0', () => {
        const w = mountWithSubtitle({id: 42, name: 'Butter', numrecipe: 5})
        const link = w.find('a.rl-stub')
        expect(link.exists()).toBe(true)
        expect(link.text()).toContain('Recipes: 5')
        expect(JSON.parse(link.attributes('data-to')!)).toEqual({name: 'SearchPage', query: {foods: 42}})
    })

    it('renders the recipe count as plain text (no link) when 0', () => {
        const w = mountWithSubtitle({id: 42, name: 'Butter', numrecipe: 0})
        expect(w.find('a.rl-stub').exists()).toBe(false)
        expect(w.text()).toContain('Recipes: 0')
    })
})
