/**
 * Food-specific configuration for the enhanced ModelListPage.
 * This is the single source of truth for all Food list behavior.
 */

import type {FilterDef, ActionDef, BatchAction, StatDef, ListSettings, SortDef, ModelItem} from './types'
import type {ActionConfirmEntry} from '@/components/dialogs/ActionConfirmDialog.vue'
import {ApiApi} from '@/openapi'

/** The backend annotates shopping_status via Exists() → CharField, yielding "True"/"False" strings. */
function isOnShoppingList(item: ModelItem): boolean {
    const v = item.shopping
    return v === true || v === 'True' || v === 'true'
}

/**
 * Filter definitions for the Food list.
 * Each maps to a query parameter on the /api/food/ endpoint.
 */
export const FOOD_FILTER_DEFS: FilterDef[] = [
    {key: 'onhand', labelKey: 'OnHand', type: 'tristate', icon: 'fa-solid fa-check-circle', group: 'Status'},
    {key: 'in_shopping_list', labelKey: 'Shopping', type: 'tristate', icon: 'fa-solid fa-cart-shopping', group: 'Status'},
    {key: 'ignore_shopping', labelKey: 'IgnoreShopping', type: 'tristate', icon: 'fa-solid fa-ban', group: 'Status'},
    {key: 'has_substitute', labelKey: 'Substitute', type: 'tristate', icon: 'fa-solid fa-right-left', group: 'Attributes'},
    {key: 'has_children', labelKey: 'Children', type: 'tristate', icon: 'fa-solid fa-sitemap', group: 'Attributes'},
    {key: 'has_recipe', labelKey: 'Recipe', type: 'tristate', icon: 'fa-solid fa-book', group: 'Attributes'},
    {key: 'used_in_recipes', labelKey: 'UsedInRecipes', type: 'tristate', icon: 'fa-solid fa-utensils', group: 'Attributes'},
    {key: 'supermarket_category', labelKey: 'Category', type: 'model-select', icon: 'fa-solid fa-boxes-stacked', modelName: 'SupermarketCategory', group: 'Attributes'},
]

/**
 * Action definitions for the Food list.
 * Grouped into status toggles and one-shot actions.
 */
