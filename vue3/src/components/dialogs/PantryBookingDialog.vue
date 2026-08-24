<template>
    <v-dialog max-width="900" v-model="dialog" activator="model">
        <v-card>

            <v-closable-card-title v-model="dialog" icon="fas fa-jar" :title="dialogTitle"></v-closable-card-title>

            <v-card-text>

                <v-row v-if="['add','edit'].includes(bookingMode)">
                    <v-col>
                        <v-form>
                            <model-select model="InventoryEntry" :label="$t('InventoryEntry')" v-model="inventoryEntry" v-if="bookingMode === 'edit'"
                                          @update:modelValue="inventoryEntrySelected()">
                            </model-select>

                            <model-select model="Food" :label="$t('Food')" allow-create v-model="food" v-if="bookingMode === 'add'"></model-select>

                            <v-tabs v-if="bookingMode === 'edit'" v-model="editTab" class="mb-4" density="compact">
                                <v-tab value="amount">{{ $t('Amount') }}</v-tab>
                                <v-tab value="location">{{ $t('InventoryLocation') }}</v-tab>
                            </v-tabs>

                            <model-select model="InventoryLocation" :label="$t('InventoryLocation')" v-model="inventoryLocation"
                                          v-if="bookingMode === 'add' || (bookingMode === 'edit' && editTab === 'location')">
                                <template #append>
                                    <v-btn icon>
                                        <v-icon icon="$create"></v-icon>
                                        <model-edit-dialog model="InventoryLocation" @create="args => inventoryLocation = args"></model-edit-dialog>
                                    </v-btn>
                                </template>
                            </model-select>
                            <v-text-field :label="$t('SubLocation')" :hint="$t('SubLocationHelp')" v-model="subLocation"
                                          v-if="bookingMode === 'add' || (bookingMode === 'edit' && editTab === 'location')"></v-text-field>

                            <div v-if="bookingMode === 'edit' && editTab === 'amount'" class="text-caption text-medium-emphasis mb-2 d-flex align-center justify-space-between">
                                <span>
                                    {{ $t('InStock') }}: {{ entryOriginalAmount }} {{ entryOriginalUnit?.name || '' }}
                                    <span v-if="amountChanged" class="text-warning">→ {{ amount }} {{ unit?.name || '' }}</span>
                                </span>
                                <v-btn size="small" variant="text" prepend-icon="fa-solid fa-minus" data-test="consume-lot-btn"
                                       @click="amount = 0">{{ $t('UseUp') }}</v-btn>
                            </div>

                            <v-number-input :label="$t('Amount')" :precision="2" v-model="amount"
                                            v-if="bookingMode === 'add' || (bookingMode === 'edit' && editTab === 'amount')"></v-number-input>
                            <model-select model="Unit" :label="$t('Unit')" allow-create v-model="unit" hide-details
                                          v-if="bookingMode === 'add' || (bookingMode === 'edit' && editTab === 'amount')">
                                <template #append-inner>
                                    <v-chip v-for="u in commonUnits" :key="u.id" @click="unit = u" size="small" class="mr-1">
                                        {{ u.name }}
                                    </v-chip>
                                </template>
                            </model-select>
                            <v-chip-group v-if="bookingMode === 'add'" class="mb-2">
                                <v-chip v-for="u in commonUnits" :key="u.id" @click="unit = u" size="small" class="mr-1">
                                    {{ u.name }}
                                </v-chip>
                            </v-chip-group>

                            <v-date-input :label="$t('Expires')" v-model="expires" v-if="bookingMode === 'add'">
                                <template #append-inner>
                                    <v-btn variant="text" @click.stop="freezerExpiryDialog = true">
                                        <v-icon icon="fa-solid fa-snowflake"></v-icon>
                                        <expiry-preset-dialog v-model:date="expires" v-model="freezerExpiryDialog"></expiry-preset-dialog>
                                    </v-btn>
                                </template>
                            </v-date-input>

                            <closable-help-alert :text="$t('CodeHelp')" class="mb-2" v-if="bookingMode === 'add'"></closable-help-alert>
                            <v-text-field :label="$t('Code')" v-model="code" v-if="bookingMode === 'add'"></v-text-field>

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
import ExpiryPresetDialog from "@/components/dialogs/ExpiryPresetDialog.vue";
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
    } else if (bookingMode.value == 'edit') {
        editInventory()
    }

}

/**
 * Directly correct an existing lot (#2) — Remove, Move, and the original #9 amount/unit Edit were
 * three separate modes with duplicated "which fields changed" PATCH logic; a single Save now
 * patches whichever fields actually changed, on either the Amount or Location tab. Never a full
 * PUT: that would resend the old `expires` and permanently defeat the backend's freeze/thaw
 * recompute (caller_set_expires) on a genuine freezer<->fridge move.
 */
function editInventory() {
    let api = new ApiApi()

    if (inventoryEntry.value != null) {
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
            dialog.value = false
            return
        }

        formLoading.value = true
        api.apiInventoryEntryPartialUpdate({id: inventoryEntry.value.id!, patchedInventoryEntry: patch}).then(r => {
            useMessageStore().addPreparedMessage(PreparedMessage.UPDATE_SUCCESS)
            if (r.expires && (r.expires?.getTime() ?? null) !== (expiresBeforeEdit?.getTime() ?? null)) {
                useMessageStore().addMessage(MessageType.INFO,
                    {title: t('Expires'), text: t('OpenedExpiryUpdated', {date: DateTime.fromJSDate(r.expires).toLocaleString(DateTime.DATE_MED)})} as StructuredMessage,
                    4000)
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
    editTab.value = 'amount'
    entryOriginalAmount.value = undefined
    entryOriginalUnit.value = undefined
}

/**
 * when an inventory entry is selected, fill form with values from inventory entry
 */
function inventoryEntrySelected() {
    if (inventoryEntry.value) {
        food.value = inventoryEntry.value.food
        unit.value = inventoryEntry.value.unit
        // Pre-populate with the entry's own current values — reconsidered post-UAT from an
        // earlier "starts blank" design (judged counter-intuitive).
        inventoryLocation.value = inventoryEntry.value.inventoryLocation
        subLocation.value = inventoryEntry.value.subLocation ?? ''
        amount.value = inventoryEntry.value.amount
        //expires.value = inventoryEntry.value.expires
        entryOriginalAmount.value = inventoryEntry.value.amount
        entryOriginalUnit.value = inventoryEntry.value.unit
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