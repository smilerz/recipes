import {computed, ref} from 'vue'
import {DateTime} from 'luxon'
import {ApiApi, type Food, type InventoryEntry, type InventoryLocation, type PatchedInventoryEntry, type Unit} from '@/openapi'
import type {TranslateFunc} from '@/composables/modellist/types'
import {ErrorMessageType, MessageType, PreparedMessage, type StructuredMessage, useMessageStore} from '@/stores/MessageStore'
import {useUserPreferenceStore} from '@/stores/UserPreferenceStore'

export interface UseInventoryEntryFormOptions {
    onAdded?: (entry: InventoryEntry) => void
    onEdited?: (entry: InventoryEntry) => void
    onNoChange?: () => void
    /** Fires once an API call was actually attempted (success or failure) — for addInventory that's
     * always; for editInventory that's only when the diff was non-empty, never on the no-op path. */
    onSettled?: () => void
    /** Fires at the end of copyConfirmEntry(), after the copied fields have been applied. */
    onCopied?: () => void
}

/**
 * Single-entry Add/Edit/Consume form state and save logic, shared by PantryBookingDialog.vue and
 * InventoryBookingPage.vue — previously reimplemented independently in both, unsynchronized. What
 * happens after a save (close a dialog, open a confirm step, refresh a table) is genuinely
 * host-specific and stays with each caller via the onAdded/onEdited/onNoChange callbacks.
 */
