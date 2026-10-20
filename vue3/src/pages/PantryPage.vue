<template>
    <v-container>
        <v-card prepend-icon="$pantry" :title="$t('Pantry')" class="mb-4">
            <template #subtitle>
                <div class="text-wrap">{{ $t('PantryHelp') }}</div>
            </template>
            <!-- Desktop: actions in the header append. On mobile the 3 full-size buttons overflow
                 the row (collapsing the title), so they move to a wrapping row below (see v-card-text). -->
            <template v-if="!mobile" #append>
                <v-btn v-for="a in headerActions" :key="a.key" :prepend-icon="a.icon" :color="a.color"
                       variant="tonal" class="me-2" v-bind="a.to ? {to: a.to} : {}" @click="a.action?.()">
                    {{ $t(a.labelKey) }}
                </v-btn>
            </template>

            <v-card-text>
                <div v-if="mobile" class="d-flex flex-wrap ga-2 mb-4">
                    <v-btn v-for="a in headerActions" :key="a.key" :prepend-icon="a.icon" :color="a.color"
                           variant="tonal" size="small" v-bind="a.to ? {to: a.to} : {}" @click="a.action?.()">
                        {{ $t(a.labelKey) }}
                    </v-btn>
                </div>
                <v-row>
                    <v-col cols="12" md="6">
                        <model-select model="Food" v-model="food" hide-details></model-select>
                    </v-col>
                    <v-col cols="12" md="5">
                        <model-select model="InventoryLocation" v-model="inventoryLocation" hide-details></model-select>
                    </v-col>
                    <v-col cols="12" md="1" class="d-flex align-center">
                        <v-btn icon="$pantry" color="create" variant="tonal" :disabled="!food" :title="$t('Add')" :aria-label="$t('Add')" @click="quickAdd"></v-btn>
                    </v-col>
                </v-row>

                <selection-bar v-if="selectMode" class="mb-2" :selected-count="selected.length"
                               @close="exitSelectMode" @select-all="selectAll" @select-none="selected = []">
                    <template #actions>
                        <v-btn v-for="a in batchActions" :key="a.key" variant="text" class="text-none" :prepend-icon="a.icon"
                               :data-test="`batch-${a.key}`" :disabled="!selected.length" @click="a.run()">{{ $t(a.labelKey) }}</v-btn>
                    </template>
                    <template #actions-menu>
                        <v-list-item v-for="a in batchActions" :key="a.key" :prepend-icon="a.icon" :title="$t(a.labelKey)"
                                     :data-test="`batch-${a.key}`" :disabled="!selected.length" @click="a.run()"></v-list-item>
                    </template>
                </selection-bar>

                <pantry-filter-bar :select-mode="selectMode" @update="onFilterUpdate" @toggle-select="toggleSelectMode"></pantry-filter-bar>

                <inventory-entry-table ref="entryTable" :food="food" :inventory-location="inventoryLocation" :query="query" :filters="filters"
                                       :select-mode="selectMode" v-model:selected="selected"></inventory-entry-table>
            </v-card-text>
        </v-card>

        <pantry-batch-dialog v-model="batchDialog" :mode="batchMode" :count="selected.length" @confirm="onBatchConfirm"></pantry-batch-dialog>

        <stock-up-dialog ref="stockUpDialog" @stocked="entryTable?.load()"></stock-up-dialog>
        <use-up-dialog ref="useUpDialog" @used="entryTable?.load()"></use-up-dialog>
        <inventory-quick-add-dialog ref="quickAddDialog"></inventory-quick-add-dialog>
    </v-container>
</template>

<script setup lang="ts">

import InventoryEntryTable from "@/components/display/InventoryEntryTable.vue";
import PantryFilterBar from "@/components/display/PantryFilterBar.vue";
import StockUpDialog from "@/components/dialogs/StockUpDialog.vue";
import UseUpDialog from "@/components/dialogs/UseUpDialog.vue";
import InventoryQuickAddDialog from "@/components/dialogs/InventoryQuickAddDialog.vue";
import PantryBatchDialog from "@/components/dialogs/PantryBatchDialog.vue";
import SelectionBar from "@/components/common/SelectionBar.vue";
import ModelSelect from "@/components/inputs/ModelSelect.vue";
import {onMounted, ref} from "vue";
import {useDisplay} from "vuetify";
import {useI18n} from "vue-i18n";
import {ApiApi, ApiInventoryEntryListRequest, Food, InventoryEntry, InventoryLocation} from "@/openapi";
import {useRoute, type RouteLocationRaw} from "vue-router";
import {ErrorMessageType, MessageType, useMessageStore} from "@/stores/MessageStore";
import {useInventoryActions} from "@/composables/useInventoryActions";
import {usePantryBatchActions} from "@/composables/usePantryBatchActions";

