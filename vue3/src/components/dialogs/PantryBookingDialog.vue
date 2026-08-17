<template>
    <v-dialog max-width="900" v-model="dialog" activator="model">
        <v-card>

            <v-closable-card-title v-model="dialog" icon="fas fa-jar" :title="dialogTitle"></v-closable-card-title>

            <v-card-text>

                <v-row v-if="['add','remove','move','edit'].includes(bookingMode)">
                    <v-col>
                        <v-form>
                            <model-select model="InventoryEntry" :label="$t('InventoryEntry')" v-model="inventoryEntry" v-if="['remove','move','edit'].includes(bookingMode)"
                                          @update:modelValue="inventoryEntrySelected()">
                            </model-select>

                            <model-select model="Food" :label="$t('Food')" allow-create v-model="food" v-if="['add'].includes(bookingMode)"></model-select>

                            <model-select model="InventoryLocation" :label="$t('InventoryLocation')" v-model="inventoryLocation" v-if="['add','move'].includes(bookingMode)">
                                <template #append>
                                    <v-btn icon>
                                        <v-icon icon="$create"></v-icon>
                                        <model-edit-dialog model="InventoryLocation" @create="args => inventoryLocation = args"></model-edit-dialog>
                                    </v-btn>
                                </template>
                            </model-select>

                            <v-number-input :label="$t('Amount')" :precision="2" v-model="amount" v-if="['add', 'remove', 'edit'].includes(bookingMode)"></v-number-input>
                            <model-select model="Unit" :label="$t('Unit')" allow-create v-model="unit" v-if="['add', 'edit'].includes(bookingMode)" hide-details>
                                <template #append-inner>
                                    <v-chip v-for="u in commonUnits" :key="u.id" @click="unit = u" size="small" class="mr-1">
                                        {{ u.name }}
                                    </v-chip>
                                </template>
                            </model-select>
                            <v-chip-group v-if="['add'].includes(bookingMode)" class="mb-2">
                                <v-chip v-for="u in commonUnits" :key="u.id" @click="unit = u" size="small" class="mr-1">
                                    {{ u.name }}
                                </v-chip>
                            </v-chip-group>

                            <v-date-input :label="$t('Expires')" v-model="expires" v-if="['add'].includes(bookingMode)">
                                <template #append-inner>
                                    <v-btn variant="text" @click.stop="freezerExpiryDialog = true">
                                        <v-icon icon="fa-solid fa-snowflake"></v-icon>
                                        <freezer-expiry-dialog v-model:date="expires" v-model="freezerExpiryDialog"></freezer-expiry-dialog>
                                    </v-btn>
                                </template>
                            </v-date-input>

                            <v-text-field :label="$t('SubLocation')" :hint="$t('SubLocationHelp')" v-model="subLocation" v-if="['add','move'].includes(bookingMode)"></v-text-field>

                            <closable-help-alert :text="$t('CodeHelp')" class="mb-2"></closable-help-alert>
                            <v-text-field :label="$t('Code')" v-model="code" v-if="['add'].includes(bookingMode)"></v-text-field>

                            <v-btn block @click="save" prepend-icon="$save" color="save">{{ $t('Save') }}</v-btn>
                        </v-form>
                    </v-col>
                </v-row>
                <v-row v-if="['confirm'].includes(bookingMode) && bookingConfirmEntry != null">
                    <v-col>

                        <v-card variant="outlined">
                            <v-card-text>
                                <p>
                                    {{ ingredientToString({food: bookingConfirmEntry.food, unit: bookingConfirmEntry.unit, amount: bookingConfirmEntry.amount} as Ingredient) }}
                                </p>

                                <p class="text-disabled mt-4">{{ $t('Code') }}</p>
                                <p class="text-h3 text-pre">
                                    #{{ bookingConfirmEntry.code }}
                                </p>

                                <template v-if="bookingConfirmEntry.expires">
                                    <p class="text-disabled mt-4">{{ $t('Expires') }}</p>
                                    <p>
                                        <v-chip label :color="(bookingConfirmEntry.expires < DateTime.now() ? 'error' : 'success')">
                                            {{ DateTime.fromJSDate(bookingConfirmEntry.expires).toLocaleString(DateTime.DATE_MED) }}
                                        </v-chip>
                                    </p>
                                </template>

                            </v-card-text>
                        </v-card>

                        <p class="mt-10">

                            <v-select
                                v-model="selectedCopyOptions"
                                chips
                                :label="$t('Copy')"
                                :items="copyOptions"
                                multiple
                                hide-details
                            >
                            </v-select>
                            <v-btn class="" block color="success" prepend-icon="$copy" @click="copyConfirmEntry">{{ $t('Copy') }}</v-btn>
                            <v-btn class="mt-4" block color="info" prepend-icon="$close" @click="dialog = false; resetForm();">{{ $t('Close') }}</v-btn>

                        </p>

                    </v-col>
                </v-row>
            </v-card-text>

        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">

