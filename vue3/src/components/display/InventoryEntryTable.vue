<template>
    <div>
        <div v-if="!loading && items.length === 0" class="text-center text-medium-emphasis pa-6">
            {{ t('NoPantryEntries') }}
        </div>

        <template v-for="group in groups" :key="group.key">
            <div v-if="group.items.length" class="mb-6">
                <div class="text-overline text-medium-emphasis px-1 mb-1">{{ group.title }}</div>

                <!-- desktop -->
                <v-table v-if="!mobile" density="comfortable">
                    <thead>
                        <tr>
                            <th>{{ t('Food') }}</th>
                            <th>{{ t('Amount') }}</th>
                            <th>{{ t('InventoryLocation') }}</th>
                            <th>{{ t('Expires') }}</th>
                            <th class="text-end">{{ t('Actions') }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="item in group.items" :key="item.id">
                            <td>{{ item.food.name }}</td>
                            <td>{{ qtyLabel(item) }}</td>
                            <td>
                                {{ item.inventoryLocation.name }}
                                <v-icon v-if="item.inventoryLocation.isFreezer" icon="fa-solid fa-snowflake" size="x-small" class="ms-1"></v-icon>
                                <span v-if="item.subLocation" class="text-body-2 text-disabled">· {{ item.subLocation }}</span>
                            </td>
                            <td>
                                <v-chip v-if="item.expires" size="small" label :color="expiryColor(expiryStatus(item.expires, now))">
                                    {{ expiryDateLabel(item.expires) }}
                                </v-chip>
                                <span v-else class="text-disabled">—</span>
                            </td>
                            <td class="text-end">
                                <v-btn-group divided border density="comfortable">
                                    <v-btn icon="fa-solid fa-clock-rotate-left" :title="t('History')" @click="openLog(item)"></v-btn>
                                    <v-btn icon="fa-solid fa-minus" :title="t('Remove')" @click="openBooking('remove', item)"></v-btn>
                                    <v-btn icon="fa-solid fa-arrow-right" :title="t('Move')" @click="openBooking('move', item)"></v-btn>
                                </v-btn-group>
                            </td>
                        </tr>
                    </tbody>
                </v-table>

                <!-- mobile -->
                <v-list v-else density="comfortable">
                    <v-list-item v-for="item in group.items" :key="item.id">
                        <v-list-item-title>{{ item.food.name }}</v-list-item-title>
                        <v-list-item-subtitle>
                            {{ qtyLabel(item) }} · {{ item.inventoryLocation.name }}
                        </v-list-item-subtitle>
                        <template #append>
                            <v-chip v-if="item.expires" size="small" label class="me-2" :color="expiryColor(expiryStatus(item.expires, now))">
                                {{ expiryDateLabel(item.expires) }}
                            </v-chip>
                            <v-btn icon="$menu" variant="text" size="small" :aria-label="t('Actions')">
                                <v-icon icon="$menu"></v-icon>
                                <v-menu activator="parent">
                                    <v-list density="compact">
                                        <v-list-item :title="t('History')" prepend-icon="fa-solid fa-clock-rotate-left" @click="openLog(item)"></v-list-item>
                                        <v-list-item :title="t('Remove')" prepend-icon="fa-solid fa-minus" @click="openBooking('remove', item)"></v-list-item>
                                        <v-list-item :title="t('Move')" prepend-icon="fa-solid fa-arrow-right" @click="openBooking('move', item)"></v-list-item>
                                    </v-list>
                                </v-menu>
                            </v-btn>
                        </template>
                    </v-list-item>
                </v-list>
            </div>
        </template>

        <inventory-entry-log-dialog v-model="entryLogDialog" :inventory-entry="entryLogEntry"></inventory-entry-log-dialog>
        <pantry-booking-dialog v-model="bookingDialog" :booking-mode="bookingMode" :inventory-entry-id="bookingEntry?.id" @update="load"></pantry-booking-dialog>
    </div>
</template>

<script setup lang="ts">

import {ApiApi, ApiInventoryEntryListRequest, Ingredient, InventoryEntry, InventoryLocation} from "@/openapi";
import {computed, PropType, ref, watch} from "vue";
import {useDisplay} from "vuetify";
import {useI18n} from "vue-i18n";
import InventoryEntryLogDialog from "@/components/dialogs/InventoryEntryLogDialog.vue";
import PantryBookingDialog from "@/components/dialogs/PantryBookingDialog.vue";
import {expiryColor, expiryDateLabel, expiryStatus, pantryGroup} from "@/utils/pantry_utils.ts";
import {ErrorMessageType, useMessageStore} from "@/stores/MessageStore.ts";

const {t} = useI18n()
const {mobile} = useDisplay()

const props = defineProps({
    food: {type: Object as PropType<Ingredient | null>, required: false},
    inventoryLocation: {type: Object as PropType<InventoryLocation | null>, required: false},
})

const now = new Date()
const items = ref<InventoryEntry[]>([])
const loading = ref(false)

const entryLogDialog = ref(false)
const entryLogEntry = ref<InventoryEntry | null>(null)
const bookingDialog = ref(false)
const bookingMode = ref('move')
const bookingEntry = ref<InventoryEntry | null>(null)

const byExpiry = (a: InventoryEntry, b: InventoryEntry) =>
    (a.expires ? a.expires.getTime() : Infinity) - (b.expires ? b.expires.getTime() : Infinity)
const byName = (a: InventoryEntry, b: InventoryEntry) => a.food.name.localeCompare(b.food.name)

const groups = computed(() => [
    {
        key: 'expiring',
        title: t('ExpiringSoon'),
        items: items.value.filter(i => pantryGroup(i.expires, now) === 'expiring').sort(byExpiry),
    },
    {
        key: 'instock',
        title: t('InStock'),
        items: items.value.filter(i => pantryGroup(i.expires, now) === 'instock').sort(byName),
    },
])

function qtyLabel(item: InventoryEntry): string {
    return item.unit?.name ? `${item.amount} ${item.unit.name}` : String(item.amount)
}


function openLog(item: InventoryEntry) {
    entryLogEntry.value = item
    entryLogDialog.value = true
}

// Remove / move a lot through the shared PantryBookingDialog (upstream's row-action flow).
function openBooking(mode: 'remove' | 'move', item: InventoryEntry) {
    bookingEntry.value = item
    bookingMode.value = mode
    bookingDialog.value = true
}

function load() {
    loading.value = true
    const parameters: ApiInventoryEntryListRequest = {pageSize: 500}
    if (props.food) {
        parameters.foodId = props.food.id!
    }
    if (props.inventoryLocation) {
        parameters.inventoryLocationId = props.inventoryLocation.id!
    }
    new ApiApi().apiInventoryEntryList(parameters).then((r) => {
        items.value = r.results ?? []
    }).catch((err) => {
        useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
    }).finally(() => {
        loading.value = false
    })
}

watch(props, () => load(), {immediate: true})

defineExpose({load})
</script>

<style scoped>

</style>
