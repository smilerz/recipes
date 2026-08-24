<template>
    <v-container>
        <v-row density="compact">
            <v-col>
                <v-card prepend-icon="fa-solid fa-boxes-stacked" :title="$t('InventoryBooking')">
                    <template #subtitle>
                        <div class="text-wrap">
                            {{ $t('InventoryBookingHelp') }}
                        </div>
                    </template>
                    <template #append>
                        <v-btn class="float-right" icon="$pantry" color="create" :to="{name: 'PantryPage'}">
                        </v-btn>
                    </template>
                </v-card>
            </v-col>
        </v-row>
        <v-row>
            <v-col cols="12" md="6">
                <v-card :loading="formLoading">
                    <v-card-title>
                        {{ $t('InventoryBooking') }}
                    </v-card-title>
                    <v-card-text>
                        <v-form>
                            <v-btn-toggle v-model="bookingMode" class="mb-5" border divided>
                                <v-btn value="add" prepend-icon="$create">{{ $t('Add') }}</v-btn>
                                <v-btn value="edit" prepend-icon="$edit">{{ $t('Edit') }}</v-btn>
                            </v-btn-toggle>

                            <model-select model="InventoryEntry" :label="$t('InventoryEntry')" v-model="inventoryEntry" v-if="['edit'].includes(bookingMode)"
                                          @update:modelValue="inventoryEntrySelected()">
                            </model-select>

                            <model-select model="Food" :label="$t('Food')" allow-create v-model="food" v-if="['add'].includes(bookingMode)"></model-select>

                            <v-card variant="outlined" class="mb-4" v-if="inventoryEntry">
                                <v-card-title>
                                    {{ ingredientToString({food: inventoryEntry.food, unit: inventoryEntry.unit, amount: inventoryEntry.amount} as Ingredient) }}
                                    <v-btn class="float-right" density="compact" icon="fa-solid fa-clock-rotate-left" variant="plain" @click="entryLogDialog = true; entryLogEntry = inventoryEntry"></v-btn>
                                </v-card-title>
                                <v-card-text>
                                    <v-chip size="small" label color="warning" class="me-2" prepend-icon="fa-solid fa-barcode">{{inventoryEntry.code}}</v-chip>
                                    <v-chip size="small" label color="info" class="me-2" :prepend-icon="TInventoryLocation.icon">{{inventoryEntry.inventoryLocation.name}}</v-chip>
                                    <v-chip size="small" label :color="(inventoryEntry.expires < DateTime.now() ? 'error' : 'success')" v-if="inventoryEntry.expires">
                                        {{ DateTime.fromJSDate(inventoryEntry.expires).toLocaleString(DateTime.DATE_MED) }}
                                    </v-chip>
                                </v-card-text>
                            </v-card>

                            <v-tabs v-if="['edit'].includes(bookingMode)" v-model="editTab" class="mb-4" density="compact">
                                <v-tab value="amount">{{ $t('Amount') }}</v-tab>
                                <v-tab value="location">{{ $t('InventoryLocation') }}</v-tab>
                            </v-tabs>

                            <model-select model="InventoryLocation" :label="$t('InventoryLocation')" v-model="inventoryLocation"
                                          v-if="['add'].includes(bookingMode) || (['edit'].includes(bookingMode) && editTab === 'location')">
                                <template #append>
                                    <v-btn icon>
                                        <v-icon icon="$create"></v-icon>
                                        <model-edit-dialog model="InventoryLocation" @create="args => inventoryLocation = args"></model-edit-dialog>
                                    </v-btn>
                                </template>
                            </model-select>
                            <v-text-field :label="$t('SubLocation')" :hint="$t('SubLocationHelp')" v-model="subLocation"
                                          v-if="['add'].includes(bookingMode) || (['edit'].includes(bookingMode) && editTab === 'location')"></v-text-field>

                            <closable-help-alert :text="$t('CodeHelp')" class="mb-2" v-if="['add'].includes(bookingMode)"></closable-help-alert>
                            <v-text-field :label="$t('Code')" v-model="code" v-if="['add'].includes(bookingMode)"></v-text-field>

                            <div v-if="['edit'].includes(bookingMode) && editTab === 'amount'" class="text-caption text-medium-emphasis mb-2 d-flex align-center justify-space-between">
                                <span>
                                    {{ $t('InStock') }}: {{ entryOriginalAmount }} {{ entryOriginalUnit?.name || '' }}
                                    <span v-if="amountChanged" class="text-warning">→ {{ amount }} {{ unit?.name || '' }}</span>
                                </span>
                                <v-btn size="small" variant="text" prepend-icon="fa-solid fa-minus" data-test="consume-lot-btn"
                                       @click="amount = 0">{{ $t('UseUp') }}</v-btn>
                            </div>

                            <v-number-input :label="$t('Amount')" :precision="2" v-model="amount"
                                            v-if="['add'].includes(bookingMode) || (['edit'].includes(bookingMode) && editTab === 'amount')"></v-number-input>
                            <model-select model="Unit" :label="$t('Unit')" allow-create v-model="unit"
                                          v-if="['add'].includes(bookingMode) || (['edit'].includes(bookingMode) && editTab === 'amount')"></model-select>

                            <v-date-input :label="$t('Expires')" v-model="expires" v-if="['add'].includes(bookingMode)">
                                <template #append-inner v-if="inventoryLocation?.isFreezer">
                                    <v-btn variant="text" data-test="freezer-expiry-btn" @click.stop="freezerExpiryDialog = true">
                                        <v-icon icon="fa-solid fa-snowflake"></v-icon>
                                        <expiry-preset-dialog v-model:date="expires" v-model="freezerExpiryDialog"></expiry-preset-dialog>
                                    </v-btn>
                                </template>
                            </v-date-input>
                        </v-form>
                    </v-card-text>
                    <v-card-actions>
                        <v-btn color="warning" prepend-icon="$reset" @click="resetForm()">{{ $t('Reset') }}</v-btn>
                        <v-btn color="create" prepend-icon="$save" :disabled="formLoading" :loading="formLoading" @click="save()">{{ $t('Save') }}</v-btn>
                    </v-card-actions>
                </v-card>
            </v-col>

            <v-col cols="12" md="6">
                <v-card :loading="tableLoading">
                    <v-card-title>
                        {{ $t('Stock') }}
                    </v-card-title>
                    <v-card-text>
                        <v-data-table-server
                            return-object
                            hover
                            class="clickable-rows"
                            @update:options="loadItems"
                            @click:row="(_event: MouseEvent, {item}: {item: InventoryEntry}) => selectRowForEdit(item)"
                            :items="items"
                            :items-length="itemCount"
                            :loading="tableLoading"
                            :headers="tableHeaders"
                            :page="page"
                            :items-per-page="pageSize"
                            disable-sort
                        >
                            <template #item.code="{item}">
                                #{{ item.code }}
                            </template>
                            <template #item.food="{item}">
                                {{ ingredientToString({food: item.food, unit: item.unit, amount: item.amount} as Ingredient) }} <br/>
                                <v-chip size="small" label color="warning" class="me-2" prepend-icon="fa-solid fa-barcode">{{item.code}}</v-chip>
                                    <v-chip size="small" label color="info" class="me-2" :prepend-icon="TInventoryLocation.icon">{{item.inventoryLocation.name}}</v-chip>
                                    <v-chip size="small" label :color="(item.expires < DateTime.now() ? 'error' : 'success')" v-if="item.expires">
                                        {{ DateTime.fromJSDate(item.expires).toLocaleString(DateTime.DATE_MED) }}
                                    </v-chip>
                            </template>
                            <template #item.expires="{item}">
                                <template v-if="item.expires ">
                                    <v-chip size="small" label :color="(item.expires < DateTime.now() ? 'error' : 'success')">
                                        {{ DateTime.fromJSDate(item.expires).toLocaleString(DateTime.DATE_MED) }}
                                    </v-chip>
                                </template>
                            </template>
                            <template #item.inventoryLocation="{ item }">
                                {{ item.inventoryLocation.name }}
                                <span class="text-body-2 text-disabled">
                                    <br/>
                                {{ item.subLocation }}
                                </span>
                            </template>
                            <template #item.action="{item}">
                                <v-btn-group divided border density="comfortable">
                                      <v-btn  icon="fa-solid fa-clock-rotate-left" data-test="stock-history-btn" @click.stop="entryLogDialog = true; entryLogEntry = item"></v-btn>
                                <v-btn  icon="$edit" data-test="stock-edit-btn"
                                       @click.stop="bookingMode='edit'; inventoryEntry = item; inventoryEntrySelected()"></v-btn>
                                </v-btn-group>

                            </template>
                        </v-data-table-server>
                    </v-card-text>
                </v-card>
            </v-col>

        </v-row>

        <v-row>
            <v-col>
                <inventory-entry-log-table :update-trigger="logUpdateTrigger"></inventory-entry-log-table>
            </v-col>
        </v-row>
    </v-container>

    <inventory-entry-log-dialog v-model="entryLogDialog" :inventory-entry="entryLogEntry"></inventory-entry-log-dialog>

    <v-dialog max-width="400" v-model="bookingConfirmDialog" persistent>
        <v-card prepend-icon="$save" :title="$t('Saved')">

            <v-card-text v-if="bookingConfirmEntry" class="text-center">
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

                <p class="mt-10">
                    <v-btn color="success" prepend-icon="$create" block @click="bookingConfirmDialog = false; resetForm(true, false)">
                        {{ bookingConfirmEntry.inventoryLocation.name }}
                    </v-btn>
                    <v-btn color="success" class="mt-2" prepend-icon="$create" block @click="bookingConfirmDialog = false; resetForm(false, true)">
                        {{ bookingConfirmEntry.food.name }}
                    </v-btn>
                    <v-btn color="info" class="mt-2" prepend-icon="fa-solid fa-boxes-stacked" block @click="bookingConfirmDialog = false; resetForm(true, true)">
                        {{ $t('InventoryBooking') }}
                    </v-btn>
                    <v-btn color="primary" class="mt-2" prepend-icon="$pantry" block :to="{name: 'PantryPage'}">{{ $t('Pantry') }}</v-btn>
                    <v-btn class="mt-2" block @click="bookingConfirmDialog = false; resetForm(true, true)">{{ $t('Close') }}</v-btn>
                </p>
            </v-card-text>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">

