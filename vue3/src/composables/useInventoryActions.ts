import {unref} from 'vue'
import {DateTime} from 'luxon'
import type {ActionConfirmEntry} from '@/components/dialogs/ActionConfirmDialog.vue'
import type {InventoryQuickAddResult} from '@/components/dialogs/InventoryQuickAddDialog.vue'
import type {ActionConfirmDialogInstance, FoodRef, TranslateFunc} from '@/composables/modellist/types'
import {ApiApi, type Food, type InventoryEntry, type InventoryLocation, type Unit} from '@/openapi'
import {ErrorMessageType, MessageType, useMessageStore} from '@/stores/MessageStore'
import {useUserPreferenceStore} from '@/stores/UserPreferenceStore'
import {isoDateToApiDate} from '@/utils/pantry_utils'

const api = new ApiApi()

/**
 * FR-D6: surface an add-to-pantry, including the (possibly auto-set) expiry, so the date is never
 * silent. Shared by every client add path (quick-add and the manage dialog).
 */
export function announcePantryAdd(foodName: string, expires: Date | null | undefined, t: TranslateFunc) {
    const title = t('AddedToPantry', {food: foodName})
    const text = expires ? t('ExpiresOn', {date: DateTime.fromJSDate(expires).toLocaleString(DateTime.DATE_MED)}) : ''
    useMessageStore().addMessage(MessageType.SUCCESS, {title, text}, 6000)
}

export type InventoryLocationRef = {
    id: number
    name: string
    household: {id: number, name: string}
    isFreezer?: boolean
}

/** Instance type for InventoryQuickAddDialog template ref. */
export type InventoryQuickAddDialogInstance = {
    open: (opts: {
        title: string,
        locations: {value: number, label: string, isFreezer?: boolean}[],
        defaultLocationId?: number | null,
        amount?: number,
        unit?: Unit | null,
        shelfLifeDays?: number | null,
        shelfLifeDaysFrozen?: number | null,
    }) => Promise<InventoryQuickAddResult | null>
    openManage: (opts: {
        title: string,
        foodId: number,
        foodName: string,
        locations: {value: number, label: string, household?: {id: number, name: string}, isFreezer?: boolean}[],
        defaultLocationId?: number | null,
        amount?: number,
        unit?: Unit | null,
        shelfLifeDays?: number | null,
        shelfLifeDaysFrozen?: number | null,
    }) => Promise<{hasEntries: boolean}>
}

