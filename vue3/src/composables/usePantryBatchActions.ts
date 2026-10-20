import {ApiApi, type InventoryEntry, type InventoryLocation} from '@/openapi'
import {useShoppingActions} from '@/composables/useShoppingActions'

/** Run one call per item without letting a single failure stop the rest; returns how many succeeded/failed. */
async function settleAll<T>(items: T[], run: (item: T) => Promise<unknown>): Promise<{ok: number, failed: number}> {
    const results = await Promise.allSettled(items.map(run))
    const ok = results.filter(r => r.status === 'fulfilled').length
    return {ok, failed: results.length - ok}
}

/**
 * Batch actions over a selection of pantry lots. There is no batch endpoint for lots, so each lot
 * is patched on its own (a partial update, never a full PUT) — a location move therefore still
 * gets its per-lot history row and freezer/thaw expiry recompute server-side.
 */
export function usePantryBatchActions() {
    /** Add each distinct food among the lots to the shopping list, skipping foods already on it. */
    async function addFoodsToShopping(lots: InventoryEntry[]): Promise<{added: number, alreadyListed: number, failed: number}> {
        const foods = [...new Map(lots.map(l => [l.food.id!, l.food])).values()]
        const {addToShoppingIfNotListed} = useShoppingActions()
        let added = 0
        let alreadyListed = 0
        const {failed} = await settleAll(foods, async food => {
            if (await addToShoppingIfNotListed({id: food.id!, name: food.name})) added++
            else alreadyListed++
        })
        return {added, alreadyListed, failed}
    }

    /** Move every selected lot that is not already at the location. */
    async function moveLots(lots: InventoryEntry[], location: InventoryLocation): Promise<{updated: number, failed: number}> {
        const api = new ApiApi()
        const toMove = lots.filter(l => l.inventoryLocation.id !== location.id)
        const {ok, failed} = await settleAll(toMove, lot =>
            api.apiInventoryEntryPartialUpdate({id: lot.id!, patchedInventoryEntry: {inventoryLocation: location}}))
        return {updated: ok, failed}
    }

    /** Set (or, with null, clear) the expiry of every selected lot. The day is sent at local noon like the Add/Edit forms. */
    async function setLotsExpiry(lots: InventoryEntry[], date: Date | null): Promise<{updated: number, failed: number}> {
        const api = new ApiApi()
        const expires = date ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12) : null
        const {ok, failed} = await settleAll(lots, lot =>
            api.apiInventoryEntryPartialUpdate({id: lot.id!, patchedInventoryEntry: {expires}}))
        return {updated: ok, failed}
    }

    return {addFoodsToShopping, moveLots, setLotsExpiry}
}