export const FOOD_ACTION_DEFS: ActionDef[] = [
    // Status toggles
    {key: 'onhand', labelKey: 'OnHand', icon: 'fa-solid fa-clipboard-check', isToggle: true, toggleField: 'foodOnhand', activeColor: 'success', inactiveColor: '', group: 'Status',
        colorResolver: (item: ModelItem) => {
            if (item.foodOnhand) return 'success'
            if (item.substituteOnhand) return 'warning'
            return undefined
        },
    },
    {key: 'shopping', labelKey: 'Shopping', icon: 'fa-solid fa-cart-shopping', isToggle: true, toggleField: 'shopping', activeColor: 'success', inactiveColor: '', group: 'Status', requiresConfirmation: true,
        isActive: isOnShoppingList,
        colorResolver: (item: ModelItem) => isOnShoppingList(item) ? 'success' : undefined,
        handler: async (item) => {
            const api = new ApiApi()
            if (isOnShoppingList(item)) {
                await api.apiFoodShoppingDestroy({id: item.id})
                item.shopping = 'False'
            } else {
                await api.apiFoodShoppingUpdate({id: item.id, foodShoppingUpdate: {}})
                item.shopping = 'True'
            }
        },
        confirmationHandler: async (item, confirmDialog, t) => {
            const confirmPromise = confirmDialog.open({
                title: t('Confirm'),
                message: t('RemoveFromShoppingConfirm', {name: item.name}),
                loading: true,
                confirmLabel: t('Remove'),
                confirmColor: 'warning',
                confirmIcon: 'fa-solid fa-cart-shopping',
            })
            try {
                const api = new ApiApi()
                const result = await api.apiShoppingListEntryList({food: item.id, pageSize: 100})
                const foodEntries = (result.results ?? []).filter((e: any) => !e.checked)
                const entries: ActionConfirmEntry[] = foodEntries.map((e: any) => {
                    const parts: string[] = []
                    if (e.amount) parts.push(String(e.amount))
                    if (e.unit?.name) parts.push(e.unit.name)
                    const text = parts.length > 0 ? parts.join(' ') : t('Shopping')
                    const subtextParts: string[] = []
                    const recipeName = e.listRecipeData?.recipeData?.name
                    if (recipeName) subtextParts.push(recipeName)
                    if (e.createdBy?.displayName || e.createdBy?.username) {
                        subtextParts.push(e.createdBy.displayName || e.createdBy.username)
                    }
                    if (e.createdAt) {
                        subtextParts.push(new Date(e.createdAt).toLocaleString())
                    }
                    return {text, subtext: subtextParts.join(' · ') || undefined, icon: 'fa-solid fa-cart-shopping'} as ActionConfirmEntry
                })
                confirmDialog.setEntries(entries)
            } catch {
                confirmDialog.setEntries([])
            }
            return (await confirmPromise) ?? false
        },
    },
    {key: 'ignore', labelKey: 'IgnoreShopping', icon: 'fa-solid fa-ban', isToggle: true, toggleField: 'ignoreShopping', activeColor: 'error', inactiveColor: '', group: 'Status',
        colorResolver: (item: ModelItem) => item.ignoreShopping ? 'error' : undefined,
    },

    // One-shot actions
    {key: 'recipe', labelKey: 'Recipe', icon: 'fa-solid fa-book', group: 'Actions',
        routeName: 'RecipeViewPage', routeParams: (item) => ({id: item.recipe.id}),
        visible: (item: ModelItem) => !!item.recipe},
    {key: 'edit', labelKey: 'Edit', icon: 'fa-solid fa-pen', group: 'Actions', routeName: 'ModelEditPage', routeParams: (item, modelName) => ({model: modelName, id: item.id})},
    {key: 'merge', labelKey: 'Merge', icon: 'fa-solid fa-arrows-to-dot', group: 'Actions'},
    {key: 'move', labelKey: 'Move', icon: 'fa-solid fa-arrow-right', group: 'Actions',
        routeName: 'ModelEditPage',
        routeParams: (item, modelName) => ({model: modelName, id: item.id}),
        routeQuery: () => ({tab: 'hierarchy'})},
    {key: 'ingredient-editor', labelKey: 'Ingredient Editor', icon: 'fa-solid fa-table-list', group: 'Actions', routeName: 'IngredientEditorPage', routeQuery: (item) => ({food_id: item.id})},
    {key: 'delete', labelKey: 'Delete', icon: 'fa-solid fa-trash', group: 'Actions', isDanger: true,
        routeName: 'ModelDeletePage',
        routeParams: (item, modelName) => ({model: modelName, id: item.id})},
]

/**
 * Stat definitions for the Food list stats footer.
 * Keys match the API stats response fields.
 */
export const FOOD_STAT_DEFS: StatDef[] = [
    {key: 'onhand', labelKey: 'OnHand', icon: 'fa-solid fa-check-circle', color: 'success'},
    {key: 'shopping', labelKey: 'Shopping', icon: 'fa-solid fa-cart-shopping', color: 'info'},
    {key: 'ignored', labelKey: 'IgnoreShopping', icon: 'fa-solid fa-ban', color: 'warning'},
]

/**
 * List settings for the Food model.
 */
export const FOOD_LIST_SETTINGS: ListSettings = {
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
export const FOOD_SORT_OPTIONS: SortDef[] = [
    {key: 'name', labelKey: 'Name'},
    {key: 'numrecipe', labelKey: 'Recipes', defaultDescending: true},
    {key: 'numchild', labelKey: 'Children', defaultDescending: true},
    {key: 'supermarket_category__name', labelKey: 'Shopping_Category'},
]

export const FOOD_BATCH_ACTIONS: BatchAction[] = [
    {key: 'batchEdit', labelKey: 'BatchEdit', icon: 'fa-solid fa-list-check'},
]
