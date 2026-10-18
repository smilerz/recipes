<template>
    <v-dialog :fullscreen="mobile" v-model="showDialog" max-width="640px" scrollable>
        <v-card>
            <v-closable-card-title :title="$t('StockUp')" icon="$pantry" v-model="showDialog"></v-closable-card-title>

            <v-card-text>
                <lookback-period-select class="mb-3" :model-value="days" :options="options" @update:model-value="onPeriodChange"></lookback-period-select>
                <div v-if="loading" class="text-center pa-6">
                    <v-progress-circular indeterminate color="primary"></v-progress-circular>
                </div>
                <div v-else-if="rows.length === 0" class="text-center text-medium-emphasis pa-6">
                    {{ $t('NoRecentPurchases') }}
                </div>
                <template v-else>
                    <closable-help-alert :title="$t('StockUp')" :text="$t('StockUpHelp')"></closable-help-alert>
                    <div class="d-flex justify-end mb-1">
                        <v-btn variant="text" size="small" class="text-none" append-icon="fa-solid fa-caret-down">
                            {{ $t('Select') }}
                            <v-menu activator="parent" close-on-content-click>
                                <v-list density="compact">
                                    <v-list-item @click="setAllChecked(true)">{{ $t('SelectAll') }}</v-list-item>
                                    <v-list-item @click="setAllChecked(false)">{{ $t('SelectNone') }}</v-list-item>
                                </v-list>
                            </v-menu>
                        </v-btn>
                    </div>
                    <template v-for="group in groupedRows" :key="group.key">
                        <div v-if="group.label" class="text-caption text-medium-emphasis mt-2 mb-1 px-1">{{ group.label }}</div>
                        <v-card v-for="row in group.rows" :key="`${row.food.id}-${row.unit?.id ?? 'none'}`" border class="mb-2">
                        <v-card-text class="pb-1">
                            <div class="d-flex align-center">
                                <v-checkbox v-model="row.checked" :label="row.food.name" hide-details density="compact"></v-checkbox>
                                <pantry-jar-indicator :in-inventory="parseBooleanAnnotation(row.food.inInventory)" :earliest-expiry="row.food.earliestExpiry" class="ms-2"></pantry-jar-indicator>
                            </div>
                        </v-card-text>
                        <v-card-text class="pt-0" :class="{'text-medium-emphasis': !row.checked}">
                            <v-row density="compact" align="center">
                                <v-col cols="12" sm="2">
                                    <v-number-input :label="$t('Amount')" v-model="row.amount" :precision="2" :min="0" control-variant="hidden" hide-details density="compact" :disabled="!row.checked"></v-number-input>
                                </v-col>
                                <v-col cols="6" sm="4">
                                    <model-select :label="$t('Unit')" v-model="row.unit" model="Unit" hide-details density="compact" inline :disabled="!row.checked"></model-select>
                                </v-col>
                                <v-col cols="6" sm="3">
                                    <model-select :label="$t('Location')" v-model="row.location" model="InventoryLocation" :items="locations"
                                                  hide-details density="compact" inline :disabled="!row.checked" @update:model-value="onRowLocationChange(row)"></model-select>
                                </v-col>
                                <v-col cols="12" sm="3">
                                    <v-text-field :label="$t('Expires')" v-model="row.expires" type="date" hide-details density="compact" :disabled="!row.checked">
                                        <template #append-inner v-if="row.location?.isFreezer">
                                            <v-btn icon="fa-solid fa-snowflake" size="small" density="compact" variant="plain"
                                                   data-test="freezer-expiry-btn" :title="$t('Freezer')" :aria-label="$t('Freezer')" @click.stop="openFreezerPrefill(row)"></v-btn>
                                        </template>
                                    </v-text-field>
                                </v-col>
                            </v-row>
                        </v-card-text>
                        </v-card>
                    </template>
                    <div v-if="olderCount > 0" class="text-caption text-medium-emphasis text-center mt-2" data-test="stock-up-older-not-shown">
                        {{ $t('StockUpOlderNotShown', {count: olderCount}) }}
                    </div>
                    <expiry-preset-dialog v-model="freezerDialog" v-model:date="freezerDate"></expiry-preset-dialog>
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
        <action-confirm-dialog ref="confirmDialog"></action-confirm-dialog>
    </v-dialog>
</template>

<script setup lang="ts">

import {computed, ref} from "vue";
import {useDisplay} from "vuetify";
import {useI18n} from "vue-i18n";
import {DateTime} from "luxon";
import {ApiApi, FoodShopping, InventoryLocation, Unit} from "@/openapi";
import {parseBooleanAnnotation} from "@/utils/model_utils";
import ModelSelect from "@/components/inputs/ModelSelect.vue";
import VClosableCardTitle from "@/components/dialogs/VClosableCardTitle.vue";
import ActionConfirmDialog from "@/components/dialogs/ActionConfirmDialog.vue";
import ExpiryPresetDialog from "@/components/dialogs/ExpiryPresetDialog.vue";
import LookbackPeriodSelect from "@/components/inputs/LookbackPeriodSelect.vue";
import ClosableHelpAlert from "@/components/display/ClosableHelpAlert.vue";
import PantryJarIndicator from "@/components/display/PantryJarIndicator.vue";
import {stockUpItemsFromRows, stockUpRowsFromEntries} from "@/utils/pantry_utils.ts";
import {ErrorMessageType, MessageType, useMessageStore} from "@/stores/MessageStore.ts";
import {useLookbackPeriod} from "@/composables/useLookbackPeriod.ts";

