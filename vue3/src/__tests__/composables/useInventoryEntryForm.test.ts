/**
 * Extracted from PantryBookingDialog.vue / InventoryBookingPage.vue (Phase 1 of the
 * chips-consolidation follow-up): both surfaces independently reimplemented the same single-entry
 * Add/Edit form state and save logic, unsynchronized — two of this session's own fixes (Consume
 * button, location pre-population) each had to land twice. This composable is the single source
 * of that logic; each host wires its own post-save UX via the onAdded/onEdited/onNoChange options.
 */
import {describe, it, expect, vi, beforeEach} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {ref} from 'vue'
import {apiMock, resetApiMock} from '../api-mock'

vi.mock('vue-router', () => ({
    useRoute: () => ({query: {}}),
    useRouter: () => ({push: vi.fn(), replace: vi.fn()}),
}))
vi.mock('@vueuse/router', () => ({useRouteQuery: (_k: string, d: any) => ref(d)}))
vi.mock('@vueuse/core', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    useStorage: (_k: string, d: any) => ref(d),
    useClipboard: () => ({copy: vi.fn(), copied: ref(false)}),
    useWakeLock: () => ({request: vi.fn(), release: vi.fn()}),
}))
vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    ApiApi: class { constructor() { return apiMock } },
}))

const {addMessageMock, addErrorMock, addPreparedMessageMock} = vi.hoisted(() => ({
    addMessageMock: vi.fn(), addErrorMock: vi.fn(), addPreparedMessageMock: vi.fn(),
}))
vi.mock('@/stores/MessageStore', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    useMessageStore: () => ({addMessage: addMessageMock, addError: addErrorMock, addPreparedMessage: addPreparedMessageMock}),
}))

import {useInventoryEntryForm} from '@/composables/useInventoryEntryForm'

const t = (k: string) => k