import ModelSelect from "@/components/inputs/ModelSelect.vue";
import {computed, onMounted, ref, watch} from "vue";
import {ApiApi, ApiInventoryEntryListRequest, Food, Ingredient, InventoryEntry, InventoryLocation, PatchedInventoryEntry, Unit} from "@/openapi";
import {useUserPreferenceStore} from "@/stores/UserPreferenceStore.ts";
import {VDateInput} from "vuetify/components";
import {ErrorMessageType, MessageType, PreparedMessage, StructuredMessage, useMessageStore} from "@/stores/MessageStore.ts";
import {useI18n} from "vue-i18n";
import {useRoute} from "vue-router";
import {VDataTableUpdateOptions} from "@/vuetify.ts";
import {DateTime} from "luxon";
import {ingredientToString} from "@/utils/model_utils.ts";
import ExpiryPresetDialog from "@/components/dialogs/ExpiryPresetDialog.vue";
import InventoryEntryLogDialog from "@/components/dialogs/InventoryEntryLogDialog.vue";
import VClosableCardTitle from "@/components/dialogs/VClosableCardTitle.vue";
import ClosableHelpAlert from "@/components/display/ClosableHelpAlert.vue";
import {useRouteQuery} from "@vueuse/router";
import {toNumberArray} from "@/utils/utils.ts";
import InventoryEntryLogTable from "@/components/tables/InventoryEntryLogTable.vue";
import {TInventoryLocation} from "@/types/Models.ts";
import ModelEditDialog from "@/components/dialogs/ModelEditDialog.vue";

