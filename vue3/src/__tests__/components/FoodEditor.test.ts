/**
 * Freezer-aware shelf-life defaults (Part 1 of the pantry-expiration plan): FoodEditor gains two
 * new shelf-life rows (Freezer, Opened) alongside the existing Pantry/Fridge row, each backed by
 * its own value+period picker mirroring shelfLifeDays' existing pattern, plus quick-select preset
 * chips so a food doesn't need pre-configured defaults for fast entry.
 */
import {describe, it, expect, beforeEach, vi} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {createPinia, setActivePinia} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'
import {apiMock, resetApiMock} from '@/__tests__/api-mock'
import {makeFood} from '@/__tests__/factories'

vi.mock('@/openapi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/openapi')>()
    return {
        ...actual,
        ApiApi: class {constructor() { return apiMock }},
    }
})

vi.mock('vue-i18n', async (importOriginal) => ({
    ...(await importOriginal<typeof import('vue-i18n')>()),
    useI18n: () => ({t: (key: string) => key}),
}))

// FoodEditor -> HierarchyEditor -> HelpView -> @/i18n.ts -> virtual:locale-coverage, a plugin only
// registered in vite.config.ts (not vitest.config.ts). Break the circuit the same way
// HierarchyEditor.test.ts does — mock @/i18n so the virtual module is never reached.
vi.mock('@/i18n', () => ({
    SUPPORT_LOCALES: [{code: 'en', label: 'English'}],
    resolveLocale: (c: string) => c,
    localeCoverage: {en: 100},
    LOCALE_MIN_COVERAGE: 0,
}))

vi.mock('vue-router', () => ({
    useRoute: () => ({query: {}}),
    useRouter: () => ({push: vi.fn().mockResolvedValue(undefined)}),
}))

vi.mock('@vueuse/router', () => ({
    useRouteQuery: () => ({value: false}),
}))

vi.mock('@vueuse/core', async (importOriginal) => {
    const {ref} = await import('vue')
    return {
        ...(await importOriginal<typeof import('@vueuse/core')>()),
        useStorage: (_key: string, defaultValue: any) => ref(defaultValue),
    }
})

import FoodEditor from '@/components/model_editors/FoodEditor.vue'

function mountEditor(item: any) {
    const pinia = createPinia()
    setActivePinia(pinia)

    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})

    return mount(FoodEditor, {
        props: {item},
        global: {
            plugins: [pinia, i18n, vuetify],
            stubs: {
                ModelSelect: {template: '<div class="stub-model-select"/>'},
                UserFileField: {template: '<div class="stub-user-file-field"/>'},
                PropertiesEditor: {template: '<div class="stub-properties-editor"/>'},
                HierarchyEditor: {template: '<div class="stub-hierarchy-editor"/>'},
                FdcSearchDialog: {template: '<div class="stub-fdc-dialog"/>'},
                ModelEditDialog: {template: '<div class="stub-model-edit-dialog"/>'},
                ModelEditorBase: {template: '<div><slot /></div>'},
            },
        },
    })
}

describe('FoodEditor - freezer-aware shelf-life defaults', () => {
    beforeEach(() => {
        resetApiMock()
    })

    it('renders three shelf-life rows (Pantry/Fridge, Freezer, Opened)', async () => {
        const item = makeFood({id: 5, name: 'Chicken Breast', shelfLifeDays: 2})
        const w = mountEditor(item)
        await flushPromises()

        expect((w.vm as any).shelfLifeValue).toBe(2)
        expect((w.vm as any).shelfLifeFrozenValue).toBe(null)
        expect((w.vm as any).shelfLifeOpenedValue).toBe(null)

        w.unmount()
    })

    it('initializes the Freezer and Opened pickers from existing days on load', async () => {
        const item = makeFood({id: 5, name: 'Chicken Breast', shelfLifeDaysFrozen: 180, shelfLifeDaysOpened: 3})
        const w = mountEditor(item)
        await flushPromises()

        expect((w.vm as any).shelfLifeFrozenValue).toBe(6)
        expect((w.vm as any).shelfLifeFrozenPeriod).toBe('month')
        expect((w.vm as any).shelfLifeOpenedValue).toBe(3)
        expect((w.vm as any).shelfLifeOpenedPeriod).toBe('day')

        w.unmount()
    })

    it('writes picker changes back to shelfLifeDaysFrozen / shelfLifeDaysOpened', async () => {
        const item = makeFood({id: 5, name: 'Chicken Breast'})
        const w = mountEditor(item)
        await flushPromises()

        ;(w.vm as any).shelfLifeFrozenValue = 6
        ;(w.vm as any).shelfLifeFrozenPeriod = 'month'
        ;(w.vm as any).shelfLifeOpenedValue = 3
        ;(w.vm as any).shelfLifeOpenedPeriod = 'day'
        await flushPromises()

        expect((w.vm as any).editingObj.shelfLifeDaysFrozen).toBe(180)
        expect((w.vm as any).editingObj.shelfLifeDaysOpened).toBe(3)

        w.unmount()
    })

    it('a Freezer preset chip click fills the Freezer row value+period', async () => {
        const item = makeFood({id: 5, name: 'Chicken Breast'})
        const w = mountEditor(item)
        await flushPromises()

        const chipRows = w.findAllComponents({name: 'ExpiryPresetChips'})
        expect(chipRows.length).toBe(3)
        chipRows[1].vm.$emit('select', 180)  // Freezer row is the second of the three
        await flushPromises()

        expect((w.vm as any).shelfLifeFrozenValue).toBe(6)
        expect((w.vm as any).shelfLifeFrozenPeriod).toBe('month')
        expect((w.vm as any).editingObj.shelfLifeDaysFrozen).toBe(180)

        w.unmount()
    })
})
