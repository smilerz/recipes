/**
 * Food-specific configuration for the enhanced ModelListPage.
 * This is the single source of truth for all Food list behavior.
 */

import type {ModelFilterDef, ModelActionDef, ModelListSettings} from './types'

/**
 * Filter definitions for the Food list.
 * Each maps to a query parameter on the /api/food/ endpoint.
 */
export const FOOD_FILTER_DEFS: ModelFilterDef[] = [
    {key: 'onhand', labelKey: 'OnHand', type: 'tristate', icon: 'fa-solid fa-check-circle', group: 'status'},
    {key: 'in_shopping_list', labelKey: 'Shopping', type: 'tristate', icon: 'fa-solid fa-cart-shopping', group: 'status'},
    {key: 'ignore_shopping', labelKey: 'IgnoreShopping', type: 'tristate', icon: 'fa-solid fa-ban', group: 'status'},
    {key: 'has_substitute', labelKey: 'Substitute', type: 'tristate', icon: 'fa-solid fa-right-left', group: 'attributes'},
    {key: 'has_children', labelKey: 'Children', type: 'tristate', icon: 'fa-solid fa-sitemap', group: 'attributes'},
    {key: 'has_recipe', labelKey: 'Recipe', type: 'tristate', icon: 'fa-solid fa-book', group: 'attributes'},
    {key: 'supermarket_category', labelKey: 'Category', type: 'model-select', icon: 'fa-solid fa-boxes-stacked', modelName: 'SupermarketCategory', group: 'attributes'},
]

/**
 * Action definitions for the Food list.
 * Grouped into status toggles and one-shot actions.
 */
export const FOOD_ACTION_DEFS: ModelActionDef[] = [
    // Status toggles
    {key: 'onhand', labelKey: 'OnHand', icon: 'fa-solid fa-check-circle', isToggle: true, toggleField: 'foodOnhand', activeColor: 'success', inactiveColor: '', group: 'status'},
    {key: 'shopping', labelKey: 'Shopping', icon: 'fa-solid fa-cart-shopping', isToggle: true, toggleField: 'shopping', activeColor: 'warning', inactiveColor: '', group: 'status'},
    {key: 'ignore', labelKey: 'IgnoreShopping', icon: 'fa-solid fa-ban', isToggle: true, toggleField: 'ignoreShopping', activeColor: 'error', inactiveColor: '', group: 'status'},

    // One-shot actions
    {key: 'edit', labelKey: 'Edit', icon: 'fa-solid fa-pen', group: 'actions', routeName: 'ModelEditPage'},
    {key: 'merge', labelKey: 'Merge', icon: 'fa-solid fa-arrows-to-dot', group: 'actions'},
    {key: 'merge-auto', labelKey: 'AutoMerge', icon: 'fa-solid fa-wand-magic-sparkles', group: 'actions'},
    {key: 'move', labelKey: 'Move', icon: 'fa-solid fa-arrow-right', group: 'actions'},
    {key: 'ingredient-editor', labelKey: 'Ingredient Editor', icon: 'fa-solid fa-table-list', group: 'actions', routeName: 'IngredientEditorPage', routeQuery: (item: any) => ({food_id: item.id})},
    {key: 'delete', labelKey: 'Delete', icon: 'fa-solid fa-trash', group: 'danger', requiresConfirmation: true},
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