import VClosableCardTitle from "@/components/dialogs/VClosableCardTitle.vue";
import {DateTime} from "luxon";
import {ingredientToString} from "@/utils/model_utils.ts";
import {ApiApi, Food, Ingredient, InventoryEntry, InventoryLocation, PatchedInventoryEntry, Unit} from "@/openapi";
import FreezerExpiryDialog from "@/components/dialogs/FreezerExpiryDialog.vue";
import ClosableHelpAlert from "@/components/display/ClosableHelpAlert.vue";
import {VDateInput} from "vuetify/components";
import ModelEditDialog from "@/components/dialogs/ModelEditDialog.vue";
import ModelSelect from "@/components/inputs/ModelSelect.vue";
import {useI18n} from "vue-i18n";
import {computed, onMounted, ref, watch} from "vue";
import {useUserPreferenceStore} from "@/stores/UserPreferenceStore.ts";
import {ErrorMessageType, MessageType, PreparedMessage, StructuredMessage, useMessageStore} from "@/stores/MessageStore.ts";

const emits = defineEmits(['update'])

const dialog = defineModel<boolean>()
const props = defineProps<{
    bookingMode: string,
    inventoryEntryId?: number,
}>()

const {t} = useI18n()

// form
const formLoading = ref(false)
const freezerExpiryDialog = ref(false)

const bookingMode = ref('add')
const food = ref<Food | null>(null)
const inventoryEntry = ref<InventoryEntry | null>(null)
const inventoryLocation = ref<InventoryLocation | null>(null)
const subLocation = ref<string | undefined>('')
const code = ref('')
const amount = ref<number | undefined>(1)
const unit = ref<Unit | undefined | null>(useUserPreferenceStore().defaultUnitObj)
const expires = ref<Date | undefined>(undefined)

const commonUnits = ref<Unit[]>([])

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

const dialogTitle = computed(() => {
    if (bookingMode.value == 'add') {
        return t('Add')
    } else if (bookingMode.value == 'remove') {
        return t('Remove')
    } else if (bookingMode.value == 'move') {
        return t('Move')
    } else if (bookingMode.value == 'edit') {
        return t('Edit')
    } else if (bookingMode.value == 'confirm') {
        return t('Confirm')
    } else {
        return t('Error')
    }
})

watch(dialog, (newValue, oldValue) => {
    if (!newValue) {
        resetForm()
    } else {
        bookingMode.value = props.bookingMode

        if (props.inventoryEntryId) {
            let api = new ApiApi()
            api.apiInventoryEntryRetrieve({id: props.inventoryEntryId}).then(r => {
                inventoryEntry.value = r
                inventoryEntrySelected()
            })
        }
    }
})

onMounted(() => {
    let api = new ApiApi()
    bookingMode.value = props.bookingMode

    if (props.inventoryEntryId) {
        
        api.apiInventoryEntryRetrieve({id: props.inventoryEntryId}).then(r => {
            inventoryEntry.value = r
            inventoryEntrySelected()
        })
    }
    
    // TODO tidy up, do I need to load the last page?
    api.apiInventoryEntryList({pageSize: 100}).then(r => {
        const counts = new Map<number, { unit: Unit, count: number }>()
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
        
    })
})



/**
 * save form depending on selected booking mode
 */
function save() {
    if (bookingMode.value == 'add') {
        addInventory()
    } else if (bookingMode.value == 'remove') {
        removeInventory()
    } else if (bookingMode.value == 'move') {
        moveInventory()
    } else if (bookingMode.value == 'edit') {
        editInventory()
    }

}

/**
 * Directly correct an existing lot's amount/unit (#9) — Move already handles relocating a lot and
 * Remove already handles subtracting from it, but neither lets you fix a typo'd amount or unit
 * without going through subtract-then-re-add. Same never-touch-`expires` pattern as moveInventory:
 * a full PUT would resend the old `expires` and permanently defeat the backend's freeze/thaw
 * recompute (caller_set_expires), so this only ever patches the fields that actually changed.
 */
function editInventory() {
    let api = new ApiApi()

    if (inventoryEntry.value != null) {
        const patch: PatchedInventoryEntry = {}
        if (amount.value != null && inventoryEntry.value.amount !== amount.value) {
            patch.amount = amount.value
        }
        if (inventoryEntry.value.unit !== unit.value) {
            patch.unit = unit.value ?? null
        }

        if (Object.keys(patch).length === 0) {
            dialog.value = false
            return
        }

        formLoading.value = true
        api.apiInventoryEntryPartialUpdate({id: inventoryEntry.value.id!, patchedInventoryEntry: patch}).then(() => {
            useMessageStore().addPreparedMessage(PreparedMessage.UPDATE_SUCCESS)
        }).catch(err => {
            useMessageStore().addError(ErrorMessageType.UPDATE_ERROR, err)
        }).finally(() => {
            formLoading.value = false
            dialog.value = false
            emits('update')
        })
    }
}

/**
 * add new inventory entry
 */