interface Row {
    food: FoodShopping
    checked: boolean
    amount: number
    unit: Unit | null
    expires: string | null // YYYY-MM-DD for the native date input
    seedExpires: string | null // the shelf-life auto-suggestion this row opened with
    location: InventoryLocation | null
    completedAt: Date | null // shop date, drives the date-group headers
}

const {t} = useI18n()
const {mobile} = useDisplay()
const emit = defineEmits(['stocked'])

const showDialog = ref(false)
const loading = ref(false)
const saving = ref(false)
const rows = ref<Row[]>([])
const locations = ref<InventoryLocation[]>([])
const {days, options, since} = useLookbackPeriod('stockUp')
const PAGE_SIZE = 50
const olderCount = ref(0) // completed entries inside the period that did not fit on the page
const confirmDialog = ref<InstanceType<typeof ActionConfirmDialog> | null>(null)

// what the user can change on a row; compared with the state the rows loaded in to know whether a reload would lose edits
const editsSnapshot = () => JSON.stringify(rows.value.map(r => [r.checked, r.amount, r.unit?.id ?? null, r.location?.id ?? null, r.expires]))
let loadedSnapshot = ''

const checkedCount = computed(() => rows.value.filter(r => r.checked).length)

// rows arrive already sorted by shop date (newest first) then food name; cluster the contiguous
// same-day rows into groups so the template can show one date header per shopping day.
const groupedRows = computed(() => {
    const groups: {key: string, label: string, rows: Row[]}[] = []
    for (const row of rows.value) {
        const key = row.completedAt ? DateTime.fromJSDate(row.completedAt).toISODate()! : ''
        const last = groups[groups.length - 1]
        if (last && last.key === key) {
            last.rows.push(row)
        } else {
            groups.push({key, label: row.completedAt ? DateTime.fromJSDate(row.completedAt).toLocaleString(DateTime.DATE_MED) : '', rows: [row]})
        }
    }
    return groups
})

function setAllChecked(value: boolean) {
    for (const r of rows.value) r.checked = value
}

// One shared ExpiryPresetDialog targets whichever row's snowflake was tapped; it v-models a JS
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
    // a snowflake picker left open when the dialog last closed must not pop for a dead row
    freezerDialog.value = false
    freezerRow.value = null
    await load()
}

async function onPeriodChange(newDays: number) {
    if (newDays === days.value) return
    if (!loading.value && editsSnapshot() !== loadedSnapshot) {
        const discard = await confirmDialog.value!.open({title: t('LookBackChangeTitle'), message: t('LookBackChangeMessage'), confirmLabel: t('LookBackChangeConfirm')})
        if (!discard) return
    }
    days.value = newDays
    await load()
}

async function load() {
    loading.value = true
    rows.value = []
    olderCount.value = 0
    const api = new ApiApi()
    try {
        // unbounded checked=true history reads years-old purchases (FR-F1 regression); bound it to the chosen
        // period, newest first so the page holds the latest purchases when the period has more than fit.
        const [checked, locationList] = await Promise.all([
            api.apiShoppingListEntryList({checked: true, pageSize: PAGE_SIZE, updatedAfter: since(), ordering: '-completed_at'}),
            // locations are optional (null -> backend default); their failure must not kill seeding
            api.apiInventoryLocationList({pageSize: 100}).catch(() => ({results: []})),
        ])
        // lowest id first — mirrors the server's default-location pick (FR-B5)
        locations.value = (locationList.results ?? []).sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
        const defaultLocation = locations.value[0] ?? null
        const entries = (checked.results ?? []).filter(e => e.food?.id != null)
        // the nested food now carries pack + shelf life + in_inventory, so seed straight from the
        // list response — no per-food refetch (was an N+1 that made the dialog slow to open)
        const foodById = new Map(entries.map(e => [e.food!.id!, e.food!]))
        rows.value = stockUpRowsFromEntries(entries, id => foodById.get(id)).map(seed => {
            const iso = seed.expires ? DateTime.fromJSDate(seed.expires).toISODate() : null
            const row: Row = {
                food: seed.food,
                checked: seed.checked, // in-pantry foods seed unchecked (bought but not run out)
                amount: seed.amount,
                unit: seed.unit,
                expires: iso,
                seedExpires: iso,
                location: defaultLocation,
                completedAt: seed.completedAt,
            }
            onRowLocationChange(row) // a freezer default location mutes the suggestion immediately
            return row
        })
        olderCount.value = Math.max(0, (checked.count ?? 0) - (checked.results ?? []).length)
        loadedSnapshot = editsSnapshot()
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
