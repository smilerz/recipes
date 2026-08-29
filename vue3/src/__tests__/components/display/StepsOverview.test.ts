/**
 * StepsOverview: the structured step overview should skip steps that have no
 * ingredients (instruction-only steps), while preserving the real step numbers
 * and still showing steps that carry a sub-recipe.
 */
import {describe, it, expect, beforeEach} from 'vitest'
import {mount} from '@vue/test-utils'
import {createPinia, setActivePinia, type PiniaPlugin} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'
import {createRouter, createMemoryHistory} from 'vue-router'

import {makeUserPreference} from '@/__tests__/factories'
import StepsOverview from '@/components/display/StepsOverview.vue'
import IngredientsTable from '@/components/display/IngredientsTable.vue'

function mountOverview(steps: any[], deviceOverrides: Record<string, any> = {}) {
    const prePopulate: PiniaPlugin = ({store}) => {
        if (store.$id === 'user_preference_store') {
            store.userSettings = makeUserPreference() as any
            store.deviceSettings.recipe_overviewExpanded = true // open the panel so its content renders
            Object.assign(store.deviceSettings, deviceOverrides)
        }
    }
    const pinia = createPinia(); pinia.use(prePopulate)
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})
    const router = createRouter({history: createMemoryHistory(), routes: [
        {path: '/', component: {template: '<div/>'}},
        {path: '/recipe/:id', name: 'RecipeViewPage', component: {template: '<div/>'}},
    ]})
    return mount(StepsOverview, {
        props: {steps, ingredientFactor: 1},
        global: {plugins: [pinia, i18n, vuetify, router], stubs: {IngredientsTable: true}},
    })
}

const withFood = (id: number, name: string) => ({
    id, name, showAsHeader: true,
    ingredients: [{id: id * 10, food: {id, name: 'food'}, isHeader: false}],
})

describe('StepsOverview hides empty steps', () => {
    beforeEach(() => setActivePinia(createPinia()))

    it('skips steps with no ingredients but keeps the real step numbers', () => {
        const steps = [
            withFood(1, 'Marinade'),                                   // step 1 — shown
            {id: 2, name: 'Instructions', showAsHeader: true, ingredients: []}, // step 2 — hidden
            withFood(3, 'Sauce'),                                      // step 3 — shown
        ]
        const html = mountOverview(steps).html()
        expect(html).toContain('1. Marinade')
        expect(html).not.toContain('Instructions')
        expect(html).toContain('3. Sauce') // numbering preserved (not renumbered to 2)
    })

    it('keeps a step that has no own ingredients but carries a sub-recipe', () => {
        const steps = [
            {id: 1, name: 'Sub step', showAsHeader: true, ingredients: [],
             stepRecipe: 9, stepRecipeData: {id: 9, name: 'Base recipe', steps: []}},
        ]
        const html = mountOverview(steps).html()
        expect(html).toContain('1. Sub step')
    })

    it('drops a header-only step that has no real ingredients', () => {
        const steps = [
            {id: 1, name: 'Just a header', showAsHeader: true,
             ingredients: [{id: 11, isHeader: true}]}, // header pseudo-ingredient, no food
        ]
        expect(mountOverview(steps).html()).not.toContain('Just a header')
    })
})

describe('StepsOverview applies step_recipe_scale to embedded sub-recipe ingredients', () => {
    beforeEach(() => setActivePinia(createPinia()))

    function subRecipeStep(scale: number) {
        return {
            id: 1, name: 'Add dough', showAsHeader: true, ingredients: [],
            stepRecipe: 9, stepRecipeScale: scale,
            stepRecipeData: {
                id: 9, name: 'Pie Crust',
                steps: [{id: 90, ingredients: [{id: 900, food: {id: 1, name: 'flour'}, amount: 10, isHeader: false}]}],
            },
        }
    }

    it('scales the sub-recipe ingredient amounts shown in the structured overview card', () => {
        const wrapper = mountOverview([subRecipeStep(0.5)])
        const tables = wrapper.findAllComponents(IngredientsTable)
        // last table is the sub-recipe card's table (first is the step's own, empty, table)
        const subRecipeTable = tables[tables.length - 1]
        expect(subRecipeTable.props('modelValue')[0].amount).toBe(5)
    })

    it('scales the sub-recipe ingredient amounts in the merged summary overview', () => {
        const wrapper = mountOverview([subRecipeStep(0.5)], {recipe_mergeStepOverview: true})
        const tables = wrapper.findAllComponents(IngredientsTable)
        expect(tables).toHaveLength(1)
        expect(tables[0].props('modelValue')[0].amount).toBe(5)
    })
})

describe('StepsOverview merged overview forwards the ingredient menu', () => {
    beforeEach(() => setActivePinia(createPinia()))

    // Merged ("Summary") mode collapses all steps into one table. It must still
    // honour recipe_overviewShowActions so the IngredientContextMenu can appear —
    // the structured mode already does. Guard against the merged table dropping
    // :show-actions (it silently falls back to the false default otherwise).
    it('passes show-actions to the single merged ingredients table', () => {
        const wrapper = mountOverview([withFood(1, 'A')], {
            recipe_mergeStepOverview: true,
            recipe_overviewShowActions: true,
        })
        const tables = wrapper.findAllComponents(IngredientsTable)
        expect(tables).toHaveLength(1) // merged mode renders exactly one table
        expect(tables[0].props('showActions')).toBe(true)
    })
})