export function useInventoryActions() {
    /**
     * Add a food to inventory at the given location.
     * On 400/404 (stale location), clears the saved default and throws.
     */
    async function addToInventory(food: FoodRef, location: InventoryLocationRef, amount: number = 1, unit?: Unit | null, expires?: string | null): Promise<InventoryEntry> {
        const store = useUserPreferenceStore()
        try {
            return await api.apiInventoryEntryCreate({
                inventoryEntry: {
                    food: {id: food.id, name: food.name} as Food,
                    inventoryLocation: {id: location.id, name: location.name, household: location.household} as InventoryLocation,
                    // TODO: regenerate OpenAPI schema — serializer now accepts null
                    unit: (unit ?? null) as any,
                    amount,
                    // UTC midnight — the client wire format truncates toISOString (DEFECT-01 class)
                    expires: expires ? isoDateToApiDate(expires) : null,
                },
            })
        } catch (err: any) {
            if (err?.response?.status === 400 || err?.response?.status === 404) {
                store.deviceSettings.food_defaultInventoryLocation = null
            }
            throw err
        }
    }

    /**
     * Open a quick-add dialog for inventory with location, amount, and unit fields.
     * Pre-fills from caller context (e.g. ingredient amount/unit).
     * Saves selected location as the default for future use.
     * Returns true if entry was created, false if cancelled or no locations exist.
     */
    async function quickAddToInventory(
        food: FoodRef,
        dialog: InventoryQuickAddDialogInstance,
        t: TranslateFunc,
        defaults?: {amount?: number, unit?: Unit | null},
    ): Promise<boolean> {
        const store = useUserPreferenceStore()

        let locations: InventoryLocationRef[]
        try {
            const result = await api.apiInventoryLocationList({pageSize: 100})
            locations = (result.results ?? []).filter(l => l.id != null).map(l => ({
                id: l.id!,
                name: l.name,
                household: {id: l.household.id!, name: l.household.name},
                isFreezer: l.isFreezer ?? false,
            }))
        } catch (err) {
            useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
            return false
        }

        if (locations.length === 0) {
            useMessageStore().addError(ErrorMessageType.CREATE_ERROR, t('NoInventoryLocations'))
            return false
        }

        const saved = getDefaultLocation()
        const dialogResult = await dialog.open({
            title: t('AddToInventory', {name: food.name}),
            locations: locations.map(l => ({value: l.id, label: l.name, isFreezer: l.isFreezer})),
            defaultLocationId: saved?.id ?? null,
            amount: defaults?.amount ?? 1,
            unit: defaults?.unit ?? null,
            shelfLifeDays: food.shelfLifeDays,
            shelfLifeDaysFrozen: food.shelfLifeDaysFrozen,
        })

        if (!dialogResult) return false

        const selectedLoc = locations.find(l => l.id === dialogResult.locationId)
        if (!selectedLoc) return false

        // Save selected location as default
        store.deviceSettings.food_defaultInventoryLocation = {
            id: selectedLoc.id,
            name: selectedLoc.name,
            household: selectedLoc.household,
        } as InventoryLocationRef

        try {
            const created = await addToInventory(food, selectedLoc, dialogResult.amount, dialogResult.unit, dialogResult.expires)
            announcePantryAdd(food.name, created?.expires, t)  // FR-D6
            return true
        } catch (err) {
            useMessageStore().addError(ErrorMessageType.CREATE_ERROR, err)
            return false
        }
    }

    /**
     * One-tap "＋ pantry" from a checked-off shopping row (FR-H3): add the food at the saved default
     * (or first) location and surface the expiry (FR-D6). When no location exists yet, route through
     * the stock-up endpoint so the backend auto-creates the household's default "Pantry". Returns
     * true on success. Only the presence toast — check-off undo stays on the shopping undo stack.
     */
    async function quickPantryAdd(food: FoodRef, t: TranslateFunc): Promise<boolean> {
        try {
            const result = await api.apiInventoryLocationList({pageSize: 100})
            // lowest id first mirrors the server's default-location pick (FR-B5)
            const locations = (result.results ?? []).filter(l => l.id != null).sort((a, b) => a.id! - b.id!)
            if (locations.length === 0) {
                // no locations yet — stock-up lets the backend resolve/create the default location
                await api.apiInventoryEntryStockUpCreate({stockUp: {items: [{food: food.id, amount: 1}]}})
                announcePantryAdd(food.name, null, t)
                return true
            }
            const saved = getDefaultLocation()
            const loc = saved ?? {
                id: locations[0].id!,
                name: locations[0].name,
                household: {id: locations[0].household.id!, name: locations[0].household.name},
            }
            const created = await addToInventory(food, loc)
            announcePantryAdd(food.name, created?.expires, t)  // FR-D6
            return true
        } catch (err) {
            useMessageStore().addError(ErrorMessageType.CREATE_ERROR, err)
            return false
        }
    }

    /**
     * Remove a food from inventory with selectable confirmation dialog.
     * Shows inventory entries with checkboxes, deletes selected on confirm.
     * Returns true if any entries were deleted.
     */
    async function removeFromInventory(food: FoodRef, confirmDialog: ActionConfirmDialogInstance, t: TranslateFunc): Promise<boolean> {
        const confirmPromise = confirmDialog.open({
            title: t('Confirm'),
            message: t('RemoveFromInventoryConfirm', {name: food.name}),
            loading: true,
            selectable: true,
            confirmLabel: t('Remove'),
            confirmColor: 'warning',
            confirmIcon: '$pantry',
        })

        try {
            const result = await api.apiInventoryEntryList({foodId: food.id, pageSize: 100})
            const invEntries = result.results ?? []
            const entries: ActionConfirmEntry[] = invEntries.map((e: InventoryEntry) => {
                const parts: string[] = []
                if (e.amount) parts.push(String(e.amount))
                if (e.unit?.name) parts.push(e.unit.name)
                const text = parts.length > 0 ? parts.join(' ') : t('Pantry')
                const subtextParts: string[] = []
                if (e.inventoryLocation?.name) subtextParts.push(e.inventoryLocation.name)
                if (e.createdAt) subtextParts.push(new Date(e.createdAt).toLocaleString())
                return {id: e.id!, text, subtext: subtextParts.join(' · ') || undefined, icon: '$pantry'} as ActionConfirmEntry
            })
            confirmDialog.setEntries(entries)
        } catch {
            confirmDialog.setEntries([])
        }

        const confirmed = (await confirmPromise) ?? false
        if (!confirmed) return false

        // unref handles both raw arrays (template ref auto-unwrap) and ComputedRef
        const idsToDelete = unref(confirmDialog.selectedEntryIds)
        const results = await Promise.allSettled(
            idsToDelete.map(id => api.apiInventoryEntryDestroy({id}))
        )
        const failures = results.filter(r => r.status === 'rejected')
        if (failures.length > 0) {
            useMessageStore().addError(ErrorMessageType.DELETE_ERROR, new Error(`Failed to remove ${failures.length} entries`))
        }
        return failures.length < idsToDelete.length
    }

    /**
     * Ensure a default inventory location is saved in device settings.
     * Returns true if a location is available, false otherwise.
     */
    async function ensureDefaultLocation(confirmDialog: ActionConfirmDialogInstance, t: TranslateFunc): Promise<boolean> {
        const store = useUserPreferenceStore()
        let saved = store.deviceSettings.food_defaultInventoryLocation as InventoryLocationRef | null

        // Clear stale refs saved before household was included
        if (saved && !saved.household) {
            store.deviceSettings.food_defaultInventoryLocation = null
            saved = null
        }
        if (saved) return true

        try {
            const result = await api.apiInventoryLocationList({pageSize: 100})
            const locations = result.results ?? []

            if (locations.length === 0) {
                await confirmDialog.open({
                    title: t('Pantry'),
                    message: t('NoInventoryLocations'),
                    confirmLabel: t('OK'),
                })
                return false
            }

            if (locations.length === 1) {
                store.deviceSettings.food_defaultInventoryLocation = {
                    id: locations[0].id!,
                    name: locations[0].name,
                    household: {id: locations[0].household.id!, name: locations[0].household.name},
                } as InventoryLocationRef
                return true
            }

            // Multiple locations — prompt user to select
            const confirmPromise = confirmDialog.open({
                title: t('SelectDefaultLocation'),
                message: t('SelectDefaultLocationMessage'),
                loading: true,
                confirmLabel: t('Confirm'),
                confirmColor: 'primary',
                confirmIcon: 'fa-solid fa-location-dot',
            })
            confirmDialog.setSelectOptions(locations.map(l => ({value: l.id!, label: l.name})))
            const confirmed = (await confirmPromise) ?? false
            const selectedVal = unref(confirmDialog.selectedValue)
            if (confirmed && selectedVal != null) {
                const selected = locations.find(l => l.id === selectedVal)
                if (selected) {
                    store.deviceSettings.food_defaultInventoryLocation = {
                        id: selected.id!,
                        name: selected.name,
                        household: {id: selected.household.id!, name: selected.household.name},
                    } as InventoryLocationRef
                    return true
                }
            }
            return false
        } catch (err) {
            useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
            return false
        }
    }

    /**
     * Open a unified manage dialog that shows existing inventory entries for a food
     * and allows adding new ones or deleting existing ones.
     * Returns true if at least one entry exists when the dialog closes.
     */
    async function manageInventory(
        food: FoodRef,
        dialog: InventoryQuickAddDialogInstance,
        t: TranslateFunc,
        defaults?: {amount?: number, unit?: Unit | null},
    ): Promise<boolean> {
        let locations: InventoryLocationRef[]
        try {
            const result = await api.apiInventoryLocationList({pageSize: 100})
            locations = (result.results ?? []).filter(l => l.id != null).map(l => ({
                id: l.id!,
                name: l.name,
                household: {id: l.household.id!, name: l.household.name},
                isFreezer: l.isFreezer ?? false,
            }))
        } catch (err) {
            useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
            return false
        }

        if (locations.length === 0) {
            useMessageStore().addError(ErrorMessageType.CREATE_ERROR, t('NoInventoryLocations'))
            return false
        }

        const saved = getDefaultLocation()
        const result = await dialog.openManage({
            title: `${t('Pantry')}: ${food.name}`,
            foodId: food.id,
            foodName: food.name,
            locations: locations.map(l => ({value: l.id, label: l.name, household: l.household, isFreezer: l.isFreezer})),
            defaultLocationId: saved?.id ?? null,
            amount: defaults?.amount ?? 1,
            unit: defaults?.unit ?? null,
            shelfLifeDays: food.shelfLifeDays,
            shelfLifeDaysFrozen: food.shelfLifeDaysFrozen,
        })

        return result.hasEntries
    }

    /**
     * Get the currently saved default inventory location, or null.
     */
    function getDefaultLocation(): InventoryLocationRef | null {
        const store = useUserPreferenceStore()
        const saved = store.deviceSettings.food_defaultInventoryLocation as InventoryLocationRef | null
        if (saved && !saved.household) {
            store.deviceSettings.food_defaultInventoryLocation = null
            return null
        }
        return saved
    }

    /**
     * Restore a marked-out lot: put its amount back and remove the shopping entry the mark-out added.
     */
    async function undoMarkOut(entryId: number, amount: number, shoppingEntryId?: number): Promise<void> {
        try {
            // TODO: regenerate OpenAPI schema — PatchedInventoryEntry.amount accepts a plain number
            await api.apiInventoryEntryPartialUpdate({id: entryId, patchedInventoryEntry: {amount} as any})
            if (shoppingEntryId != null) {
                await api.apiShoppingListEntryDestroy({id: shoppingEntryId})
            }
        } catch (err) {
            useMessageStore().addError(ErrorMessageType.DELETE_ERROR, err)
        }
    }

    /**
     * Mark a pantry lot as used up and move its food to the shopping list (FR-A5):
     * zeroes the lot's amount so the InventoryLog records a remove (deleting would log nothing),
     * then adds the food to the shopping list. Shows an undo snackbar that restores the lot and
     * removes the shopping entry; `onChange` (e.g. a table reload) runs after an undo. Returns true
     * on success.
     */
    async function markOutToList(entry: {id: number, food: FoodRef, amount?: number, unit?: Unit | null}, t: TranslateFunc, onChange?: () => void): Promise<boolean> {
        const originalAmount = entry.amount ?? 1
        try {
            // TODO: regenerate OpenAPI schema — PatchedInventoryEntry.amount accepts a plain number
            await api.apiInventoryEntryPartialUpdate({id: entry.id, patchedInventoryEntry: {amount: 0} as any})
        } catch (err) {
            useMessageStore().addError(ErrorMessageType.UPDATE_ERROR, err)
            return false
        }
        try {
            const created = await api.apiShoppingListEntryCreate({
                shoppingListEntry: {food: {id: entry.food.id, name: entry.food.name}, amount: 1, unit: entry.unit ?? undefined} as any,
            })
            useMessageStore().addMessage(
                MessageType.SUCCESS,
                t('MovedToShoppingList', {name: entry.food.name}),
                6000,
                {},
                {
                    label: t('Undo'),
                    callback: async () => {
                        await undoMarkOut(entry.id, originalAmount, created?.id)
                        onChange?.()
                    },
                },
            )
            return true
        } catch (err) {
            // the lot was already zeroed — restore it so the food doesn't silently vanish
            // from on-hand inventory just because the shopping-list step failed
            await undoMarkOut(entry.id, originalAmount)
            useMessageStore().addError(ErrorMessageType.UPDATE_ERROR, err)
            return false
        }
    }

    /**
     * Check if a food has any inventory entries.
     */
    async function checkInventoryStatus(foodId: number): Promise<boolean> {
        try {
            const result = await api.apiInventoryEntryList({foodId, pageSize: 1})
            return (result.count ?? 0) > 0
        } catch {
            return false
        }
    }

    return {addToInventory, quickAddToInventory, quickPantryAdd, manageInventory, removeFromInventory, markOutToList, ensureDefaultLocation, getDefaultLocation, checkInventoryStatus}
}
