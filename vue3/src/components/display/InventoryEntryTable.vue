<template>
    <div>
        <div v-if="!loading && items.length === 0" class="text-center text-medium-emphasis pa-6">
            {{ t('NoPantryEntries') }}
        </div>

        <div v-if="items.length" class="d-flex justify-end mb-2">
            <v-btn variant="text" size="small" class="text-none"
                   :append-icon="!sortField ? 'fa-solid fa-sort' : (sortDescending ? 'fa-solid fa-arrow-down-short-wide' : 'fa-solid fa-arrow-up-short-wide')">
                {{ sortField ? `${t('sort_by')} ${t(sortLabelKey!)}` : t('Sort') }}
                <v-menu activator="parent" close-on-content-click>
                    <v-list density="compact">
                        <v-list-item v-for="opt in SORT_OPTIONS" :key="opt.key" :active="sortField === opt.key" color="primary"
                                     @click="onSortSelect(opt.key)">
                            <template #append v-if="sortField === opt.key">
                                <v-icon size="small" :icon="sortDescending ? 'fa-solid fa-arrow-down-short-wide' : 'fa-solid fa-arrow-up-short-wide'"></v-icon>
                            </template>
                            {{ t(opt.labelKey) }}
                        </v-list-item>
                    </v-list>
                </v-menu>
            </v-btn>
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
                                <v-chip v-if="effectiveExpires(item)" size="small" label :color="expiryColor(expiryStatus(effectiveExpires(item), now))">
                                    {{ expiryDateLabel(effectiveExpires(item)!) }}
                                </v-chip>
                                <span v-else class="text-disabled">—</span>
                                <v-chip v-if="item.openedAt" size="x-small" variant="tonal" color="warning" class="ms-1" closable
                                        :data-test="`opened-chip-${item.id}`" @click:close="unopenLot(item)">
                                    {{ t('Opened') }} {{ expiryDateLabel(item.openedAt) }}
                                </v-chip>
                            </td>
                            <td class="text-end">
                                <v-btn-group divided border density="comfortable">
                                    <v-btn icon="fa-solid fa-clock-rotate-left" :title="t('History')" @click="openLog(item)"></v-btn>
                                    <v-btn icon="fa-solid fa-lock-open" :title="openTitle(item)" :data-test="`open-lot-${item.id}`" @click="openLot(item)"
                                           :class="{'open-lot-btn--inactive': !canOpen(item)}"></v-btn>
                                    <v-btn icon="$edit" :title="t('Edit')" :data-test="`edit-lot-${item.id}`" @click="openBooking(item)"></v-btn>
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
                            <v-chip v-if="effectiveExpires(item)" size="small" label class="me-2" :color="expiryColor(expiryStatus(effectiveExpires(item), now))">
                                {{ expiryDateLabel(effectiveExpires(item)!) }}
                            </v-chip>
                            <v-chip v-if="item.openedAt" size="x-small" variant="tonal" color="warning" class="me-2" closable
                                    :data-test="`opened-chip-${item.id}`" @click:close="unopenLot(item)">
                                {{ t('Opened') }} {{ expiryDateLabel(item.openedAt) }}
                            </v-chip>
                            <v-btn icon="$menu" variant="text" size="small" :aria-label="t('Actions')">
                                <v-icon icon="$menu"></v-icon>
                                <v-menu activator="parent">
                                    <v-list density="compact">
                                        <v-list-item :title="t('History')" prepend-icon="fa-solid fa-clock-rotate-left" @click="openLog(item)"></v-list-item>
                                        <v-list-item :title="openTitle(item)" prepend-icon="fa-solid fa-lock-open" :data-test="`open-lot-${item.id}`"
                                                     :class="{'open-lot-btn--inactive': !canOpen(item)}" @click="openLot(item)"></v-list-item>
                                        <v-list-item :title="t('Edit')" prepend-icon="$edit" @click="openBooking(item)"></v-list-item>
                                    </v-list>
                                </v-menu>
                            </v-btn>
                        </template>
                    </v-list-item>
                </v-list>
            </div>
        </template>

        <inventory-entry-log-dialog v-model="entryLogDialog" :inventory-entry="entryLogEntry ?? undefined"></inventory-entry-log-dialog>
        <pantry-booking-dialog v-model="bookingDialog" :booking-mode="bookingMode" :inventory-entry-id="bookingEntry?.id" @update="load"></pantry-booking-dialog>
    </div>
</template>

<script setup lang="ts">

