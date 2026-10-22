<template>
    <div>
        <!-- search is a filter in the drawer (so it shows as a chip, like the rest). The Food selector and Add
             take the field's place so Filters, Select, Food and Add share one line; the selector is the same
             Food filter the drawer has, so the two never disagree. -->
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
                <div class="d-flex align-center ga-2" style="min-width: 0">
                    <model-select
                        model="Food"
                        :model-value="foodId"
                        @update:model-value="onFoodPicked"
                        :object="false"
                        density="compact"
                        mode="single"
                        :can-clear="true"
                        :search-on-load="true"
                        hide-details
                        class="flex-grow-1"
                        style="min-width: 0"
                    />
                    <!-- same height as the field beside it; icon-only on a phone to leave the field room -->
                    <v-btn v-if="mobile" icon="$pantry" color="create" variant="tonal" height="40" width="40"
                           :title="$t('Add')" :aria-label="$t('Add')" data-test="pantry-add" @click="emit('add')"></v-btn>
                    <v-btn v-else color="create" variant="tonal" height="40" prepend-icon="$pantry"
                           data-test="pantry-add" @click="emit('add')">{{ $t('Add') }}</v-btn>
                </div>
            </template>
        </list-toolbar>

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
import ModelSelect from "@/components/inputs/ModelSelect.vue";
import ListToolbar from "@/components/model_list/ListToolbar.vue";
import ModelListFilterChips from "@/components/model_list/ModelListFilterChips.vue";
import FilterPanel from "@/components/model_list/FilterPanel.vue";
import TabbedDrawer from "@/components/common/TabbedDrawer.vue";
import {useUrlFilters} from "@/composables/useUrlFilters";
import {INVENTORY_ENTRY_FILTER_DEFS} from "@/composables/modellist/InventoryEntryList";
import type {ApiInventoryEntryListRequest} from "@/openapi";

defineProps<{
    selectMode?: boolean
}>()

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

function onFoodPicked(value: unknown) {
    setFilter('foodId', value != null ? String(value) : undefined)
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
