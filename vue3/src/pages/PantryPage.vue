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

                <inventory-entry-table ref="entryTable" :food="food" :inventory-location="inventoryLocation"></inventory-entry-table>
            </v-card-text>
        </v-card>

        <stock-up-dialog ref="stockUpDialog" @stocked="entryTable?.load()"></stock-up-dialog>
        <use-up-dialog ref="useUpDialog" @used="entryTable?.load()"></use-up-dialog>
        <inventory-quick-add-dialog ref="quickAddDialog"></inventory-quick-add-dialog>
    </v-container>
</template>

<script setup lang="ts">

import InventoryEntryTable from "@/components/display/InventoryEntryTable.vue";
import StockUpDialog from "@/components/dialogs/StockUpDialog.vue";
import UseUpDialog from "@/components/dialogs/UseUpDialog.vue";
import InventoryQuickAddDialog from "@/components/dialogs/InventoryQuickAddDialog.vue";
import ModelSelect from "@/components/inputs/ModelSelect.vue";
import {onMounted, ref} from "vue";
import {useDisplay} from "vuetify";
import {useI18n} from "vue-i18n";
import {ApiApi, Food, InventoryLocation} from "@/openapi";
import {useRoute} from "vue-router";
import {ErrorMessageType, useMessageStore} from "@/stores/MessageStore";
import {useInventoryActions} from "@/composables/useInventoryActions";

const route = useRoute()
const {mobile} = useDisplay()
const {t} = useI18n()
const food = ref<Food | undefined>(undefined)
const inventoryLocation = ref<InventoryLocation | undefined>(undefined)
const entryTable = ref<InstanceType<typeof InventoryEntryTable> | null>(null)
const stockUpDialog = ref<InstanceType<typeof StockUpDialog> | null>(null)
const useUpDialog = ref<InstanceType<typeof UseUpDialog> | null>(null)
const quickAddDialog = ref<InstanceType<typeof InventoryQuickAddDialog> | null>(null)

// #4: quick-add a lot for the food currently selected in the filter above, without leaving the page.
async function quickAdd() {
    if (!food.value || !quickAddDialog.value) return
    const {quickAddToInventory} = useInventoryActions()
    const added = await quickAddToInventory({id: food.value.id!, name: food.value.name}, quickAddDialog.value, t)
    if (added) entryTable.value?.load()
}

// Header actions, rendered in the card append on desktop and a wrapping row on mobile (DEFECT-02).
const headerActions = [
    {key: 'stock', labelKey: 'StockUp', icon: '$pantry', action: () => stockUpDialog.value?.open()},
    {key: 'use', labelKey: 'UseUp', icon: '$pantry', action: () => useUpDialog.value?.open()},
    {key: 'booking', labelKey: 'InventoryBooking', icon: 'fa-solid fa-boxes-stacked fa-fw', color: 'create', to: {name: 'InventoryBookingPage'}},
] as const

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