describe('useInventoryEntryForm', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        resetApiMock()
        addMessageMock.mockClear()
        addErrorMock.mockClear()
        addPreparedMessageMock.mockClear()
    })

    it('starts with the established defaults (amount 1, empty subLocation/code)', () => {
        const form = useInventoryEntryForm(t)
        expect(form.amount.value).toBe(1)
        expect(form.subLocation.value).toBe('')
        expect(form.code.value).toBe('')
        expect(form.food.value).toBeNull()
        expect(form.inventoryLocation.value).toBeNull()
    })

    it('addInventory() creates the entry and calls onAdded with the result', async () => {
        const created = {id: 9, food: {id: 1, name: 'Rice'}, amount: 2}
        apiMock.apiInventoryEntryCreate.mockResolvedValue(created)
        const onAdded = vi.fn()
        const form = useInventoryEntryForm(t, {onAdded})

        form.food.value = {id: 1, name: 'Rice'} as any
        form.amount.value = 2
        await form.addInventory()

        expect(apiMock.apiInventoryEntryCreate).toHaveBeenCalledWith(
            expect.objectContaining({inventoryEntry: expect.objectContaining({food: {id: 1, name: 'Rice'}, amount: 2})}),
        )
        expect(onAdded).toHaveBeenCalledWith(created)
        expect(addPreparedMessageMock).toHaveBeenCalled()
    })

    it('addInventory() surfaces an error and does not call onAdded on failure', async () => {
        apiMock.apiInventoryEntryCreate.mockRejectedValue(new Error('boom'))
        const onAdded = vi.fn()
        const form = useInventoryEntryForm(t, {onAdded})

        await form.addInventory()

        expect(onAdded).not.toHaveBeenCalled()
        expect(addErrorMock).toHaveBeenCalled()
    })

    it('editInventory() sends only the changed fields, never a full PUT', async () => {
        const entry = {
            id: 7, food: {id: 1, name: 'Flour'}, unit: {id: 1, name: 'g'}, amount: 2,
            inventoryLocation: {id: 1, name: 'Pantry', isFreezer: false}, expires: new Date('2027-01-01'), subLocation: '',
        }
        const onEdited = vi.fn()
        const form = useInventoryEntryForm(t, {onEdited})
        form.inventoryEntry.value = entry as any
        form.inventoryEntrySelected()

        form.amount.value = 5
        apiMock.apiInventoryEntryPartialUpdate.mockResolvedValue({...entry, amount: 5})
        await form.editInventory()

        expect(apiMock.apiInventoryEntryUpdate).not.toHaveBeenCalled()
        expect(apiMock.apiInventoryEntryPartialUpdate).toHaveBeenCalledTimes(1)
        const [call] = apiMock.apiInventoryEntryPartialUpdate.mock.calls
        expect(call[0].id).toBe(7)
        expect(call[0].patchedInventoryEntry).toEqual({amount: 5})
        expect(onEdited).toHaveBeenCalled()
    })

    it('editInventory() calls onNoChange and makes no API call when nothing changed', async () => {
        const entry = {
            id: 7, food: {id: 1, name: 'Flour'}, unit: {id: 1, name: 'g'}, amount: 2,
            inventoryLocation: {id: 1, name: 'Pantry', isFreezer: false}, expires: new Date('2027-01-01'), subLocation: '',
        }
        const onNoChange = vi.fn()
        const form = useInventoryEntryForm(t, {onNoChange})
        form.inventoryEntry.value = entry as any
        form.inventoryEntrySelected()

        await form.editInventory()

        expect(apiMock.apiInventoryEntryPartialUpdate).not.toHaveBeenCalled()
        expect(onNoChange).toHaveBeenCalled()
    })

    // onSettled must mirror the pre-composable behavior precisely: addInventory always attempts
    // the API call, so it always fires; editInventory's zero-diff no-op never made an API call at
    // all originally, so onSettled must NOT fire there — only onNoChange should.
    it('onSettled fires after addInventory always, but after editInventory only when a call was made', async () => {
        const onSettled = vi.fn()
        apiMock.apiInventoryEntryCreate.mockResolvedValue({id: 1})
        const addForm = useInventoryEntryForm(t, {onSettled})
        await addForm.addInventory()
        expect(onSettled).toHaveBeenCalledTimes(1)

        const entry = {
            id: 7, food: {id: 1, name: 'Flour'}, unit: {id: 1, name: 'g'}, amount: 2,
            inventoryLocation: {id: 1, name: 'Pantry', isFreezer: false}, expires: new Date('2027-01-01'), subLocation: '',
        }
        const editForm = useInventoryEntryForm(t, {onSettled})
        editForm.inventoryEntry.value = entry as any
        editForm.inventoryEntrySelected()
        await editForm.editInventory()  // no fields changed — no API call attempted
        expect(onSettled).toHaveBeenCalledTimes(1)  // unchanged — still just the add above

        editForm.amount.value = 9
        apiMock.apiInventoryEntryPartialUpdate.mockResolvedValue({...entry, amount: 9})
        await editForm.editInventory()
        expect(onSettled).toHaveBeenCalledTimes(2)
    })

    it('inventoryEntrySelected() pre-populates location/subLocation with the entry\'s own current values', () => {
        const entry = {
            id: 7, food: {id: 1, name: 'Flour'}, unit: {id: 1, name: 'g'}, amount: 2,
            inventoryLocation: {id: 1, name: 'Pantry', isFreezer: false}, expires: new Date('2027-01-01'), subLocation: 'Top Shelf',
        }
        const form = useInventoryEntryForm(t)
        form.inventoryEntry.value = entry as any
        form.inventoryEntrySelected()

        expect(form.inventoryLocation.value).toEqual(entry.inventoryLocation)
        expect(form.subLocation.value).toBe('Top Shelf')
        expect(form.amount.value).toBe(2)
        expect(form.entryOriginalAmount.value).toBe(2)
        expect(form.amountChanged.value).toBe(false)
    })

    it('resetForm() clears the form back to defaults', () => {
        const form = useInventoryEntryForm(t)
        form.food.value = {id: 1, name: 'Rice'} as any
        form.inventoryLocation.value = {id: 1, name: 'Pantry'} as any
        form.amount.value = 9
        form.subLocation.value = 'Shelf'

        form.resetForm()

        expect(form.food.value).toBeNull()
        expect(form.inventoryLocation.value).toBeNull()
        expect(form.amount.value).toBe(1)
        expect(form.subLocation.value).toBe('')
    })

    it('resetForm(false, false) preserves food and location, per the caller\'s choice', () => {
        const form = useInventoryEntryForm(t)
        form.food.value = {id: 1, name: 'Rice'} as any
        form.inventoryLocation.value = {id: 1, name: 'Pantry'} as any
        form.amount.value = 9

        form.resetForm(false, false)

        expect(form.food.value).toEqual({id: 1, name: 'Rice'})
        expect(form.inventoryLocation.value).toEqual({id: 1, name: 'Pantry'})
        expect(form.amount.value).toBe(1)
    })

    // Post-Add confirm/copy step, extracted from PantryBookingDialog.vue (previously duplicated
    // separately, in a 3-preset-button shape, in InventoryBookingPage.vue).
    it('addInventory() sets bookingConfirmEntry to the created entry', async () => {
        const created = {id: 9, food: {id: 1, name: 'Rice'}, amount: 2}
        apiMock.apiInventoryEntryCreate.mockResolvedValue(created)
        const form = useInventoryEntryForm(t)

        expect(form.bookingConfirmEntry.value).toBeNull()
        await form.addInventory()

        expect(form.bookingConfirmEntry.value).toEqual(created)
    })

    it('copyOptions lists every copyable field', () => {
        const form = useInventoryEntryForm(t)
        const values = form.copyOptions.map((o: any) => o.value)
        expect(values).toEqual(['food', 'inventoryLocation', 'amount', 'unit', 'expires', 'subLocation'])
    })

    it('selectedCopyOptions defaults to every field selected', () => {
        const form = useInventoryEntryForm(t)
        expect(form.selectedCopyOptions.value).toEqual(['food', 'inventoryLocation', 'amount', 'unit', 'expires', 'subLocation'])
    })

    it('copyConfirmEntry() resets the form, then copies only the selected fields from bookingConfirmEntry, and calls onCopied', async () => {
        const created = {
            id: 9, food: {id: 1, name: 'Rice'}, inventoryLocation: {id: 2, name: 'Freezer', isFreezer: true},
            amount: 3, unit: {id: 1, name: 'g'}, expires: new Date('2027-01-01'), subLocation: 'Top Shelf',
        }
        apiMock.apiInventoryEntryCreate.mockResolvedValue(created)
        const onCopied = vi.fn()
        const form = useInventoryEntryForm(t, {onCopied})
        await form.addInventory()

        form.selectedCopyOptions.value = ['food', 'amount']
        form.copyConfirmEntry()

        expect(form.food.value).toEqual(created.food)
        expect(form.amount.value).toBe(3)
        expect(form.inventoryLocation.value).toBeNull()
        expect(form.unit.value).toBeNull()
        expect(form.expires.value).toBeUndefined()
        expect(form.subLocation.value).toBe('')
        expect(onCopied).toHaveBeenCalled()
    })

    it('copyConfirmEntry() does nothing when bookingConfirmEntry is not set', () => {
        const form = useInventoryEntryForm(t)
        form.food.value = {id: 1, name: 'Rice'} as any

        form.copyConfirmEntry()

        // resetForm() still runs (it's unconditional), only the copy step is skipped
        expect(form.food.value).toBeNull()
    })
})