const route = useRoute()
const {mobile} = useDisplay()
const {t} = useI18n()
const food = ref<Food | undefined>(undefined)
const inventoryLocation = ref<InventoryLocation | undefined>(undefined)
const query = ref('')
const filters = ref<Partial<ApiInventoryEntryListRequest>>({})
const entryTable = ref<InstanceType<typeof InventoryEntryTable> | null>(null)
const stockUpDialog = ref<InstanceType<typeof StockUpDialog> | null>(null)
const useUpDialog = ref<InstanceType<typeof UseUpDialog> | null>(null)
const quickAddDialog = ref<InstanceType<typeof InventoryQuickAddDialog> | null>(null)

function onFilterUpdate(value: {query: string, filters: Partial<ApiInventoryEntryListRequest>}) {
    query.value = value.query
    filters.value = value.filters
}

// Select mode: a selection of lots acted on together (the same toolbar toggle -> selection bar pattern as the model lists).
const selectMode = ref(false)
const selected = ref<InventoryEntry[]>([])
const batchDialog = ref(false)
const batchMode = ref<'location' | 'expires'>('location')

function toggleSelectMode() {
    selectMode.value = !selectMode.value
    selected.value = []
}

function exitSelectMode() {
    selectMode.value = false
    selected.value = []
}

function selectAll() {
    entryTable.value?.selectAll()
}

function openBatchDialog(mode: 'location' | 'expires') {
    batchMode.value = mode
    batchDialog.value = true
}

/** Report a batch outcome — a warning (not a success) as soon as any lot failed — then leave select mode and refresh. */
function finishBatch(done: number, failed: number, successText: string) {
    useMessageStore().addMessage(failed ? MessageType.WARNING : MessageType.SUCCESS,
        failed ? t('PantryBatchPartial', {updated: done, failed}) : successText, 4000)
    exitSelectMode()
    entryTable.value?.load()
}

async function batchAddToShopping() {
    const {added, alreadyListed, failed} = await usePantryBatchActions().addFoodsToShopping(selected.value)
    finishBatch(added + alreadyListed, failed, t('PantryBatchShopping', {added, listed: alreadyListed}))
}

async function onBatchConfirm(value: InventoryLocation | Date | null) {
    batchDialog.value = false
    const batch = usePantryBatchActions()
    const {updated, failed} = batchMode.value === 'location'
        ? await batch.moveLots(selected.value, value as InventoryLocation)
        : await batch.setLotsExpiry(selected.value, value as Date | null)
    finishBatch(updated, failed, t('PantryBatchUpdated', {count: updated}))
}

const batchActions = [
    {key: 'shopping', labelKey: 'AddToShopping', icon: '$shopping', run: batchAddToShopping},
    {key: 'move', labelKey: 'Move', icon: 'fa-solid fa-location-dot', run: () => openBatchDialog('location')},
    {key: 'expiry', labelKey: 'Expires', icon: 'fa-solid fa-calendar-day', run: () => openBatchDialog('expires')},
]

// #4: quick-add a lot for the food currently selected in the filter above, without leaving the page.
async function quickAdd() {
    if (!food.value || !quickAddDialog.value) return
    const {quickAddToInventory} = useInventoryActions()
    const added = await quickAddToInventory(
        {id: food.value.id!, name: food.value.name, shelfLifeDays: food.value.shelfLifeDays, shelfLifeDaysFrozen: food.value.shelfLifeDaysFrozen},
        quickAddDialog.value, t,
    )
    if (added) entryTable.value?.load()
}

// Header actions, rendered in the card append on desktop and a wrapping row on mobile (DEFECT-02).
const headerActions: Array<{key: string, labelKey: string, icon: string, color?: string, to?: RouteLocationRaw, action?: () => void}> = [
    {key: 'stock', labelKey: 'StockUp', icon: '$pantry', action: () => stockUpDialog.value?.open()},
    {key: 'use', labelKey: 'UseUp', icon: '$pantry', action: () => useUpDialog.value?.open()},
    {key: 'booking', labelKey: 'InventoryBooking', icon: 'fa-solid fa-boxes-stacked fa-fw', color: 'create', to: {name: 'InventoryBookingPage'}},
]

onMounted(() => {
    const api = new ApiApi()

    const foodId = Number(route.query.food_id)
    if (foodId && !Number.isNaN(foodId)) {
        api.apiFoodRetrieve({id: foodId}).then(r => {
            food.value = r
        }).catch(err => {
            useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
        })
    }
})

</script>

<style scoped>

</style>
