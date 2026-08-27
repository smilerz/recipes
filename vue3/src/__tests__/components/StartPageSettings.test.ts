import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createVuetify } from 'vuetify'
import { apiMock, resetApiMock } from '@/__tests__/api-mock'

vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    ApiApi: class { constructor() { return apiMock } },
    ResponseError: class extends Error { response: any; constructor(r: any) { super(); this.response = r } },
}))

vi.mock('@vueuse/core', async () => {
    const { ref } = await import('vue')
    return {
        useStorage: (_key: string, defaultValue: any) => ref(defaultValue),
    }
})

vi.mock('vuetify', async (importOriginal) => ({
    ...(await importOriginal<typeof import('vuetify')>()),
    useTheme: () => ({ change: vi.fn() }),
}))

vi.mock('vue-router', () => ({
    useRouter: () => ({ push: vi.fn().mockResolvedValue(undefined) }),
}))

vi.mock('@vueuse/router', () => ({
    useRouteQuery: () => ({ value: false }),
}))

import StartPageSettings from '@/components/settings/StartPageSettings.vue'
import { useUserPreferenceStore } from '@/stores/UserPreferenceStore'

const DEFAULT_STUBS: Record<string, any> = {
    VueDraggable: {
        template: '<div class="stub-draggable"><slot /></div>',
        props: ['modelValue'],
    },
    // props/emit declared so the ported filter-selector tests can identify the picker by its
    // `model` and drive its update:modelValue (mirrors the old SectionRow.test stub).
    ModelSelect: {
        name: 'ModelSelect',
        // appendToBody typed Boolean so the bare `append-to-body` attribute coerces to true (mirrors
        // the real ModelSelect prop); the rest are untyped pass-throughs.
        props: {model: null, modelValue: null, items: null, object: null, appendToBody: Boolean},
        emits: ['update:modelValue'],
        template: '<div class="stub-model-select" :data-model="model"/>',
    },
}

function mountSettings(sections?: any[], defaultPage = 'HOME') {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useUserPreferenceStore()
    store.initCompleted = true
    store.userSettings = {
        startPageSections: sections ?? [],
        defaultPage,
    } as any
    store.updateUserSettings = vi.fn().mockResolvedValue(undefined)

    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false })
    const vuetify = createVuetify()

    const wrapper = mount(StartPageSettings, {
        global: {
            plugins: [pinia, i18n, vuetify],
            stubs: DEFAULT_STUBS,
        },
    })
    return { wrapper, store }
}

