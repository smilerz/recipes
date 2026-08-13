/**
 * Regression coverage for IngredientsTable inline onhand / substitute
 * rendering.
 *
 * The inline yellow "substitute available" icon + names block must be
 * gated on the food itself NOT being onhand (bug: names used to appear
 * alongside the green onhand icon). Names source is food.availableSubstitutes
 * (the onhand subset), not the full substitute M2M list.
 */
import {describe, it, expect, vi, beforeEach} from 'vitest'
import {mount} from '@vue/test-utils'
import {createPinia, setActivePinia, type PiniaPlugin} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'
import {createRouter, createMemoryHistory} from 'vue-router'
import {ref} from 'vue'

import {apiMock, resetApiMock} from '@/__tests__/api-mock'
import {makeUserPreference} from '@/__tests__/factories'

vi.mock('vue-router', async (imp) => ({...(await imp<any>()), useRoute: () => ({query: {}})}))
vi.mock('@vueuse/core', async (imp) => ({...(await imp<any>()), useStorage: (_k: string, d: any) => ref(d)}))
vi.mock('@vueuse/router', () => ({useRouteQuery: (_k: string, d: any) => ref(d)}))
vi.mock('@/openapi', async (imp) => ({...(await imp<any>()), ApiApi: class { constructor() { return apiMock } }}))

import IngredientsTable from '@/components/display/IngredientsTable.vue'
import PantryJarIndicator from '@/components/display/PantryJarIndicator.vue'

function makeIngredient(overrides: any = {}): any {
    return {
        id: 1,
        amount: 1,
        food: {id: 1, name: 'Butter', foodOnhand: false, substitute: [], availableSubstitutes: [], substituteOnhand: false, ...overrides.food},
        unit: {id: 1, name: 'tbsp'},
        note: '',
        noAmount: false,
        order: 0,
        originalText: 'Butter',
        alwaysUsePluralUnit: false,
        alwaysUsePluralFood: false,
        checked: false,
        isHeader: false,
        ...overrides,
    }
}

function mountTable(ingredients: any[], context: 'overview' | 'step' = 'overview', showActions = false) {
    const prePopulate: PiniaPlugin = ({store}) => {
        if (store.$id === 'user_preference_store') {
            store.userSettings = makeUserPreference() as any
            // Force inline status on so the block renders
            store.deviceSettings.recipe_overviewInlineStatus = true
            store.deviceSettings.recipe_stepInlineStatus = true
        }
    }
    const pinia = createPinia()
    pinia.use(prePopulate)
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {SubstituteAvailable: 'i18n-sub[{names}]'}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({
        components: vuetifyComponents, directives: vuetifyDirectives,
        display: {mobileBreakpoint: 0}, // desktop — inline status gated on !mobile
    })
    const router = createRouter({history: createMemoryHistory(), routes: [{path: '/', component: {template: '<div/>'}}]})
    return mount(IngredientsTable, {
        props: {modelValue: ingredients, ingredientFactor: 1, showCheckbox: false, showActions, context},
        global: {
            plugins: [pinia, i18n, vuetify, router],
            stubs: {
                IngredientContextMenu: {name: 'IngredientContextMenu', template: '<div class="stub-ctxmenu"/>', emits: ['scale', 'update:foodStatus']},
            },
        },
    })
}

