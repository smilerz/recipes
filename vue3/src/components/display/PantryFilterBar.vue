<template>
    <div>
        <!-- search is a filter in the drawer (so it shows as a chip, like the rest). On desktop the Food and Location
             pickers and Add share the toolbar's row with Filters and Select (Add anchoring the end, and the column
             titles sort the list). On a phone that row has no room: the toolbar keeps Filters, Select and a sort icon,
             and the pickers and Add take their own line right under it. The Food picker is the same Food filter the
             drawer has, so the two never disagree. -->
        <list-toolbar
            has-filters
            disable-search
            :has-settings="false"
            has-multi-select
            :select-mode="selectMode"
            :active-filter-count="activeFilterCount"
            :show-reset="activeFilterCount > 0"
            @toggle-select="emit('toggle-select')"
            @open-filters="drawerOpen = true"
            @reset="clearAllFilters"
        >
            <template #search>
                <pantry-fields v-if="!mobile" :food-id="foodId" v-model:inventory-location="inventoryLocation"
                               @update:food-id="onFoodPicked" @add="emit('add')"></pantry-fields>
                <sort-menu-button v-else data-test="pantry-sort" icon-only size="small" :options="PANTRY_SORT_OPTIONS" :field="sortField"
                                  :descending="sortDescending" :label="$t('Sort')" @select="onSortSelect"></sort-menu-button>
            </template>
        </list-toolbar>

        <pantry-fields v-if="mobile" class="mt-2" :food-id="foodId" v-model:inventory-location="inventoryLocation"
                       @update:food-id="onFoodPicked" @add="emit('add')"></pantry-fields>

        <model-list-filter-chips
            v-if="activeFilterCount > 0"
            :filter-defs="filterDefs"
            :get-filter="getFilter"
            :set-filter="setFilter"
            :clear-filter="clearFilter"
            :clear-all-filters="clearAllFilters"
            :active-filter-count="activeFilterCount"
            @open-filters="drawerOpen = true"
        />

        <tabbed-drawer v-model="drawerOpen" :tabs="TABS" :pinnable="false">
            <template #filters>
                <filter-panel
                    :grouped-filter-defs="groupedFilterDefs"
                    :get-filter="getFilter"
                    :set-filter="setFilter"
                    :clear-filter="clearFilter"
                    :clear-all-filters="clearAllFilters"
                    :active-filter-count="activeFilterCount"
                />
            </template>
        </tabbed-drawer>
    </div>
</template>

<script setup lang="ts">

import {computed, onMounted, ref, watch} from "vue";
import {useDisplay} from "vuetify";
import {useI18n} from "vue-i18n";
import {useRoute} from "vue-router";
import PantryFields from "@/components/display/PantryFields.vue";
import SortMenuButton from "@/components/common/SortMenuButton.vue";
import ListToolbar from "@/components/model_list/ListToolbar.vue";
import ModelListFilterChips from "@/components/model_list/ModelListFilterChips.vue";
import FilterPanel from "@/components/model_list/FilterPanel.vue";
import TabbedDrawer from "@/components/common/TabbedDrawer.vue";
import {useUrlFilters} from "@/composables/useUrlFilters";
import {INVENTORY_ENTRY_FILTER_DEFS} from "@/composables/modellist/InventoryEntryList";
import {nextSort} from "@/utils/sort";
import {PANTRY_SORT_OPTIONS, type PantrySortKey} from "@/utils/pantry_utils";
import type {ApiInventoryEntryListRequest, InventoryLocation} from "@/openapi";

defineProps<{
    selectMode?: boolean
}>()

// shared with the page, which hands them to the table
const inventoryLocation = defineModel<InventoryLocation | undefined>('inventoryLocation')
const sortField = defineModel<PantrySortKey | null>('sortField', {default: null})
const sortDescending = defineModel<boolean>('sortDescending', {default: false})

const emit = defineEmits<{
    update: [value: {query: string, filters: Partial<ApiInventoryEntryListRequest>}]
    'toggle-select': []
    add: []
}>()

const {t} = useI18n()
const route = useRoute()
const {mobile} = useDisplay()

const drawerOpen = ref(false)
const TABS = [{key: 'filters', label: t('Filters'), icon: 'fa-solid fa-filter'}]

const {filterDefs, groupedFilterDefs, filterParams, activeFilterCount, getFilter, setFilter, clearFilter, clearAllFilters}
    = useUrlFilters(computed(() => INVENTORY_ENTRY_FILTER_DEFS))

// the Food selector in the toolbar is the Food filter (the drawer's Food field edits the very same value)
const foodId = computed(() => getFilter('foodId') ? Number(getFilter('foodId')) : null)

function onFoodPicked(value: number | null) {
    setFilter('foodId', value != null ? String(value) : undefined)
}

/** The phone's sort icon: the same pick-again-to-flip-then-clear cycle as clicking a column title. */
function onSortSelect(key: string) {
    const next = nextSort({field: sortField.value, descending: sortDescending.value}, key)
    sortField.value = next.field as PantrySortKey | null
    sortDescending.value = next.descending
}

// the recipe ingredient menu opens the pantry with ?food_id= — that is the Food filter now
onMounted(() => {
    const foodId = Number(route.query.food_id)
    if (foodId && !Number.isNaN(foodId)) setFilter('foodId', String(foodId))
})

// the search text is just another filter in the drawer; the page and table take it separately
watch(filterParams, () => {
    const {query, ...filters} = filterParams.value as Partial<ApiInventoryEntryListRequest>
    emit('update', {query: query ?? '', filters})
}, {immediate: true})

</script>
