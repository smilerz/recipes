<template>
    <v-container>
        <v-row v-if="!showDescription">
            <v-col>
                <v-card>
                    <v-card-text class="d-flex align-center pt-2 pb-2">
                        <v-btn variant="flat" @click="router.go(-1)" prepend-icon="fa-solid fa-arrow-left">{{ $t('Back') }}</v-btn>
                        <v-spacer />
                        <v-icon :icon="genericModel.model.icon" size="small" class="mr-2" />
                        <span class="text-subtitle-1 font-weight-medium">{{ $t(genericModel.model.localizationKey) }}</span>
                        <v-btn
                            v-if="genericModel.model.localizationKeyDescription"
                            icon="fa-solid fa-circle-info"
                            variant="plain"
                            size="small"
                            @click="showDescription = true"
                        />
                        <v-btn prepend-icon="fa-solid fa-rotate" color="success" size="small" @click="importAllRecipes()" v-if="genericModel.model.name == 'RecipeImport'">{{ $t('ImportAll') }}</v-btn>
                        <v-btn :prepend-icon="TInviteLink.icon" size="small" :to="{name: 'ModelListPage', params: {model: 'InviteLink'}}" v-if="genericModel.model.name == 'UserSpace'">{{ $t('Invites') }}</v-btn>
                        <model-list-create-button :model="model" :disable-create="genericModel.model.disableCreate" compact @change="loadItems({page: page})" />
                    </v-card-text>
                    <v-progress-linear
                        v-if="genericModel.model.name == 'AiLog'"
                        :model-value="useUserPreferenceStore().activeSpace.aiMonthlyCreditsUsed"
                        :max="useUserPreferenceStore().activeSpace.aiCreditsMonthly"
                        color="primary"
                        height="6"
                    />
                </v-card>
            </v-col>
        </v-row>

        <template v-else>
            <v-row>
                <v-col>
                    <v-card>
                        <v-card-text class="pt-2 pb-2">
                            <v-btn variant="flat" @click="router.go(-1)" prepend-icon="fa-solid fa-arrow-left">{{ $t('Back') }}</v-btn>
                        </v-card-text>
                    </v-card>
                </v-col>
            </v-row>

            <v-row dense>
                <v-col>
                    <v-card :prepend-icon="genericModel.model.icon" :title="$t(genericModel.model.localizationKey)">
                        <template #subtitle v-if="genericModel.model.localizationKeyDescription">
                            <div class="text-wrap">
                                {{ $t(genericModel.model.localizationKeyDescription) }}
                            </div>
                        </template>
                        <template #append>
                            <v-btn
                                v-if="genericModel.model.localizationKeyDescription"
                                icon="fa-solid fa-chevron-up"
                                variant="plain"
                                size="small"
                                @click="showDescription = false"
                            />
                            <model-list-create-button :model="model" :disable-create="genericModel.model.disableCreate" @change="loadItems({page: page})" />
                        </template>

                        <v-card-actions v-if="genericModel.model.name == 'RecipeImport'">
                            <v-btn prepend-icon="fa-solid fa-rotate" color="success" @click="importAllRecipes()">{{ $t('ImportAll') }}</v-btn>
                        </v-card-actions>

                        <v-card-text v-if="genericModel.model.name == 'AiLog'">
                            {{ $t('MonthlyCreditsUsed') }} ({{ useUserPreferenceStore().activeSpace.aiMonthlyCreditsUsed }} / {{
                                useUserPreferenceStore().activeSpace.aiCreditsMonthly
                            }})
                            {{ $t('AiCreditsBalance') }} : {{ useUserPreferenceStore().activeSpace.aiCreditsBalance }}
                            <v-progress-linear :model-value="useUserPreferenceStore().activeSpace.aiMonthlyCreditsUsed"
                                               :max="useUserPreferenceStore().activeSpace.aiCreditsMonthly"></v-progress-linear>
                        </v-card-text>
                        <v-card-actions v-if="genericModel.model.name == 'UserSpace'">
                            <v-btn :prepend-icon="TInviteLink.icon" :to="{name: 'ModelListPage', params: {model: 'InviteLink'}}">{{ $t('Invites') }}</v-btn>
                        </v-card-actions>
                    </v-card>
                </v-col>
            </v-row>
        </template>
        <v-row>
            <v-col>
                <ModelListToolbar
                    v-if="!genericModel.model.disableSearch"
                    v-model:query="query"
                    v-model:ordering="ordering"
                    :sort-options="genericModel.model.sortDefs ?? []"
                    :has-filters="hasEnhancedList"
                    :active-filter-count="activeFilterCount"
                    :has-multi-select="!genericModel.model.disableDelete || genericModel.model.isMerge"
                    :select-mode="selectMode"
                    @open-filters="openSettingsPanel('filters')"
                    @open-settings="openSettingsPanel('settings')"
                    @toggle-select="selectMode = !selectMode"
                />

                <model-list-data-table
                    :key="props.model"
                    :class="{'hide-table-headers': !showColumnHeaders}"
                    :dynamic-slots="columnSlots"
                    v-model="selectedItems"
                    return-object
                    @update:options="loadItems"
                    :items="items"
                    :items-length="itemCount"
                    :loading="loading"
                    :search="query"
                    :headers="visibleHeaders"
                    :items-per-page-options="itemsPerPageOptions"
                    :show-select="!genericModel.model.disableDelete || genericModel.model.isMerge"
                    :page="page"
                    :items-per-page="pageSize"
                    disable-sort
                >
                    <template v-slot:header.action v-if="selectedItems.length > 0">
                        <v-btn icon="fa-solid fa-ellipsis-v" variant="plain" color="info">
                            <v-icon icon="fa-solid fa-ellipsis-v"></v-icon>
                            <v-menu activator="parent" close-on-content-click>
                                <v-list density="compact" class="pt-1 pb-1" activatable>
                                    <v-list-item prepend-icon="fa-solid fa-list-check" @click="batchEditDialog = true" v-if="genericModel.model.name == 'Food'">
                                        {{ $t('BatchEdit') }}
                                    </v-list-item>
                                    <v-list-item prepend-icon="fa-solid fa-arrows-to-dot" @click="batchMergeDialog = true" v-if="genericModel.model.isMerge">
                                        {{ $t('Merge') }}
                                    </v-list-item>
                                    <v-list-item prepend-icon="$delete" @click="batchDeleteDialog = true" v-if="!genericModel.model.disableDelete">
                                        {{ $t('Delete_All') }}
                                    </v-list-item>
                                </v-list>
                            </v-menu>
                        </v-btn>
                    </template>
                    <template v-slot:item.space="{ item }" v-if="genericModel.model.name == 'AiProvider'">
                        <v-chip label v-if="item.space == null" color="success">{{ $t('Global') }}</v-chip>
                        <v-chip label v-else color="info">{{ $t('Space') }}</v-chip>
                    </template>
                    <template v-slot:item.groups="{ item }" v-if="genericModel.model.name == 'UserSpace'">
                        {{ item.groups.flatMap((x: Group) => x.name).join(', ') }}
                    </template>
                    <template v-slot:item.active="{ item }" v-if="genericModel.model.name == 'Space'">
                        <v-chip label v-if="item.id == useUserPreferenceStore().activeSpace.id!" color="success">{{ $t('Active') }}</v-chip>
                        <v-chip label v-else color="info" @click="useUserPreferenceStore().switchSpace(item)">{{ $t('Select') }}</v-chip>
                    </template>
                    <template v-slot:item.color="{ item }">
                        <v-chip label :color="item.color">{{ item.color }}</v-chip>
                    </template>
                    <template v-slot:item.isFreezer="{ item }" v-if="genericModel.model.name == 'InventoryLocation'">
                        <v-chip label v-if="item.isFreezer" color="success">{{ $t('Yes') }}</v-chip>
                        <v-chip label v-else color="info">{{ $t('No') }}</v-chip>
                    </template>
                    <template v-slot:item.action="{ item }">
                        <v-btn class="float-right" icon="$menu" variant="plain">
                            <v-icon icon="$menu"></v-icon>
                            <v-menu activator="parent" close-on-content-click>
                                <v-list density="compact">
                                    <v-list-item prepend-icon="$edit" :to="{name: 'ModelEditPage', params: {model: model, id: item.id}}"
                                                 v-if="!(genericModel.model.disableCreate && genericModel.model.disableUpdate && genericModel.model.disableDelete)">
                                        {{ $t('Edit') }}
                                    </v-list-item>
                                    <v-list-item prepend-icon="fa-solid fa-arrows-to-dot" v-if="genericModel.model.isMerge" link>
                                        {{ $t('Merge') }}
                                        <model-merge-dialog :model="model" :source="[item]"
                                                            @change="loadItems({page: page, itemsPerPage: pageSize, search: query})"></model-merge-dialog>
                                    </v-list-item>
                                    <v-list-item prepend-icon="fa-solid fa-table-list" :to="{name: 'IngredientEditorPage', query: {food_id: item.id}}"
                                                 v-if="genericModel.model.name == 'Food'">
                                        {{ $t('Ingredient Editor') }}
                                    </v-list-item>
                                    <v-list-item prepend-icon="fa-solid fa-table-list" :to="{name: 'IngredientEditorPage', query: {unit_id: item.id}}"
                                                 v-if="genericModel.model.name == 'Unit'">
                                        {{ $t('Ingredient Editor') }}
                                    </v-list-item>
                                    <v-list-item prepend-icon="fa-solid fa-rotate" v-if="genericModel.model.name == 'Sync'" link>
                                        {{ $t('Import') }}
                                        <sync-dialog :sync="item"></sync-dialog>
                                    </v-list-item>
                                    <v-list-item prepend-icon="fa-solid fa-rotate" v-if="genericModel.model.name == 'RecipeImport'" @click="importRecipe(item)">
                                        {{ $t('Import') }}
                                    </v-list-item>
                                    <v-list-item prepend-icon="fa-solid fa-arrow-right-from-bracket"
                                                 v-if="genericModel.model.name == 'Space'  && item.createdBy.id != useUserPreferenceStore().userSettings.user.id!"
                                                 @click="leaveSpace(item)">
                                        {{ $t('LeaveSpace') }}
                                    </v-list-item>
                                </v-list>
                            </v-menu>
                        </v-btn>
                    </template>
                </model-list-data-table>
            </v-col>
        </v-row>

        <model-list-settings-panel
            v-if="hasEnhancedList"
            v-model="settingsPanelOpen"
            v-model:active-tab="settingsActiveTab"
            :model="genericModel.model"
            :all-columns="allColumns"
            :is-column-visible="isColumnVisible"
            :toggle-column="toggleColumn"
            :get-display-mode="getDisplayMode"
            :set-display-mode="setDisplayMode"
        />

        <batch-delete-dialog :items="selectedItems" :model="props.model" v-model="batchDeleteDialog" activator="model"
                             @change="loadItems({page: page, itemsPerPage: pageSize, search: query})"></batch-delete-dialog>

        <model-merge-dialog :model="model" :source="selectedItems" v-model="batchMergeDialog" activator="model"
                            @change="loadItems({page: page, itemsPerPage: pageSize, search: query})"></model-merge-dialog>

        <batch-edit-food-dialog :items="selectedItems" v-model="batchEditDialog" v-if="model == 'Food'" activator="model"
                                @change="loadItems({page: page, itemsPerPage: pageSize, search: query})"></batch-edit-food-dialog>

    </v-container>