describe('IngredientsTable inline onhand / substitute', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        resetApiMock()
        sessionStorage.clear()
    })

    it("applies IngredientContextMenu's update:foodStatus to the ingredient food (live jar)", async () => {
        const ing = makeIngredient({food: {inInventory: 'False', availableSubstitutes: [], substituteOnhand: false}})
        const w = mountTable([ing], 'step', true)
        expect(w.findComponent(PantryJarIndicator).exists()).toBe(false)

        // Menu reports a status change; IngredientsTable (the model owner) applies it.
        const menu = w.findComponent({name: 'IngredientContextMenu'})
        menu.vm.$emit('update:foodStatus', {inInventory: 'True', foodOnhand: true})
        await w.vm.$nextTick()

        expect(w.findComponent(PantryJarIndicator).exists()).toBe(true)  // pantry jar shows reactively
    })

    it('renders the pantry jar and no substitute names when food is on hand', () => {
        const ing = makeIngredient({food: {inInventory: 'True', availableSubstitutes: [{id: 2, name: 'Margarine'}], substituteOnhand: true}})
        const w = mountTable([ing])
        expect(w.findComponent(PantryJarIndicator).exists()).toBe(true)
        // Substitute names must NOT appear when the food itself is on hand
        expect(w.html()).not.toContain('Margarine')
    })

    it('renders yellow substitute icon and available-substitute names when food is not onhand', () => {
        const ing = makeIngredient({food: {
            foodOnhand: false,
            substitute: [{id: 2, name: 'Margarine'}, {id: 3, name: 'Ghee'}],
            availableSubstitutes: [{id: 2, name: 'Margarine'}],
            substituteOnhand: true,
        }})
        const w = mountTable([ing])
        const html = w.html()
        expect(html).toContain('fa-right-left')
        // Names list is the onhand subset (Margarine only), not the full substitute M2M (which also contains Ghee)
        expect(html).toContain('Margarine')
        expect(html).not.toContain('Ghee')
    })

    it('renders no icons and no names when nothing is onhand and no available substitute', () => {
        const ing = makeIngredient({food: {foodOnhand: false, availableSubstitutes: [], substituteOnhand: false, substitute: [{id: 2, name: 'Margarine'}]}})
        const w = mountTable([ing])
        const html = w.html()
        expect(html).not.toContain('fa-clipboard-check')
        expect(html).not.toContain('fa-right-left')
        expect(html).not.toContain('Margarine')
    })

    it('substitute names use availableSubstitutes not substitute when the lists differ', () => {
        const ing = makeIngredient({food: {
            foodOnhand: false,
            substitute: [{id: 99, name: 'FullListName'}],
            availableSubstitutes: [{id: 2, name: 'OnhandName'}],
            substituteOnhand: true,
        }})
        const w = mountTable([ing])
        const html = w.html()
        expect(html).toContain('OnhandName')
        expect(html).not.toContain('FullListName')
    })

    // Inline text shows a randomly-picked available substitute (not always the
    // first — that was the original defect this session). The aria-label on
    // the yellow icon still lists all for screen readers.
    it('inline substitute text renders exactly one availableSubstitute, chosen randomly', () => {
        const ing = makeIngredient({food: {
            id: 41,
            foodOnhand: false,
            availableSubstitutes: [
                {id: 2, name: 'Alpha'},
                {id: 3, name: 'Beta'},
                {id: 4, name: 'Gamma'},
            ],
            substituteOnhand: true,
        }})
        // Steer the pick to the last entry, proving it's no longer hardcoded to index 0.
        const mathSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99)
        try {
            const w = mountTable([ing])
            const visible = w.find('.text-caption.text-medium-emphasis').text()
            expect(visible).toContain('Gamma')
            expect(visible).not.toContain('Alpha')
            expect(visible).not.toContain('Beta')
            expect(visible).not.toContain(',')
        } finally {
            mathSpy.mockRestore()
        }
    })

    it('inline substitute text with a single availableSubstitute renders that one name', () => {
        const ing = makeIngredient({food: {
            foodOnhand: false,
            availableSubstitutes: [{id: 2, name: 'Solo'}],
            substituteOnhand: true,
        }})
        const w = mountTable([ing])
        expect(w.html()).toContain('Solo')
    })

    // The substitute icon's aria-label must be localized (via $t), not a
    // hardcoded English string — guards the SubstituteAvailable i18n key.
    it('substitute icon aria-label is localized and lists the available substitutes', () => {
        const ing = makeIngredient({food: {
            foodOnhand: false,
            availableSubstitutes: [{id: 2, name: 'Margarine'}, {id: 3, name: 'Ghee'}],
            substituteOnhand: true,
        }})
        const w = mountTable([ing])
        const icon = w.find('.fa-right-left')
        // Distinctive test translation proves the label is localized via $t,
        // not the hardcoded English "Substitute available: ...".
        expect(icon.attributes('aria-label')).toBe('i18n-sub[Margarine, Ghee]')
    })
})

