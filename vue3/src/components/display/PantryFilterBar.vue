<template>
    <div>
        <list-toolbar
            v-model:query="query"
            has-filters
            :has-settings="false"
            :active-filter-count="activeFilterCount"
            :show-reset="!!query || activeFilterCount > 0"
            @open-filters="drawerOpen = true"
            @reset="reset"
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

import {computed, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import ListToolbar from "@/components/model_list/ListToolbar.vue";
import ModelListFilterChips from "@/components/model_list/ModelListFilterChips.vue";
import FilterPanel from "@/components/model_list/FilterPanel.vue";
import TabbedDrawer from "@/components/common/TabbedDrawer.vue";
import {useUrlFilters} from "@/composables/useUrlFilters";
import {INVENTORY_ENTRY_FILTER_DEFS} from "@/composables/modellist/InventoryEntryList";
import type {ApiInventoryEntryListRequest} from "@/openapi";

const emit = defineEmits<{
    update: [value: {query: string, filters: Partial<ApiInventoryEntryListRequest>}]
}>()

const {t} = useI18n()

const query = ref('')
const drawerOpen = ref(false)
const TABS = [{key: 'filters', label: t('Filters'), icon: 'fa-solid fa-filter'}]

const {filterDefs, groupedFilterDefs, filterParams, activeFilterCount, getFilter, setFilter, clearFilter, clearAllFilters}
    = useUrlFilters(computed(() => INVENTORY_ENTRY_FILTER_DEFS))

function reset() {
    query.value = ''
    clearAllFilters()
}

watch([query, filterParams], () => {
    emit('update', {query: query.value, filters: filterParams.value as Partial<ApiInventoryEntryListRequest>})
}, {immediate: true})

</script>