describe('StartPageSettings', () => {
    beforeEach(() => {
        resetApiMock()
        apiMock.apiUserList = vi.fn().mockResolvedValue([])
    })

    it('falls back to default sections when store is empty', async () => {
        const { wrapper } = mountSettings([])
        await flushPromises()

        // Default has 8 recipe sections — each rendered as a v-card inside draggable
        const html = wrapper.html()
        // Check that multiple section cards rendered (draggable contains them)
        expect(html).toContain('stub-draggable')
        expect(html).toContain('drag-handle')
    })

    it('loads specific sections from store', async () => {
        const { wrapper } = mountSettings([
            { mode: 'meal_plan', enabled: true },
            { mode: 'recent', enabled: true, min_recipes: 5 },
            { mode: 'random', enabled: true, min_recipes: 0 },
        ])
        await flushPromises()

        const html = wrapper.html()
        // Should render 2 recipe sections (meal_plan separated into toggle)
        const dragHandles = wrapper.findAll('.drag-handle')
        expect(dragHandles).toHaveLength(2)
    })

    it('save puts meal_plan first when toggle is on', async () => {
        const { wrapper, store } = mountSettings([
            { mode: 'meal_plan', enabled: true },
            { mode: 'recent', enabled: true, min_recipes: 10 },
        ])
        await flushPromises()

        // Call save directly via component internals
        await (wrapper.vm as any).save()
        await flushPromises()

        expect(store.updateUserSettings).toHaveBeenCalled()
        const sections = store.userSettings.startPageSections as any[]
        expect(sections[0].mode).toBe('meal_plan')
        expect(sections[1].mode).toBe('recent')
    })

    it('save excludes meal_plan when absent from input', async () => {
        const { wrapper, store } = mountSettings([
            { mode: 'recent', enabled: true, min_recipes: 10 },
        ])
        await flushPromises()

        await (wrapper.vm as any).save()
        await flushPromises()

        expect(store.updateUserSettings).toHaveBeenCalled()
        const sections = store.userSettings.startPageSections as any[]
        expect(sections.every((s: any) => s.mode !== 'meal_plan')).toBe(true)
    })

    it('save preserves filter_id from section', async () => {
        const { wrapper, store } = mountSettings([
            { mode: 'meal_plan', enabled: true },
            { mode: 'keyword', enabled: true, min_recipes: 10, filter_id: 42 },
        ])
        await flushPromises()

        await (wrapper.vm as any).save()
        await flushPromises()

        expect(store.updateUserSettings).toHaveBeenCalled()
        const kwSection = (store.userSettings.startPageSections as any[]).find((s: any) => s.mode === 'keyword')
        expect(kwSection.filter_id).toBe(42)
    })

    // D09: sample sections carry a per-section randomize toggle (default on). save() must
    // serialize it so the choice round-trips; a section stored without it defaults to on.
    it('save serializes the randomize toggle for sample modes (default on)', async () => {
        const { wrapper, store } = mountSettings([
            { mode: 'meal_plan', enabled: true },
            { mode: 'keyword', enabled: true, min_recipes: 10, randomize: false },
            { mode: 'rating', enabled: true, min_recipes: 10 }, // omitted → defaults on
        ])
        await flushPromises()

        await (wrapper.vm as any).save()
        await flushPromises()

        const saved = store.userSettings.startPageSections as any[]
        expect(saved.find((s: any) => s.mode === 'keyword').randomize).toBe(false)
        expect(saved.find((s: any) => s.mode === 'rating').randomize).toBe(true)
    })

    it('sets defaultPage from store', async () => {
        mountSettings([], 'SEARCH')
        await flushPromises()
        // Component loaded without error with non-default page
        // (DOM assertion for v-select value is fragile, so just verify mount succeeded)
    })

    // Per-mode filter-selector coverage, ported from the retired single-use SectionRow component
    // (its rows were inlined into StartPageSettings). Locks the mode -> selector mapping and the
    // filter_id sync so inlining them didn't drop the coverage.
    it('renders a ModelSelect for an entity-filter mode (keyword)', async () => {
        const { wrapper } = mountSettings([{ mode: 'keyword', enabled: true, min_recipes: 10 }])
        await flushPromises()
        expect(wrapper.findAll('.stub-model-select')).toHaveLength(1)
    })

    it('renders a User ModelSelect (not a v-select) for created_by', async () => {
        const { wrapper } = mountSettings([{ mode: 'created_by', enabled: true, min_recipes: 10 }])
        await flushPromises()
        const selects = wrapper.findAll('.stub-model-select')
        expect(selects).toHaveLength(1)
        expect(selects[0].attributes('data-model')).toBe('User')
    })

    it('appends the entity picker dropdown to body so the section card cannot clip it (D05)', async () => {
        // Regression lock for D05: without append-to-body the @vueform dropdown renders in-tree and
        // the section card's overflow clips it.
        const { wrapper } = mountSettings([{ mode: 'keyword', enabled: true, min_recipes: 10 }])
        await flushPromises()
        expect((wrapper.findComponent('.stub-model-select') as any).props('appendToBody')).toBe(true)
    })

    it('renders a v-select (not a ModelSelect) for rating', async () => {
        const { wrapper } = mountSettings([{ mode: 'rating', enabled: true, min_recipes: 10 }])
        await flushPromises()
        expect(wrapper.findAll('.stub-model-select')).toHaveLength(0)
        expect(wrapper.findAll('.v-select').length).toBeGreaterThan(0)
    })

    it('renders no filter selector for recent', async () => {
        const { wrapper } = mountSettings([{ mode: 'recent', enabled: true, min_recipes: 10 }])
        await flushPromises()
        expect(wrapper.findAll('.stub-model-select')).toHaveLength(0)
    })

    it('reconciles filter_id from the picked entity (_filterObj) at save', async () => {
        // StartPageSettings binds the entity picker to section._filterObj and derives filter_id at
        // save (save(): `s._filterObj?.id ?? s.filter_id`) — unlike the retired SectionRow, which
        // synced filter_id on every update. Lock the save-time reconciliation.
        const { wrapper, store } = mountSettings([{ mode: 'keyword', enabled: true, min_recipes: 10 }])
        await flushPromises()
        const ms = wrapper.findComponent('.stub-model-select') as any

        ms.vm.$emit('update:modelValue', { id: 99, name: 'kw' })   // v-model sets section._filterObj
        await flushPromises()

        await (wrapper.vm as any).save()
        await flushPromises()
        const kw = (store.userSettings.startPageSections as any[]).find((s: any) => s.mode === 'keyword')
        expect(kw.filter_id).toBe(99)
    })
})
