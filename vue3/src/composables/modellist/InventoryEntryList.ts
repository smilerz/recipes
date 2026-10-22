/**
 * Filter definitions for the pantry (inventory entry list). Same vocabulary as the Food list; each
 * key is the camelCase form of a query parameter on /api/inventory-entry/. The inventory location
 * is picked in the page header, not here.
 */

import type {FilterDef} from './types'

export const INVENTORY_ENTRY_FILTER_DEFS: FilterDef[] = [
    // search by name, and pick a food (a parent shows its children too)
    {key: 'query', labelKey: 'Search', type: 'text', icon: 'fa-solid fa-magnifying-glass'},
    {key: 'foodId', labelKey: 'Food', type: 'model-select', icon: 'fa-solid fa-carrot', modelName: 'Food'},
    {key: 'inShoppingList', labelKey: 'Shopping', type: 'tristate', icon: 'fa-solid fa-cart-shopping', group: 'Status'},
    {key: 'hasRecipe', labelKey: 'Recipe', type: 'tristate', icon: 'fa-solid fa-book', group: 'Attributes'},
    {key: 'supermarketCategory', labelKey: 'Category', type: 'model-select', icon: 'fa-solid fa-boxes-stacked', modelName: 'SupermarketCategory', group: 'Attributes'},
    {key: 'expired', labelKey: 'Expired', type: 'tristate', icon: 'fa-solid fa-calendar-xmark', group: 'Inventory'},
    {key: 'expiringSoon', labelKey: 'ExpiringSoon', type: 'number', icon: 'fa-solid fa-clock', defaultValue: '3', suffixKey: 'Days', group: 'Inventory'},
]