import {ApiApi, ApiInventoryEntryListRequest, Food, InventoryEntry, InventoryLocation} from "@/openapi";
import {computed, PropType, ref, watch} from "vue";
import {useDisplay} from "vuetify";
import {useI18n} from "vue-i18n";
import InventoryEntryLogDialog from "@/components/dialogs/InventoryEntryLogDialog.vue";
import PantryBookingDialog from "@/components/dialogs/PantryBookingDialog.vue";
import {expiryColor, expiryDateLabel, expiryStatus, pantryGroup} from "@/utils/pantry_utils.ts";
import {ErrorMessageType, MessageType, StructuredMessage, useMessageStore} from "@/stores/MessageStore.ts";

const {t} = useI18n()
const {mobile} = useDisplay()

const props = defineProps({
    food: {type: Object as PropType<Food | null>, required: false},
    inventoryLocation: {type: Object as PropType<InventoryLocation | null>, required: false},
})

const now = new Date()
const items = ref<InventoryEntry[]>([])
const loading = ref(false)

const entryLogDialog = ref(false)
const entryLogEntry = ref<InventoryEntry | null>(null)
const bookingDialog = ref(false)
const bookingMode = ref('edit')
const bookingEntry = ref<InventoryEntry | null>(null)

const byExpiry = (a: InventoryEntry, b: InventoryEntry) =>
    (a.expires ? a.expires.getTime() : Infinity) - (b.expires ? b.expires.getTime() : Infinity)
const byName = (a: InventoryEntry, b: InventoryEntry) => a.food.name.localeCompare(b.food.name)
const byAmount = (a: InventoryEntry, b: InventoryEntry) => (a.amount ?? 0) - (b.amount ?? 0)
const byLocation = (a: InventoryEntry, b: InventoryEntry) => a.inventoryLocation.name.localeCompare(b.inventoryLocation.name)

/** #12: the pantry table had no user-controllable sort — each group used a fixed comparator
 * (expires for Expired/Expiring, name for In Stock). Picking a field here overrides ALL groups
 * uniformly; leaving nothing picked (the common case) keeps each group's original default sort
 * exactly as before, so the initial view is unchanged. */
const SORT_OPTIONS = [
    {key: 'expires', labelKey: 'Expires'},
    {key: 'name', labelKey: 'Food'},
    {key: 'amount', labelKey: 'Amount'},
    {key: 'location', labelKey: 'InventoryLocation'},
] as const
type SortKey = typeof SORT_OPTIONS[number]['key']

const sortField = ref<SortKey | null>(null)
const sortDescending = ref(false)
const sortLabelKey = computed(() => SORT_OPTIONS.find(o => o.key === sortField.value)?.labelKey)

function comparatorFor(key: SortKey): (a: InventoryEntry, b: InventoryEntry) => number {
    switch (key) {
        case 'name': return byName
        case 'amount': return byAmount
        case 'location': return byLocation
        case 'expires': return byExpiry
    }
}

function onSortSelect(key: SortKey) {
    if (sortField.value === key) {
        sortDescending.value = !sortDescending.value
    } else {
        sortField.value = key
        sortDescending.value = false
    }
}

function sortGroup(entries: InventoryEntry[], fallback: (a: InventoryEntry, b: InventoryEntry) => number): InventoryEntry[] {
    const cmp = sortField.value ? comparatorFor(sortField.value) : fallback
    const sorted = [...entries].sort(cmp)
    return sortField.value && sortDescending.value ? sorted.reverse() : sorted
}

const groups = computed(() => [
    {
        key: 'expired',
        title: t('Expired'),
        items: sortGroup(items.value.filter(i => pantryGroup(effectiveExpires(i), now) === 'expired'), byExpiry),
    },
    {
        key: 'expiring',
        title: t('ExpiringSoon'),
        items: sortGroup(items.value.filter(i => pantryGroup(effectiveExpires(i), now) === 'expiring'), byExpiry),
    },
    {
        key: 'instock',
        title: t('InStock'),
        items: sortGroup(items.value.filter(i => pantryGroup(effectiveExpires(i), now) === 'instock'), byName),
    },
])

function qtyLabel(item: InventoryEntry): string {
    return item.unit?.name ? `${item.amount} ${item.unit.name}` : String(item.amount)
}

/** True when a lot is currently frozen but its food has no frozen shelf-life number configured —
 * "nothing to suggest" server-side (see recompute_lot_expiry), so any expires value still on the
 * entry predates being frozen and is no longer meaningful. Freezing arrests decay; without this, a
 * stale pre-freeze date keeps counting down (or can even show as already "Expired") for an item
 * that's actually safely frozen — the backend deliberately never clears the stale value itself, but
 * the display shouldn't treat it as live either. */
function isFrozenWithoutSuggestion(item: InventoryEntry): boolean {
    return !!item.inventoryLocation.isFreezer && item.food.shelfLifeDaysFrozen == null
}