export function useInventoryEntryForm(t: TranslateFunc, options: UseInventoryEntryFormOptions = {}) {
    const formLoading = ref(false)
    const editTab = ref<'amount' | 'location'>('amount')
    const food = ref<Food | null>(null)
    const inventoryEntry = ref<InventoryEntry | null>(null)
    const inventoryLocation = ref<InventoryLocation | null>(null)
    const subLocation = ref<string | undefined>('')
    const code = ref('')
    const amount = ref<number | undefined>(1)
    const unit = ref<Unit | undefined | null>(useUserPreferenceStore().defaultUnitObj)
    const expires = ref<Date | undefined>(undefined)

    // tracked so the Amount tab can show an "In Stock: X → Y" before/after caption (#2), matching
    // UseUpDialog's absolute-value editing pattern
    const entryOriginalAmount = ref<number | undefined>(undefined)
    const entryOriginalUnit = ref<Unit | undefined | null>(undefined)
    const amountChanged = computed(() => amount.value !== entryOriginalAmount.value || unit.value !== entryOriginalUnit.value)

    const commonUnits = ref<Unit[]>([])

    // Post-Add confirm/copy step: after a successful Add, the caller offers a "copy these fields
    // into a new entry" shortcut (e.g. adding several lots of the same food to different locations).
    const bookingConfirmEntry = ref<InventoryEntry | null>(null)
    const copyOptions = [
        {value: 'food', title: t('Food')},
        {value: 'inventoryLocation', title: t('InventoryLocation')},
        {value: 'amount', title: t('Amount')},
        {value: 'unit', title: t('Unit')},
        {value: 'expires', title: t('Expires')},
        {value: 'subLocation', title: t('SubLocation')},
    ]
    const selectedCopyOptions = ref<string[]>(['food', 'inventoryLocation', 'amount', 'unit', 'expires', 'subLocation'])

    /** Most-used units across the space's current inventory, for the Unit field's quick-pick chips. */
    function loadCommonUnits() {
        const api = new ApiApi()
        api.apiInventoryEntryList({pageSize: 100}).then(r => {
            const counts = new Map<number, {unit: Unit, count: number}>()
            r.results.forEach(entry => {
                if (entry.unit) {
                    const u = entry.unit
                    const count = counts.get(u.id!) || {unit: u, count: 0}
                    count.count++
                    counts.set(u.id!, count)
                }
            })
            commonUnits.value = Array.from(counts.values())
                .sort((a, b) => b.count - a.count)
                .slice(0, 5)
                .map(c => c.unit)
        }).catch(err => {
            useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
        })
    }

    /** Add a new inventory entry. */
    function addInventory() {
        const api = new ApiApi()
        formLoading.value = true

        // set time to noon because ISO string conversion might shift dates instead of just cutting of time
        if (expires.value) {
            expires.value.setHours(12, 0, 0, 0)
        }

        const newEntry = {
            food: food.value,
            inventoryLocation: inventoryLocation.value,
            subLocation: subLocation.value,
            amount: amount.value,
            unit: unit.value,
            expires: expires.value,
            code: code.value,
        } as InventoryEntry

        return api.apiInventoryEntryCreate({inventoryEntry: newEntry}).then(r => {
            useMessageStore().addPreparedMessage(PreparedMessage.CREATE_SUCCESS)
            bookingConfirmEntry.value = r
            options.onAdded?.(r)
        }).catch(err => {
            useMessageStore().addError(ErrorMessageType.CREATE_ERROR, err)
        }).finally(() => {
            formLoading.value = false
            options.onSettled?.()
        })
    }

    /**
     * Directly correct an existing lot (#2) — Remove, Move, and the original #9 amount/unit Edit
     * were three separate modes with duplicated "which fields changed" PATCH logic; a single Save
     * now patches whichever fields actually changed, on either the Amount or Location tab. Never a
     * full PUT: that would resend the old `expires` and permanently defeat the backend's freeze/
     * thaw recompute (caller_set_expires) on a genuine freezer<->fridge move.
     */
    function editInventory() {
        const api = new ApiApi()
        if (inventoryEntry.value == null) return Promise.resolve()

        const expiresBeforeEdit = inventoryEntry.value.expires

        const patch: PatchedInventoryEntry = {}
        if (amount.value != null && inventoryEntry.value.amount !== amount.value) {
            patch.amount = amount.value
        }
        if (inventoryEntry.value.unit !== unit.value) {
            patch.unit = unit.value ?? null
        }
        if (inventoryLocation.value != null && inventoryEntry.value.inventoryLocation != inventoryLocation.value) {
            patch.inventoryLocation = inventoryLocation.value
        }
        if (subLocation.value != null && inventoryEntry.value.subLocation != subLocation.value) {
            patch.subLocation = subLocation.value
        }

        if (Object.keys(patch).length === 0) {
            options.onNoChange?.()
            return Promise.resolve()
        }

        formLoading.value = true
        return api.apiInventoryEntryPartialUpdate({id: inventoryEntry.value.id!, patchedInventoryEntry: patch}).then(r => {
            useMessageStore().addPreparedMessage(PreparedMessage.UPDATE_SUCCESS)
            if (r.expires && (r.expires?.getTime() ?? null) !== (expiresBeforeEdit?.getTime() ?? null)) {
                useMessageStore().addMessage(MessageType.INFO,
                    {title: t('Expires'), text: t('OpenedExpiryUpdated', {date: DateTime.fromJSDate(r.expires).toLocaleString(DateTime.DATE_MED)})} as StructuredMessage,
                    4000)
            }
            options.onEdited?.(r)
        }).catch(err => {
            useMessageStore().addError(ErrorMessageType.UPDATE_ERROR, err)
        }).finally(() => {
            formLoading.value = false
            options.onSettled?.()
        })
    }

    /** When an inventory entry is selected, fill the form with its current values. */
    function inventoryEntrySelected() {
        if (inventoryEntry.value) {
            food.value = inventoryEntry.value.food
            unit.value = inventoryEntry.value.unit
            // Pre-populate with the entry's own current values — reconsidered post-UAT from an
            // earlier "starts blank" design (judged counter-intuitive). This also structurally
            // prevents a previously-selected entry's Location from leaking into this one: a dirty
            // check against `inventoryEntry` compares against whatever is currently loaded here,
            // which is now always this entry's own data, never a stale value from a different entry.
            inventoryLocation.value = inventoryEntry.value.inventoryLocation
            subLocation.value = inventoryEntry.value.subLocation ?? ''
            amount.value = inventoryEntry.value.amount
            entryOriginalAmount.value = inventoryEntry.value.amount
            entryOriginalUnit.value = inventoryEntry.value.unit
            editTab.value = 'amount'
        }
    }

    /** Reset the form to its defaults. Food/Location are independently preserved on request, for a
     * caller offering "keep this field for the next entry" shortcuts after a successful Add. */
    function resetForm(resetFood: boolean = true, resetInventoryLocation: boolean = true) {
        if (resetFood) {
            food.value = null
        }
        if (resetInventoryLocation) {
            inventoryLocation.value = null
        }
        inventoryEntry.value = null
        subLocation.value = ''
        amount.value = 1
        unit.value = useUserPreferenceStore().defaultUnitObj
        expires.value = undefined
        code.value = ''
        editTab.value = 'amount'
        entryOriginalAmount.value = undefined
        entryOriginalUnit.value = undefined
    }

    /** Copy the selected fields from bookingConfirmEntry onto a freshly-reset form, ready to Add
     * another entry (e.g. the same food into a different location). */
    function copyConfirmEntry() {
        resetForm()

        if (bookingConfirmEntry.value == null) {
            return
        }
        if (selectedCopyOptions.value.includes('food')) {
            food.value = bookingConfirmEntry.value.food
        }
        if (selectedCopyOptions.value.includes('inventoryLocation')) {
            inventoryLocation.value = bookingConfirmEntry.value.inventoryLocation
        }
        if (selectedCopyOptions.value.includes('amount')) {
            amount.value = bookingConfirmEntry.value.amount
        }
        if (selectedCopyOptions.value.includes('unit')) {
            unit.value = bookingConfirmEntry.value.unit
        }
        if (selectedCopyOptions.value.includes('expires')) {
            expires.value = bookingConfirmEntry.value.expires ?? undefined
        }
        if (selectedCopyOptions.value.includes('subLocation')) {
            subLocation.value = bookingConfirmEntry.value.subLocation ?? undefined
        }

        options.onCopied?.()
    }

    return {
        formLoading, editTab, food, inventoryEntry, inventoryLocation, subLocation, code, amount, unit, expires,
        entryOriginalAmount, entryOriginalUnit, amountChanged, commonUnits,
        bookingConfirmEntry, copyOptions, selectedCopyOptions,
        loadCommonUnits, addInventory, editInventory, inventoryEntrySelected, resetForm, copyConfirmEntry,
    }
}