describe('IngredientsTable note truncation', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        resetApiMock()
    })

    function mountWithTruncate(ingredients: any[], truncateLen: number) {
        const prePopulate: PiniaPlugin = ({store}) => {
            if (store.$id === 'user_preference_store') {
                store.userSettings = makeUserPreference() as any
                store.deviceSettings.recipe_overviewInlineStatus = true
                store.deviceSettings.recipe_stepInlineStatus = true
                store.deviceSettings.recipe_overviewNotesDisplay = 'truncate'
                store.deviceSettings.recipe_stepNotesDisplay = 'truncate'
                store.deviceSettings.recipe_notesTruncateLength = truncateLen
            }
        }
        const pinia = createPinia()
        pinia.use(prePopulate)
        const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {SubstituteAvailable: 'i18n-sub[{names}]'}}, missingWarn: false, fallbackWarn: false})
        const vuetify = createVuetify({
            components: vuetifyComponents, directives: vuetifyDirectives,
            display: {mobileBreakpoint: 0},
        })
        const router = createRouter({history: createMemoryHistory(), routes: [{path: '/', component: {template: '<div/>'}}]})
        return mount(IngredientsTable, {
            props: {modelValue: ingredients, ingredientFactor: 1, showCheckbox: false, showActions: false, context: 'overview'},
            global: {
                plugins: [pinia, i18n, vuetify, router],
                stubs: {IngredientContextMenu: {template: '<div class="stub-ctxmenu"/>'}},
            },
        })
    }

    it('truncate length shrinks by inline substitute text length so the row stays within the user budget', () => {
        const note = 'abcdefghijklmnopqrstuvwxyz0123456789' // 36 chars
        const subName = 'XYZABC' // 6 chars
        const ing = makeIngredient({
            note,
            food: {
                foodOnhand: false,
                availableSubstitutes: [{id: 2, name: subName}],
                substituteOnhand: true,
            },
        })
        // Budget 25. Without substitute: truncate to 25 → 'abcdefghijklmnopqrstuvwxy...'.
        // With 6-char substitute + 3 framing chars (' (x)'), budget shrinks to
        // 25 - 9 = 16 → 'abcdefghijklmnop...'.
        const w = mountWithTruncate([ing], 25)
        const html = w.html()
        expect(html).toContain(subName) // substitute still rendered
        // The long-truncation prefix ('abcdefghijklmnopqrstuvwxy') MUST NOT appear
        expect(html).not.toContain('abcdefghijklmnopqrstuvwxy')
        // The short-truncation prefix ('abcdefghijklmnop') MUST appear
        expect(html).toContain('abcdefghijklmnop')
    })

    it('truncate length falls back to full user budget when no substitute is shown (food onhand)', () => {
        const note = 'abcdefghijklmnopqrstuvwxyz0123456789'
        const ing = makeIngredient({
            note,
            food: {
                inInventory: 'True', // on hand → no substitute text even if availableSubstitutes present
                availableSubstitutes: [{id: 2, name: 'XYZABC'}],
                substituteOnhand: true,
            },
        })
        const w = mountWithTruncate([ing], 25)
        const html = w.html()
        // Full 25-char budget used
        expect(html).toContain('abcdefghijklmnopqrstuvwxy')
    })
})