/** The expiry date to actually treat a lot as having, for both grouping and display — null (no
 * known expiry, same as a lot that was never dated) while frozen with nothing to suggest,
 * regardless of whatever stale value the entry still carries from before it was frozen. */
function effectiveExpires(item: InventoryEntry): Date | null | undefined {
    return isFrozenWithoutSuggestion(item) ? null : item.expires
}

/** "Open" only applies to a food that has an opened shelf life configured — otherwise the concept
 * doesn't mean anything for it (e.g. non-perishables with no opened-vs-sealed distinction). The
 * button stays visible but disabled in both cases below (never hidden/removed) so the row's action
 * icons never shift position or count depending on the food — a disabled control with an
 * explanatory tooltip is a continuous, expected UI state; an invisible gap in a button group reads
 * as a rendering glitch. */
function canOpen(item: InventoryEntry): boolean {
    return !item.openedAt && item.food.shelfLifeDaysOpened != null
}

/** Tooltip/label text explaining the Open button's current state — always says something, even
 * when disabled, rather than leaving the user to guess why it doesn't respond. */
function openTitle(item: InventoryEntry): string {
    if (item.openedAt) return t('Opened')
    if (item.food.shelfLifeDaysOpened == null) return t('OpenNotApplicable')
    return t('Open')
}


function openLog(item: InventoryEntry) {
    entryLogEntry.value = item
    entryLogDialog.value = true
}

/** Mark a lot opened — starts (or, if the lot is still frozen, records but doesn't yet apply) the
 * Opened shelf-life clock. Surfaces the result via a toast rather than a pre-commit preview
 * dialog, since the suggested date can only be computed server-side (it depends on the food's
 * three shelf-life fields and the lot's current freezer status) — same "never silent" spirit as
 * the move-triggered recompute, just after the fact instead of before.
 *
 * The message is keyed directly off the lot's actual freezer status, not `r.expires` truthiness —
 * the Open action is only ever reachable (see canOpen) for a food with an opened shelf life
 * configured, so a non-frozen lot always gets a real recomputed date; freezer status is the only
 * remaining reason the clock wouldn't start yet. */
/** The Open action stays visually muted (v-btn--disabled/v-list-item--disabled classes) but is
 * never natively `:disabled` — a native-disabled control can't receive any click/tap event at
 * all, on desktop or mobile, so a native `title` tooltip (hover-only, invisible on touch) was the
 * only explanation reachable. Tapping/clicking a non-actionable lot now shows the same
 * explanation as an info toast instead of calling the API — works identically on touch and mouse. */
function openLot(item: InventoryEntry) {
    if (!canOpen(item)) {
        useMessageStore().addMessage(MessageType.INFO, openTitle(item), 4000)
        return
    }
    new ApiApi().apiInventoryEntryOpenCreate({id: item.id!}).then(r => {
        Object.assign(item, r)
        const text = item.inventoryLocation.isFreezer ? t('OpenedStillFrozen') : t('OpenedExpiryUpdated', {date: expiryDateLabel(r.expires!)})
        useMessageStore().addMessage(MessageType.SUCCESS, {title: t('Opened'), text} as StructuredMessage, 4000)
    }).catch(err => {
        useMessageStore().addError(ErrorMessageType.UPDATE_ERROR, err)
    })
}

/** Undo: clear opened_at. The lot's expiry reverts to whatever the sealed-state formula gives it
 * for its current location — no hidden "original date" snapshot to restore. */
function unopenLot(item: InventoryEntry) {
    new ApiApi().apiInventoryEntryOpenDestroy({id: item.id!}).then(r => {
        Object.assign(item, r)
    }).catch(err => {
        useMessageStore().addError(ErrorMessageType.UPDATE_ERROR, err)
    })
}

// #2: Remove/Move/Edit collapsed into a single Edit mode (tabbed Amount/Location) on the shared
// PantryBookingDialog.
function openBooking(item: InventoryEntry) {
    bookingEntry.value = item
    bookingMode.value = 'edit'
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
/* Visual-only "muted" look for the Open action when it doesn't apply — deliberately NOT
   Vuetify's own v-btn--disabled/v-list-item--disabled classes, both of which bake in
   `pointer-events: none`. That's exactly what native `:disabled` did: it blocks ALL real
   pointer/touch interaction, not just Playwright's synthetic actionability check (confirmed live
   — a raw dispatchEvent()-based click bypasses hit-testing and gives a false pass; a real
   click/tap does not). The whole point of this control is that it stays genuinely tappable so its
   explanation is reachable — see openLot(). */
.open-lot-btn--inactive {
    opacity: 0.26;
}
</style>
