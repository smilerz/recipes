<template>
    <div>
        <!-- search is a filter in the drawer (so it shows as a chip, like the rest), not a box here -->
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
        />

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
import {useI18n} from "vue-i18n";
import {useRoute} from "vue-router";
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
}>()

const {t} = useI18n()
const route = useRoute()

const drawerOpen = ref(false)
const TABS = [{key: 'filters', label: t('Filters'), icon: 'fa-solid fa-filter'}]

const {filterDefs, groupedFilterDefs, filterParams, activeFilterCount, getFilter, setFilter, clearFilter, clearAllFilters}
    = useUrlFilters(computed(() => INVENTORY_ENTRY_FILTER_DEFS))

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