describe('IngredientsTable mobile Option-C list layout', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        resetApiMock()
        sessionStorage.clear()
    })

    function mountTableMobile(ingredients: any[], context: 'overview' | 'step' = 'step', extraProps: any = {}) {
        const prePopulate: PiniaPlugin = ({store}) => {
            if (store.$id === 'user_preference_store') {
                store.userSettings = makeUserPreference() as any
                store.deviceSettings.recipe_overviewInlineStatus = true
                store.deviceSettings.recipe_stepInlineStatus = true
            }
        }
        const pinia = createPinia()
        pinia.use(prePopulate)
        const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {SubstituteAvailable: 'i18n-sub[{names}]'}}, missingWarn: false, fallbackWarn: false})
        const vuetify = createVuetify({
            components: vuetifyComponents, directives: vuetifyDirectives,
            display: {mobileBreakpoint: 9999}, // force mobile at any width
        })
        const router = createRouter({history: createMemoryHistory(), routes: [{path: '/', component: {template: '<div/>'}}]})
        return mount(IngredientsTable, {
            props: {modelValue: ingredients, ingredientFactor: 1, showCheckbox: true, showActions: true, context, ...extraProps},
            global: {
                plugins: [pinia, i18n, vuetify, router],
                stubs: {IngredientContextMenu: {template: '<div class="stub-ctxmenu"/>'}},
            },
        })
    }

    it('renders a v-list-item row (data-test=ingredient-item) on mobile, not a data table', () => {
        const w = mountTableMobile([makeIngredient()])
        expect(w.find('[data-test="ingredient-item"]').exists()).toBe(true)
    })

    it('shows the actions kebab on mobile when showActions', () => {
        const w = mountTableMobile([makeIngredient()], 'step', {showActions: true})
        expect(w.find('.stub-ctxmenu').exists()).toBe(true)
    })

    it('hides the kebab on mobile when not showActions', () => {
        const w = mountTableMobile([makeIngredient()], 'step', {showActions: false})
        expect(w.find('.stub-ctxmenu').exists()).toBe(false)
    })

    it('substitute chip lists the on-hand substitutes (availableSubstitutes) with +N for extras', () => {
        const mathSpy = vi.spyOn(Math, 'random').mockReturnValue(0)  // deterministic pick for this assertion
        try {
            const ing = makeIngredient({food: {foodOnhand: false, availableSubstitutes: [{id: 2, name: 'Margarine'}, {id: 3, name: 'Ghee'}]}})
            const chip = mountTableMobile([ing]).find('[data-test="ingredient-substitute"]')
            expect(chip.exists()).toBe(true)
            expect(chip.text()).toContain('Margarine')
            expect(chip.text()).toContain('+1')
        } finally {
            mathSpy.mockRestore()
        }
    })

    // Regression: 9a5608d2c ("show first substitute deterministically") existed because an earlier
    // random-pick attempt only wired substituteText(), so the desktop hint and mobile chip could
    // disagree. Both must read the SAME pick, cached by food id.
    it('inline text and mobile chip agree on the same substitute pick for the same food', () => {
        const food = {id: 42, foodOnhand: false, availableSubstitutes: [
            {id: 2, name: 'Alpha'}, {id: 3, name: 'Beta'}, {id: 4, name: 'Gamma'},
        ], substituteOnhand: true}
        const mathSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5)  // steers off index 0
        try {
            const textVisible = mountTable([makeIngredient({food})]).find('.text-caption.text-medium-emphasis').text()
            const picked = ['Alpha', 'Beta', 'Gamma'].find(n => textVisible.includes(n))
            expect(picked).toBeDefined()

            mathSpy.mockReturnValue(0)  // if the chip re-rolled independently it would now show Alpha
            const chipText = mountTableMobile([makeIngredient({food})]).find('[data-test="ingredient-substitute"]').text()
            expect(chipText).toContain(picked!)
        } finally {
            mathSpy.mockRestore()
        }
    })

    it("a food's substitute pick is stable across remounts within the same session", () => {
        const food = {id: 43, foodOnhand: false, availableSubstitutes: [
            {id: 2, name: 'Alpha'}, {id: 3, name: 'Beta'}, {id: 4, name: 'Gamma'},
        ], substituteOnhand: true}
        const mathSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99)  // steers to Gamma
        try {
            const first = mountTable([makeIngredient({food})]).find('.text-caption.text-medium-emphasis').text()
            expect(first).toContain('Gamma')

            mathSpy.mockReturnValue(0)  // would steer to Alpha if the pick re-rolled on remount
            const second = mountTable([makeIngredient({food})]).find('.text-caption.text-medium-emphasis').text()
            expect(second).toContain('Gamma')
        } finally {
            mathSpy.mockRestore()
        }
    })

    it('no chip when the food has substitutes DEFINED but none on hand (availableSubstitutes empty)', () => {
        const ing = makeIngredient({food: {foodOnhand: false, availableSubstitutes: [], substitute: [{id: 2, name: 'Ghee'}]}})
        expect(mountTableMobile([ing]).find('[data-test="ingredient-substitute"]').exists()).toBe(false)
    })

    it('no substitute chip when there are no substitutes', () => {
        const w = mountTableMobile([makeIngredient()])
        expect(w.find('[data-test="ingredient-substitute"]').exists()).toBe(false)
    })

    it('truncate mode shows a trailing ellipsis and expands the note when clicked', async () => {
        const longNote = 'use the freshest bunch you can find, stems removed and finely minced'
        const w = mountTableMobile([makeIngredient({note: longNote})])
        const store = (w.vm.$pinia as any)._s.get('user_preference_store')
        store.deviceSettings.recipe_stepNotesDisplay = 'truncate'
        store.deviceSettings.recipe_notesTruncateLength = 20
        await w.vm.$nextTick()

        const note = w.find('[data-test="ingredient-note"]')
        expect(note.exists()).toBe(true)
        expect(note.text()).toContain('...') // ellipsis is the truncation cue
        expect(note.text()).not.toContain('finely minced')

        await note.trigger('click')
        expect(w.find('[data-test="ingredient-note"]').text()).toContain('finely minced')
    })
})
