/**
 * Food-specific configuration for the enhanced ModelListPage.
 * This is the single source of truth for all Food list behavior.
 */

import type {ModelFilterDef, ModelActionDef, ModelListSettings, ModelSortDef} from './types'
import {ApiApi, DeleteEnum} from '@/openapi'

/** The backend annotates shopping_status via Exists() → CharField, yielding "True"/"False" strings. */
function isOnShoppingList(item: any): boolean {
    const v = item.shopping
    return v === true || v === 'True' || v === 'true'
}

/**
 * Filter definitions for the Food list.
 * Each maps to a query parameter on the /api/food/ endpoint.
 */
export const FOOD_FILTER_DEFS: ModelFilterDef[] = [
    {key: 'onhand', labelKey: 'OnHand', type: 'tristate', icon: 'fa-solid fa-check-circle', group: 'Status'},
    {key: 'in_shopping_list', labelKey: 'Shopping', type: 'tristate', icon: 'fa-solid fa-cart-shopping', group: 'Status'},
    {key: 'ignore_shopping', labelKey: 'IgnoreShopping', type: 'tristate', icon: 'fa-solid fa-ban', group: 'Status'},
    {key: 'has_substitute', labelKey: 'Substitute', type: 'tristate', icon: 'fa-solid fa-right-left', group: 'Attributes'},
    {key: 'has_children', labelKey: 'Children', type: 'tristate', icon: 'fa-solid fa-sitemap', group: 'Attributes'},
    {key: 'has_recipe', labelKey: 'Recipe', type: 'tristate', icon: 'fa-solid fa-book', group: 'Attributes'},
    {key: 'supermarket_category', labelKey: 'Category', type: 'model-select', icon: 'fa-solid fa-boxes-stacked', modelName: 'SupermarketCategory', group: 'Attributes'},
]

/**
 * Action definitions for the Food list.
 * Grouped into status toggles and one-shot actions.
 */
export const FOOD_ACTION_DEFS: ModelActionDef[] = [
    // Status toggles
    {key: 'onhand', labelKey: 'OnHand', icon: 'fa-solid fa-clipboard-check', isToggle: true, toggleField: 'foodOnhand', activeColor: 'success', inactiveColor: '', group: 'Status',
        colorResolver: (item: any) => {
            if (item.foodOnhand) return 'success'
            if (item.substituteOnhand) return 'warning'
            return undefined
        },
    },
    {key: 'shopping', labelKey: 'Shopping', icon: 'fa-solid fa-cart-shopping', isToggle: true, toggleField: 'shopping', activeColor: 'success', inactiveColor: '', group: 'Status', requiresConfirmation: true,
        isActive: isOnShoppingList,
        colorResolver: (item: any) => isOnShoppingList(item) ? 'success' : undefined,
        handler: async (item) => {
            const api = new ApiApi()
            const oldValue = item.shopping
            try {
                if (isOnShoppingList(item)) {
                    item.shopping = 'False'
                    await api.apiFoodShoppingUpdate({id: item.id, foodShoppingUpdate: {_delete: DeleteEnum.True}})
                } else {
                    item.shopping = 'True'
                    await api.apiFoodShoppingUpdate({id: item.id, foodShoppingUpdate: {_delete: null}})
                }
            } catch (e) {
                item.shopping = oldValue
                throw e
            }
        },
    },
    {key: 'ignore', labelKey: 'IgnoreShopping', icon: 'fa-solid fa-ban', isToggle: true, toggleField: 'ignoreShopping', activeColor: 'error', inactiveColor: '', group: 'Status',
        colorResolver: (item: any) => item.ignoreShopping ? 'error' : undefined,
    },

    // One-shot actions
    {key: 'recipe', labelKey: 'Recipe', icon: 'fa-solid fa-book', group: 'Actions',
        routeName: 'RecipeViewPage', routeParams: (item) => ({id: item.recipe.id}),
        visible: (item: any) => !!item.recipe},
    {key: 'edit', labelKey: 'Edit', icon: 'fa-solid fa-pen', group: 'Actions', routeName: 'ModelEditPage', routeParams: (item, modelName) => ({model: modelName, id: item.id})},
    {key: 'merge', labelKey: 'Merge', icon: 'fa-solid fa-arrows-to-dot', group: 'Actions'},
    {key: 'move', labelKey: 'Move', icon: 'fa-solid fa-arrow-right', group: 'Actions',
        routeName: 'ModelEditPage',
        routeParams: (item, modelName) => ({model: modelName, id: item.id}),
        routeQuery: (_item: any) => ({tab: 'hierarchy'})},
    {key: 'ingredient-editor', labelKey: 'Ingredient Editor', icon: 'fa-solid fa-table-list', group: 'Actions', routeName: 'IngredientEditorPage', routeQuery: (item: any) => ({food_id: item.id})},
    {key: 'delete', labelKey: 'Delete', icon: 'fa-solid fa-trash', group: 'Actions', isDanger: true,
        routeName: 'ModelDeletePage',
        routeParams: (item, modelName) => ({model: modelName, id: item.id})},
]

/**
 * List settings for the Food model.
 */
export const FOOD_LIST_SETTINGS: ModelListSettings = {
    settingsKey: 'food',
    settingsPanel: true,
    treeEnabled: true,
    statsFooter: true,
    mobileList: true,
}

/**
 * Sort option definitions for the Food list.
 * Each key can be prefixed with `-` for descending at the point of use.
 */
export const FOOD_SORT_OPTIONS: ModelSortDef[] = [
    {key: 'name', labelKey: 'Name'},
    {key: 'numrecipe', labelKey: 'Recipes'},
    {key: 'numchild', labelKey: 'Children'},
    {key: 'supermarket_category__name', labelKey: 'Shopping_Category'},
]
