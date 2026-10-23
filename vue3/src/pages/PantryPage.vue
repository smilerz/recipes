<template>
    <v-container>
        <v-card prepend-icon="$pantry" :title="$t('Pantry')" class="mb-4">
            <!-- the help line only pushes the list down on a phone -->
            <template v-if="!mobile" #subtitle>
                <div class="text-wrap">{{ $t('PantryHelp') }}</div>
            </template>
            <!-- Desktop: actions in the header append. On mobile the 3 full-size buttons overflow
                 the row (collapsing the title), so they move to one compact row below (see v-card-text):
                 the least-used one is icon-only so all three fit on a single line. -->
            <template v-if="!mobile" #append>
                <v-btn v-for="a in headerActions" :key="a.key" :prepend-icon="a.icon" :color="a.color" :data-test="`header-action-${a.key}`"
                       variant="tonal" class="me-2" v-bind="a.to ? {to: a.to} : {}" @click="a.action?.()">
                    {{ $t(a.labelKey) }}
                </v-btn>
            </template>

            <v-card-text>
                <div v-if="mobile" class="d-flex flex-nowrap ga-2 mb-2" data-test="pantry-header-actions">
                    <v-btn v-for="a in headerActions" :key="a.key" :color="a.color" variant="tonal" size="small"
                           :icon="a.iconOnlyOnPhone" :prepend-icon="a.iconOnlyOnPhone ? undefined : a.icon"
                           :height="a.iconOnlyOnPhone ? 28 : undefined" :width="a.iconOnlyOnPhone ? 28 : undefined"
                           :aria-label="$t(a.labelKey)" :title="$t(a.labelKey)" :data-test="`header-action-${a.key}`"
                           v-bind="a.to ? {to: a.to} : {}" @click="a.action?.()">
                        <!-- a v-btn with any default slot ignores its icon prop, so the icon goes in the slot -->
                        <v-icon v-if="a.iconOnlyOnPhone" :icon="a.icon" size="small"></v-icon>
                        <template v-else>{{ $t(a.labelKey) }}</template>
                    </v-btn>
                </div>
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

                <!-- the toolbar owns Food, Location and Add; the page just shares the location and the sort with the table -->
                <pantry-filter-bar :select-mode="selectMode" v-model:inventory-location="inventoryLocation" v-model:sort-field="sortField"
                                   v-model:sort-descending="sortDescending" @update="onFilterUpdate" @toggle-select="toggleSelectMode"
                                   @add="onAdd"></pantry-filter-bar>

                <inventory-entry-table ref="entryTable" class="mt-2" :inventory-location="inventoryLocation" :query="query" :filters="filters"
                                       :select-mode="selectMode" v-model:selected="selected" v-model:sort-field="sortField"
                                       v-model:sort-descending="sortDescending"></inventory-entry-table>
            </v-card-text>
        </v-card>

        <pantry-batch-dialog v-model="batchDialog" :mode="batchMode" :count="selected.length" @confirm="onBatchConfirm"></pantry-batch-dialog>
        <pantry-booking-dialog v-model="addDialog" booking-mode="add" @update="entryTable?.load()"></pantry-booking-dialog>

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
import PantryBookingDialog from "@/components/dialogs/PantryBookingDialog.vue";
import SelectionBar from "@/components/common/SelectionBar.vue";
import {ref, watch} from "vue";
import {useDisplay} from "vuetify";
import {useI18n} from "vue-i18n";
import {ApiApi, ApiInventoryEntryListRequest, Food, InventoryEntry, InventoryLocation} from "@/openapi";
import type {RouteLocationRaw} from "vue-router";
import {ErrorMessageType, MessageType, useMessageStore} from "@/stores/MessageStore";
import {useInventoryActions} from "@/composables/useInventoryActions";
import {usePantryBatchActions} from "@/composables/usePantryBatchActions";
import type {PantrySortKey} from "@/utils/pantry_utils";

const {mobile} = useDisplay()
const {t} = useI18n()
const food = ref<Food | undefined>(undefined)
const inventoryLocation = ref<InventoryLocation | undefined>(undefined)
const sortField = ref<PantrySortKey | null>(null)
const sortDescending = ref(false)
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

// The Food chosen in the drawer is also what "Add" quick-adds, so keep the full Food (shelf lives and all).
watch(() => filters.value.foodId, id => {
    if (!id) {
        food.value = undefined
        return
    }
    new ApiApi().apiFoodRetrieve({id}).then(r => {
        food.value = r
    }).catch(err => {
        useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
    })
})

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

const addDialog = ref(false)

/** With a food filtered, Add is the quick add for it; otherwise the add dialog, which has its own food picker. */
function onAdd() {
    if (food.value) quickAdd()
    else addDialog.value = true
}

// #4: quick-add a lot for the food currently chosen in the Food filter, without leaving the page.
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
const headerActions: Array<{key: string, labelKey: string, icon: string, color?: string, to?: RouteLocationRaw, action?: () => void, iconOnlyOnPhone?: boolean}> = [
    {key: 'stock', labelKey: 'StockUp', icon: '$pantry', action: () => stockUpDialog.value?.open()},
    {key: 'use', labelKey: 'UseUp', icon: '$pantry', action: () => useUpDialog.value?.open()},
    {key: 'booking', labelKey: 'InventoryBooking', icon: 'fa-solid fa-boxes-stacked fa-fw', color: 'create', to: {name: 'InventoryBookingPage'}, iconOnlyOnPhone: true},
]

</script>

<style scoped>

</style>