</template>

<script setup lang="ts">


import {computed, h, onBeforeMount, PropType, ref, watch} from "vue";
import {ErrorMessageType, useMessageStore} from "@/stores/MessageStore";
import {useI18n} from "vue-i18n";
import {EditorSupportedModels, GenericModel, getGenericModelFromString, Model, TInviteLink,} from "@/types/Models";

import {useRoute, useRouter} from "vue-router";
import {useUserPreferenceStore} from "@/stores/UserPreferenceStore";
import ModelMergeDialog from "@/components/dialogs/ModelMergeDialog.vue";
import {VDataTableUpdateOptions} from "@/vuetify";
import SyncDialog from "@/components/dialogs/SyncDialog.vue";
import {ApiApi, ApiRecipeListRequest, Group, RecipeImport, Space, UserSpace} from "@/openapi";
import {useTitle} from "@vueuse/core";
import RecipeShareDialog from "@/components/dialogs/RecipeShareDialog.vue";
import AddToShoppingDialog from "@/components/dialogs/AddToShoppingDialog.vue";
import BatchDeleteDialog from "@/components/dialogs/BatchDeleteDialog.vue";
import {useRouteQuery} from "@vueuse/router";
import BatchEditFoodDialog from "@/components/dialogs/BatchEditFoodDialog.vue";
import {useModelListColumns} from "@/composables/modellist/useModelListColumns";
import {useModelListFilters} from "@/composables/modellist/useModelListFilters";
import ModelListCellRenderer from "@/components/model_list/ModelListCellRenderer.vue";
import ModelListDataTable from "@/components/model_list/ModelListDataTable.vue";
import ModelListSettingsPanel from "@/components/model_list/ModelListSettingsPanel.vue"
import ModelListToolbar from "@/components/model_list/ModelListToolbar.vue";
import ModelListCreateButton from "@/components/model_list/ModelListCreateButton.vue";