const {t} = useI18n()
const route = useRoute()

onMounted(() => {
    const foodId = Number(route.query.food_id)
    if (foodId && !Number.isNaN(foodId)) {
        new ApiApi().apiFoodRetrieve({id: foodId}).then(r => {
            food.value = r
        }).catch(err => {
            useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
        })
    }
})

// form
const formLoading = ref(false)
const freezerExpiryDialog = ref(false)

const bookingMode = useRouteQuery('bookingMode', 'add')
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

// table
const tableLoading = ref(false)

const items = ref([] as InventoryEntry[])
const itemCount = ref(0)
const page = ref(1)
const pageSize = ref(10)

// general
const entryLogDialog = ref(false)
const entryLogEntry = ref<InventoryEntry | null>(null)

const bookingConfirmDialog = ref(false)
const bookingConfirmEntry = ref<InventoryEntry | null>(null)
const inventoryEntryId = useRouteQuery('inventoryEntryId')

const logUpdateTrigger = ref(false)

const tableHeaders = ref([
    // {title: t('Code'), key: 'code'},
    {title: t('Food'), key: 'food'},
    // {title: t('Expires'), key: 'expires',},
    // {title: t('InventoryLocation'), key: 'inventoryLocation',},
    {title: 'Actions', key: 'action', align: 'end'},
])

watch([() => food.value, () => inventoryLocation.value], () => {
    loadItems({page: 1, itemsPerPage: 10})
})

onMounted(() => {
    if (inventoryEntryId.value) {
        let api = new ApiApi()
        api.apiInventoryEntryRetrieve({id: inventoryEntryId.value}).then(r => {
            inventoryEntry.value = r
            inventoryEntryId.value = undefined
            inventoryEntrySelected()
        })
    }
})

