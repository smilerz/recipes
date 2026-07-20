<template>
    <v-dialog :fullscreen="mobile" v-model="showDialog" max-width="640px" scrollable>
        <v-card>
            <v-closable-card-title :title="$t('StockUp')" icon="$pantry" v-model="showDialog"></v-closable-card-title>

            <v-card-text>
                <div v-if="loading" class="text-center pa-6">
                    <v-progress-circular indeterminate color="primary"></v-progress-circular>
                </div>
                <div v-else-if="rows.length === 0" class="text-center text-medium-emphasis pa-6">
                    {{ $t('NoRecentPurchases') }}
                </div>
                <template v-else>
                    <closable-help-alert :text="$t('StockUpHelp')"></closable-help-alert>
                    <v-card v-for="row in rows" :key="`${row.food.id}-${row.unit?.id ?? 'none'}`" border class="mb-2">
                        <v-card-text class="pb-1">
                            <v-checkbox v-model="row.checked" :label="row.food.name" hide-details density="compact"></v-checkbox>
                        </v-card-text>
                        <v-card-text v-if="row.checked" class="pt-0">
                            <v-row density="compact" align="center">
                                <v-col cols="12" sm="3">
                                    <v-number-input :label="$t('Amount')" v-model="row.amount" :precision="2" :min="0" control-variant="hidden" hide-details density="compact"></v-number-input>
                                </v-col>
                                <v-col cols="6" sm="3">
                                    <model-select :label="$t('Unit')" v-model="row.unit" model="Unit" hide-details density="compact" append-to-body inline></model-select>
                                </v-col>
                                <v-col cols="6" sm="3">
                                    <v-select :label="$t('Location')" v-model="row.location" :items="locations" item-title="name" return-object
                                              hide-details density="compact" @update:model-value="onRowLocationChange(row)"></v-select>
                                </v-col>
                                <v-col cols="12" sm="3">
                                    <v-text-field :label="$t('Expires')" v-model="row.expires" type="date" hide-details density="compact">
                                        <template #append-inner v-if="row.location?.isFreezer">
                                            <v-btn icon="fa-solid fa-snowflake" size="small" density="compact" variant="plain"
                                                   data-test="freezer-expiry-btn" :title="$t('Freezer')" :aria-label="$t('Freezer')" @click.stop="openFreezerPrefill(row)"></v-btn>
                                        </template>
                                    </v-text-field>
                                </v-col>
                            </v-row>
                        </v-card-text>
                    </v-card>
                    <freezer-expiry-dialog v-model="freezerDialog" v-model:date="freezerDate"></freezer-expiry-dialog>
                </template>
            </v-card-text>

            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn variant="text" @click="showDialog = false">{{ $t('Cancel') }}</v-btn>
                <v-btn color="save" variant="flat" :loading="saving" :disabled="checkedCount === 0" @click="confirm">
                    {{ $t('StockUp') }} ({{ checkedCount }})
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">

import {computed, ref} from "vue";
import {useDisplay} from "vuetify";
import {useI18n} from "vue-i18n";
import {DateTime} from "luxon";
import {ApiApi, Food, InventoryLocation, Unit} from "@/openapi";
import ModelSelect from "@/components/inputs/ModelSelect.vue";
import VClosableCardTitle from "@/components/dialogs/VClosableCardTitle.vue";
import FreezerExpiryDialog from "@/components/dialogs/FreezerExpiryDialog.vue";
import ClosableHelpAlert from "@/components/display/ClosableHelpAlert.vue";
import {stockUpItemsFromRows, stockUpRowsFromEntries} from "@/utils/pantry_utils.ts";
import {ErrorMessageType, MessageType, useMessageStore} from "@/stores/MessageStore.ts";

interface Row {
    food: Food
    checked: boolean
    amount: number
    unit: Unit | null
    expires: string | null // YYYY-MM-DD for the native date input
    seedExpires: string | null // the shelf-life auto-suggestion this row opened with
    location: InventoryLocation | null
}

const {t} = useI18n()
const {mobile} = useDisplay()
const emit = defineEmits(['stocked'])