const {t} = useI18n()
const router = useRouter()
const route = useRoute()
const title = useTitle()

const props = defineProps({
    model: {
        type: String as PropType<EditorSupportedModels>,
        default: 'food'
    },
})

// table config
const itemsPerPageOptions = [
    {value: 10, title: '10'},
    {value: 25, title: '25'},
    {value: 50, title: '50'},
    {value: 100, title: '100'},
]

const query = useRouteQuery('query', "")
const page = useRouteQuery('page', 1, {transform: Number})
const pageSize = useRouteQuery('pageSize', useUserPreferenceStore().deviceSettings.general_tableItemsPerPage, {transform: Number})
const ordering = useRouteQuery('ordering', '')

const selectedItems = ref([] as any[])

const batchDeleteDialog = ref(false)
const batchMergeDialog = ref(false)
const batchEditDialog = ref(false)

// data
const loading = ref(false);
const items = ref([] as Array<any>)
const itemCount = ref(0)

const genericModel = ref({} as GenericModel)

// column system: reads model reactively, handles visibility + display modes for all models
const currentModel = computed(() => genericModel.value?.model)
const {visibleHeaders, enhancedColumns, allColumns, hasEnhancedList, isColumnVisible, toggleColumn, getDisplayMode, setDisplayMode} = useModelListColumns(currentModel, t)
const {filterDefs, groupedFilterDefs, activeFilterCount, filterParams, getFilter, setFilter, clearFilter, clearAllFilters} = useModelListFilters(currentModel)