function addInventory() {
    let api = new ApiApi()
    formLoading.value = true

    // set time to noon because ISO string conversion might shift dates instead of just cutting of time
    if (expires.value) {
        expires.value.setHours(12, 0, 0, 0)
    }

    let inventoryEntry = {
        food: food.value,
        inventoryLocation: inventoryLocation.value,
        subLocation: subLocation.value,
        amount: amount.value,
        unit: unit.value,
        expires: expires.value,
        code: code.value,
    } as InventoryEntry

    api.apiInventoryEntryCreate({inventoryEntry: inventoryEntry}).then(r => {
        useMessageStore().addPreparedMessage(PreparedMessage.CREATE_SUCCESS)
        bookingConfirmEntry.value = r
        bookingMode.value = 'confirm'
    }).catch(err => {
        useMessageStore().addError(ErrorMessageType.CREATE_ERROR, err)
    }).finally(() => {
        formLoading.value = false
        emits('update')
    })
}

/**
 * subtract amount from inventory entry and save to DB
 */
function removeInventory() {
    let api = new ApiApi()

    if (inventoryEntry.value != null) {
        formLoading.value = true

        if (inventoryEntry.value.amount != undefined && amount.value != undefined) {
            inventoryEntry.value.amount = Math.max(inventoryEntry.value.amount - amount.value, 0)
        }

        api.apiInventoryEntryUpdate({id: inventoryEntry.value.id!, inventoryEntry: inventoryEntry.value}).then(r => {
            useMessageStore().addPreparedMessage(PreparedMessage.UPDATE_SUCCESS)
            if (inventoryEntry.value && inventoryEntry.value.amount == 0) {
                bookingMode.value = 'add'
                resetForm(true, true)
            } else {
                inventoryEntrySelected()
            }
        }).catch(err => {
            useMessageStore().addError(ErrorMessageType.UPDATE_ERROR, err)
        }).finally(() => {
            formLoading.value = false
            dialog.value = false
            emits('update')
        })
    }
}

function moveInventory() {
    let api = new ApiApi()

    if (inventoryEntry.value != null) {
        formLoading.value = true
        // a freeze/thaw transition (see recompute_lot_expiry) may recompute expires server-side;
        // compare against the pre-move value so that surfaces via its own toast, never silently
        const expiresBeforeMove = inventoryEntry.value.expires

        // Patch only the fields that actually changed — omitting `expires` entirely (not just
        // leaving it unchanged) matters: the backend's freeze/thaw recompute only runs when the
        // caller didn't set `expires` at all (caller_set_expires). A full PUT of the whole entry
        // always resends the old `expires`, which looks like "the caller set it" and permanently
        // defeats the recompute, even on a genuine freezer<->fridge move.
        const patch: PatchedInventoryEntry = {}
        if (inventoryLocation.value != null && inventoryEntry.value.inventoryLocation != inventoryLocation.value) {
            patch.inventoryLocation = inventoryLocation.value
        }
        if (subLocation.value != null && inventoryEntry.value.subLocation != subLocation.value) {
            patch.subLocation = subLocation.value
        }

        if (Object.keys(patch).length > 0) {
            api.apiInventoryEntryPartialUpdate({id: inventoryEntry.value.id!, patchedInventoryEntry: patch}).then(r => {
                useMessageStore().addPreparedMessage(PreparedMessage.UPDATE_SUCCESS)
                if (r.expires && (r.expires?.getTime() ?? null) !== (expiresBeforeMove?.getTime() ?? null)) {
                    useMessageStore().addMessage(MessageType.INFO,
                        {title: t('Expires'), text: t('OpenedExpiryUpdated', {date: DateTime.fromJSDate(r.expires).toLocaleString(DateTime.DATE_MED)})} as StructuredMessage,
                        4000)
                }
                inventoryEntrySelected()
            }).catch(err => {
                useMessageStore().addError(ErrorMessageType.UPDATE_ERROR, err)
            }).finally(() => {
                formLoading.value = false
                dialog.value = false
                emits('update')
            })
        } else {
            formLoading.value = false
            dialog.value = false
        }

    }
}


/**
 * reset form to default values
 */
function resetForm() {
    food.value = null
    inventoryLocation.value = null
    inventoryEntry.value = null
    subLocation.value = ''
    amount.value = 1
    unit.value = useUserPreferenceStore().defaultUnitObj
    expires.value = undefined
    code.value = ''
}

/**
 * when an inventory entry is selected, fill form with values from inventory entry
 */
function inventoryEntrySelected() {
    if (inventoryEntry.value) {
        food.value = inventoryEntry.value.food
        unit.value = inventoryEntry.value.unit
        //inventoryLocation.value = inventoryEntry.value.inventoryLocation
        //subLocation.value = inventoryEntry.value.subLocation
        amount.value = inventoryEntry.value.amount
        //expires.value = inventoryEntry.value.expires
    }
}

/**
 * function to copy selected fields from booking confirm entry to form
 */
function copyConfirmEntry() {
    resetForm()

    if (bookingConfirmEntry.value == null) {
        return;
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
        expires.value = bookingConfirmEntry.value.expires
    }
    if (selectedCopyOptions.value.includes('subLocation')) {
        subLocation.value = bookingConfirmEntry.value.subLocation
    }

    bookingMode.value = 'add'
}


</script>

<style scoped>

</style>