const showDialog = ref(false)
const loading = ref(false)
const saving = ref(false)
const rows = ref<Row[]>([])
const locations = ref<InventoryLocation[]>([])

const checkedCount = computed(() => rows.value.filter(r => r.checked).length)

// One shared FreezerExpiryDialog targets whichever row's snowflake was tapped; it v-models a JS
// Date while the row field is a date-only ISO string — glue both ways.
const freezerDialog = ref(false)
const freezerRow = ref<Row | null>(null)
const freezerDate = computed<Date>({
    get: () => freezerRow.value?.expires ? new Date(`${freezerRow.value.expires}T00:00:00`) : new Date(),
    set: (d: Date) => { if (freezerRow.value) freezerRow.value.expires = DateTime.fromJSDate(d).toISODate() },
})

function openFreezerPrefill(row: Row) {
    freezerRow.value = row
    freezerDialog.value = true
}

/**
 * DEC-4 B, frontend half: the shelf-life suggestion is pantry data — sending it explicitly for a
 * freezer row would bypass the backend's freezer mute. Clear the untouched suggestion when a row
 * moves into a freezer, restore it when it moves back out; a user-typed date is left alone.
 */
function onRowLocationChange(row: Row) {
    // ''-vs-null is load-bearing: a user clearing the native date input yields '', so the restore
    // branch (=== null) can only fire on freezer-muted rows — manual clears stay cleared.
    if (row.location?.isFreezer && row.expires === row.seedExpires) {
        row.expires = null
    } else if (!row.location?.isFreezer && row.expires === null) {
        row.expires = row.seedExpires
    }
}

/**
 * Open the dialog, seeding rows from recently checked-off shopping items (FR-F1). Each row uses
 * the entry's OWN amount/unit; an information-free entry falls back to the food's pack; no unit
 * is ever invented (D3/DEC-1). Foods are refetched because the entry's nested food payload lacks
 * the pack and shelf-life fields.
 */
async function open() {
    showDialog.value = true
    loading.value = true
    rows.value = []
    // a snowflake picker left open when the dialog last closed must not pop for a dead row
    freezerDialog.value = false
    freezerRow.value = null
    const api = new ApiApi()
    try {
        const [checked, locationList] = await Promise.all([
            api.apiShoppingListEntryList({checked: true, pageSize: 50}),
            // locations are optional (null -> backend default); their failure must not kill seeding
            api.apiInventoryLocationList({pageSize: 100}).catch(() => ({results: []})),
        ])
        // lowest id first — mirrors the server's default-location pick (FR-B5)
        locations.value = (locationList.results ?? []).sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
        const defaultLocation = locations.value[0] ?? null
        const entries = (checked.results ?? []).filter(e => e.food?.id != null)
        const foodIds = [...new Set(entries.map(e => e.food!.id!))]
        const foods = await Promise.all(foodIds.map(id => api.apiFoodRetrieve({id})))
        const foodById = new Map(foods.map(f => [f.id!, f]))
        rows.value = stockUpRowsFromEntries(entries, id => foodById.get(id)).map(seed => {
            const iso = seed.expires ? DateTime.fromJSDate(seed.expires).toISODate() : null
            const row: Row = {
                food: seed.food,
                checked: true,
                amount: seed.amount,
                unit: seed.unit,
                expires: iso,
                seedExpires: iso,
                location: defaultLocation,
            }
            onRowLocationChange(row) // a freezer default location mutes the suggestion immediately
            return row
        })
    } catch (err) {
        useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
    } finally {
        loading.value = false
    }
}

async function confirm() {
    saving.value = true
    const items = stockUpItemsFromRows(rows.value)
    try {
        await new ApiApi().apiInventoryEntryStockUpCreate({stockUp: {items}})
        useMessageStore().addMessage(MessageType.SUCCESS, t('StockedN', {count: items.length}), 3000)
        emit('stocked')
        showDialog.value = false
    } catch (err) {
        useMessageStore().addError(ErrorMessageType.CREATE_ERROR, err)
    } finally {
        saving.value = false
    }
}

defineExpose({open})
</script>

<style scoped>

</style>