const showDescription = ref(true)
const settingsPanelOpen = ref(false)
const settingsActiveTab = ref('settings')
const selectMode = ref(false)

function openSettingsPanel(tab: string) {
    settingsActiveTab.value = tab
    settingsPanelOpen.value = true
}

// Show column headers setting (read from deviceSettings, controlled by settings panel)
const showColumnHeaders = computed(() => {
    const key = currentModel.value?.listSettings?.settingsKey
    if (!key) return true
    return (useUserPreferenceStore().deviceSettings as any)[`${key}_showColumnHeaders`] ?? true
})

// Build dynamic cell slots for enhanced columns (programmatic — Vue 3 can't v-for on template slots)
const columnSlots = computed(() => {
    if (!hasEnhancedList.value) return {}
    const slots: Record<string, Function> = {}
    for (const col of enhancedColumns.value) {
        slots[`item.${col.key}`] = ({item}: {item: any}) =>
            h(ModelListCellRenderer, {
                item,
                header: col,
                displayMode: getDisplayMode(col.key),
                showHeaders: true,
            })
    }
    return slots
})

// when navigating to ModelListPage from ModelListPage with a different model lifecycle hooks are not called so watch for change here
watch(() => props.model, (newValue, oldValue) => {
    if (newValue != oldValue) {
        genericModel.value = getGenericModelFromString(props.model, t) || genericModel.value
        loadItems({page: 1})
    }
})

watch(ordering, () => loadItems({page: 1}))
watch(filterParams, () => loadItems({page: 1}))

/**
 * select model class before mount because template renders (and requests item load) before onMounted is called
 */
onBeforeMount(() => {
    genericModel.value = getGenericModelFromString(props.model, t) || getGenericModelFromString('Food', t) as GenericModel

    title.value = t(genericModel.value.model.localizationKey)
})

/**
 * load items from API whenever the table calls for it
 * parameters defined by vuetify
 * @param options
 */
function loadItems(options: VDataTableUpdateOptions) {
    loading.value = true
    selectedItems.value = []
    window.scrollTo({top: 0, behavior: 'smooth'})

    page.value = options.page
    if (options.itemsPerPage != null) {
        pageSize.value = options.itemsPerPage
        useUserPreferenceStore().deviceSettings.general_tableItemsPerPage = options.itemsPerPage
    }

    genericModel.value.list({query: query.value, page: options.page, pageSize: pageSize.value, ordering: ordering.value || undefined, ...filterParams.value}).then((r: any) => {
        items.value = r.results
        itemCount.value = r.count
    }).catch((err: any) => {
        useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
    }).finally(() => {
        loading.value = false
    })
}

// model specific functions

/**
 * convert a RecipeImport to a "real" external recipes and reload the table
 * @param item
 */
function importRecipe(item: RecipeImport) {
    let api = new ApiApi()
    api.apiRecipeImportImportRecipeCreate({id: item.id!, recipeImport: item}).then(r => {
        loadItems({page: 1})
    }).catch(err => {
        useMessageStore().addError(ErrorMessageType.CREATE_ERROR, err)
    })
}

/**
 * convert all RecipeImports to "real" external recipes and reload the table (should be empty afterwards)
 */
function importAllRecipes() {
    let api = new ApiApi()

    api.apiRecipeImportImportAllCreate({recipeImport: {} as RecipeImport}).then(r => {
        loadItems({page: 1})
    }).catch(err => {
        useMessageStore().addError(ErrorMessageType.CREATE_ERROR, err)
    })
}

/**
 * leave the selected space as a user
 * @param space to leave
 */
function leaveSpace(space: Space) {
    let api = new ApiApi()
    useUserPreferenceStore().userSpaces.forEach((us: UserSpace) => {
        if (us.space == space.id!) {
            loading.value = true
            api.apiUserSpaceDestroy({id: us.id!}).then(r => {

            }).catch(err => {
                useMessageStore().addError(ErrorMessageType.DELETE_ERROR, err)
            }).finally(() => {
                loading.value = false
            })
        }
    })
}

</script>

<style scoped>
:deep(.hide-table-headers thead) {
    display: none;
}
</style>