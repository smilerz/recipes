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

                            <inventory-entry-form-fields :form="form" :booking-mode="bookingMode">
                                <template #after-identity>
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
                                </template>
                            </inventory-entry-form-fields>
                        </v-form>
                    </v-card-text>
                    <v-card-actions>
                        <v-btn color="warning" prepend-icon="$reset" @click="resetFormAndReload()">{{ $t('Reset') }}</v-btn>
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

                <v-select
                    v-model="selectedCopyOptions"
                    chips
                    class="mt-6"
                    :label="$t('Copy')"
                    :items="copyOptions"
                    multiple
                    hide-details
                >
                </v-select>
                <p class="mt-4">
                    <v-btn block color="create" prepend-icon="$copy" @click="copyConfirmEntry">{{ $t('Copy') }}</v-btn>
                    <v-btn color="primary" class="mt-2" prepend-icon="$pantry" block :to="{name: 'PantryPage'}">{{ $t('Pantry') }}</v-btn>
                    <v-btn class="mt-2" block @click="bookingConfirmDialog = false; resetFormAndReload()">{{ $t('Close') }}</v-btn>
                </p>
            </v-card-text>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">

import {onMounted, ref, watch} from "vue";
import {ApiApi, ApiInventoryEntryListRequest, Ingredient, InventoryEntry} from "@/openapi";
import {ErrorMessageType, useMessageStore} from "@/stores/MessageStore.ts";
import {useI18n} from "vue-i18n";
import {useRoute} from "vue-router";
import {VDataTableUpdateOptions} from "@/vuetify.ts";
import {DateTime} from "luxon";
import {ingredientToString} from "@/utils/model_utils.ts";
import InventoryEntryFormFields from "@/components/inputs/InventoryEntryFormFields.vue";
import InventoryEntryLogDialog from "@/components/dialogs/InventoryEntryLogDialog.vue";
import VClosableCardTitle from "@/components/dialogs/VClosableCardTitle.vue";
import {useRouteQuery} from "@vueuse/router";
import {toNumberArray} from "@/utils/utils.ts";
import InventoryEntryLogTable from "@/components/tables/InventoryEntryLogTable.vue";
import {TInventoryLocation} from "@/types/Models.ts";
import {useInventoryEntryForm} from "@/composables/useInventoryEntryForm.ts";

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
const bookingMode = useRouteQuery('bookingMode', 'add')
const bookingConfirmDialog = ref(false)

const form = useInventoryEntryForm(t, {
    onAdded: () => {
        bookingConfirmDialog.value = true
    },
    onEdited: (r) => {
        if (inventoryEntry.value) {
            Object.assign(inventoryEntry.value, r)
        }
        inventoryEntrySelected()
    },
    onSettled: () => {
        logUpdateTrigger.value = !logUpdateTrigger.value
    },
    onCopied: () => {
        bookingMode.value = 'add'
        bookingConfirmDialog.value = false
    },
})

const {
    formLoading, editTab, food, inventoryEntry, inventoryLocation, subLocation, code, amount, unit, expires,
    entryOriginalAmount, entryOriginalUnit, amountChanged, commonUnits,
    bookingConfirmEntry, copyOptions, selectedCopyOptions,
    loadCommonUnits, addInventory, editInventory, inventoryEntrySelected, resetForm, copyConfirmEntry,
} = form

// table
const tableLoading = ref(false)

const items = ref([] as InventoryEntry[])
const itemCount = ref(0)
const page = ref(1)
const pageSize = ref(10)

// general
const entryLogDialog = ref(false)
const entryLogEntry = ref<InventoryEntry | null>(null)

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

    loadCommonUnits()
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

/** Thin wrapper kept only so existing tests can call `editEntry()` by name — the actual PATCH
 * logic lives in useInventoryEntryForm.ts's editInventory(). */
function editEntry() {
    editInventory()
}

/**
 * reset form to default values and reload the Current Stock table
 */
function resetFormAndReload(resetFood: boolean = true, resetInventoryLocation: boolean = true) {
    resetForm(resetFood, resetInventoryLocation)
    loadItems({page: 1, itemsPerPage: 10})
}

/**
 * #13/#2: clicking anywhere on a Current Stock row (not just its action buttons) starts an Edit
 * on that entry — the most common single-row action, and now the only booking mode besides Add.
 */
function selectRowForEdit(item: InventoryEntry) {
    bookingMode.value = 'edit'
    inventoryEntry.value = item
    inventoryEntrySelected()
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