/**
 * save form depending on selected booking mode
 */
function save() {
    if (formLoading.value) return
    if (bookingMode.value == 'add') {
        addInventory()
    } else if (bookingMode.value == 'edit') {
        editEntry()
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
        bookingConfirmDialog.value = true
    }).catch(err => {
        useMessageStore().addError(ErrorMessageType.CREATE_ERROR, err)
    }).finally(() => {
        formLoading.value = false
        logUpdateTrigger.value = !logUpdateTrigger.value
    })
}

/**
 * Directly correct an existing lot (#2) — Remove, Move, and the original #9 amount/unit Edit were
 * three separate modes with duplicated "which fields changed" PATCH logic; a single Save now
 * patches whichever fields actually changed, on either the Amount or Location tab. Never a full
 * PUT: that would resend the old `expires` and permanently defeat the backend's freeze/thaw
 * recompute (caller_set_expires) on a genuine freezer<->fridge move.
 */
function editEntry() {
    let api = new ApiApi()

    if (inventoryEntry.value != null) {
        formLoading.value = true
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
            formLoading.value = false
            return
        }

        api.apiInventoryEntryPartialUpdate({id: inventoryEntry.value.id!, patchedInventoryEntry: patch}).then(r => {
            useMessageStore().addPreparedMessage(PreparedMessage.UPDATE_SUCCESS)
            if (r.expires && (r.expires?.getTime() ?? null) !== (expiresBeforeEdit?.getTime() ?? null)) {
                useMessageStore().addMessage(MessageType.INFO,
                    {title: t('Expires'), text: t('OpenedExpiryUpdated', {date: DateTime.fromJSDate(r.expires).toLocaleString(DateTime.DATE_MED)})} as StructuredMessage,
                    4000)
            }
            if (inventoryEntry.value) {
                Object.assign(inventoryEntry.value, r)
            }
            inventoryEntrySelected()
        }).catch(err => {
            useMessageStore().addError(ErrorMessageType.UPDATE_ERROR, err)
        }).finally(() => {
            formLoading.value = false
            logUpdateTrigger.value = !logUpdateTrigger.value
        })
    }
}


/**
 * reset form to default values
 */
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
    loadItems({page: 1, itemsPerPage: 10})
}

/**
 * when an inventory entry is selected, fill form with values from inventory entry
 */
/**
 * #13/#2: clicking anywhere on a Current Stock row (not just its action buttons) starts an Edit
 * on that entry — the most common single-row action, and now the only booking mode besides Add.
 */
function selectRowForEdit(item: InventoryEntry) {
    bookingMode.value = 'edit'
    inventoryEntry.value = item
    inventoryEntrySelected()
}

function inventoryEntrySelected() {
    if (inventoryEntry.value) {
        food.value = inventoryEntry.value.food
        unit.value = inventoryEntry.value.unit
        // Pre-populate with the newly selected entry's own values — reconsidered post-UAT from an
        // earlier "starts blank" design (judged counter-intuitive). This also structurally prevents
        // a previously-selected entry's Location from leaking into this one: editEntry()'s dirty
        // check compares against whatever is currently loaded here, which is now always this
        // entry's own data, never a stale value left over from a different entry.
        inventoryLocation.value = inventoryEntry.value.inventoryLocation
        subLocation.value = inventoryEntry.value.subLocation ?? ''
        amount.value = inventoryEntry.value.amount
        //expires.value = inventoryEntry.value.expires
        entryOriginalAmount.value = inventoryEntry.value.amount
        entryOriginalUnit.value = inventoryEntry.value.unit
        editTab.value = 'amount'
    }
}

/**
 * load inventory data based on current props
 */
function loadItems(options: VDataTableUpdateOptions) {
    let api = new ApiApi()

    let parameters = {} as ApiInventoryEntryListRequest

    if (food.value) {
        parameters.foodId = food.value.id!
    }
    if (inventoryLocation.value) {
        parameters.inventoryLocationId = inventoryLocation.value.id!
    }

    tableLoading.value = true

    page.value = options.page
    pageSize.value = options.itemsPerPage

    api.apiInventoryEntryList(parameters).then((r: any) => {
        items.value = r.results
        itemCount.value = r.count
    }).catch((err: any) => {
        useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
    }).finally(() => {
        tableLoading.value = false
    })
}

</script>

<style scoped>
.clickable-rows :deep(tbody tr) {
    cursor: pointer;
}
</style>