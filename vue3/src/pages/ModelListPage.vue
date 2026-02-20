<template>
    <v-container v-if="genericModel.model">
        <v-row v-if="selectMode">
            <v-col>
                <ModelListSelectionBar
                    :selected-count="selectedItems.length"
                    @close="exitSelectMode"
                    @select-all="selectedItems = items.filter(i => !i._isLoadMore)"
                    @select-none="selectedItems = []"
                >
                    <template #actions>
                        <v-btn variant="text" prepend-icon="fa-solid fa-list-check" class="text-none" @click="batchEditDialog = true" v-if="genericModel.model.name === 'Food'">
                            {{ $t('BatchEdit') }}
                        </v-btn>
                        <v-btn variant="text" prepend-icon="fa-solid fa-arrows-to-dot" class="text-none" @click="batchMergeDialog = true" v-if="genericModel.model.isMerge">
                            {{ $t('Merge') }}
                        </v-btn>
                        <v-btn variant="text" prepend-icon="$delete" class="text-none" @click="batchDeleteDialog = true" v-if="!genericModel.model.disableDelete">
                            {{ $t('Delete_All') }}
                        </v-btn>
                    </template>
                    <template #actions-menu>
                        <v-list-item prepend-icon="fa-solid fa-list-check" @click="batchEditDialog = true" v-if="genericModel.model.name === 'Food'">
                            {{ $t('BatchEdit') }}
                        </v-list-item>
                        <v-list-item prepend-icon="fa-solid fa-arrows-to-dot" @click="batchMergeDialog = true" v-if="genericModel.model.isMerge">
                            {{ $t('Merge') }}
                        </v-list-item>
                        <v-list-item prepend-icon="$delete" @click="batchDeleteDialog = true" v-if="!genericModel.model.disableDelete">
                            {{ $t('Delete_All') }}
                        </v-list-item>
                    </template>
                </ModelListSelectionBar>
            </v-col>
        </v-row>

        <v-row v-else-if="!showDescription">
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
                        <v-btn prepend-icon="fa-solid fa-rotate" color="success" size="small" @click="importAllRecipes()" v-if="genericModel.model.name === 'RecipeImport'">{{ $t('ImportAll') }}</v-btn>
                        <v-btn :prepend-icon="TInviteLink.icon" size="small" :to="{name: 'ModelListPage', params: {model: 'InviteLink'}}" v-if="genericModel.model.name === 'UserSpace'">{{ $t('Invites') }}</v-btn>
                        <model-list-create-button :model="model" :disable-create="genericModel.model.disableCreate" compact @change="loadItems({page: page})" />
                    </v-card-text>
                    <v-progress-linear
                        v-if="genericModel.model.name === 'AiLog'"
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

                        <v-card-actions v-if="genericModel.model.name === 'RecipeImport'">
                            <v-btn prepend-icon="fa-solid fa-rotate" color="success" @click="importAllRecipes()">{{ $t('ImportAll') }}</v-btn>
                        </v-card-actions>

                        <v-card-text v-if="genericModel.model.name === 'AiLog'">
                            {{ $t('MonthlyCreditsUsed') }} ({{ useUserPreferenceStore().activeSpace.aiMonthlyCreditsUsed }} / {{
                                useUserPreferenceStore().activeSpace.aiCreditsMonthly
                            }})
                            {{ $t('AiCreditsBalance') }} : {{ useUserPreferenceStore().activeSpace.aiCreditsBalance }}
                            <v-progress-linear :model-value="useUserPreferenceStore().activeSpace.aiMonthlyCreditsUsed"
                                               :max="useUserPreferenceStore().activeSpace.aiCreditsMonthly"></v-progress-linear>
                        </v-card-text>
                        <v-card-actions v-if="genericModel.model.name === 'UserSpace'">
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
                    :show-reset="hasActiveSearchState"
                    @open-filters="openSettingsPanel('filters')"
                    @open-settings="openSettingsPanel('settings')"
                    @toggle-select="selectMode = !selectMode"
                    @reset="resetAll"
                />

                <ModelListFilterChips
                    v-if="hasEnhancedList && activeFilterCount > 0"
                    :filter-defs="filterDefs"
                    :get-filter="getFilter"
                    :set-filter="setFilter"
                    :clear-filter="clearFilter"
                    :clear-all-filters="clearAllFilters"
                    :active-filter-count="activeFilterCount"
                    @open-filters="openSettingsPanel('filters')"
                />

                <model-list-mobile-view
                    v-if="useMobileList"
                    class="mt-2"
                    :key="props.model + '-mobile'"
                    :items="items"
                    :items-length="itemCount"
                    :loading="loading"
                    :page="page"
                    :items-per-page="pageSize"
                    :select-mode="selectMode"
                    :selected-items="selectedItems"
                    :enhanced-columns="enhancedColumns"
                    :action-defs="actionDefs"
                    :grouped-action-defs="groupedActionDefs"
                    :get-toggle-state="getToggleState"
                    :quick-action-keys="quickActionKeys.slice(0, 3)"
                    :tree-active="effectiveTreeActive"
                    :tree-suspended="treeActive && !effectiveTreeActive"
                    :expanded-ids="expandedIds"
                    :loading-ids="loadingIds"
                    :toggle-expand="toggleExpand"
                    :mobile-subtitle-keys="mobileSubtitleKeys"
                    :swipe-enabled="swipeEnabled"
                    :swipe-left-keys="swipeLeftKeys"
                    :swipe-right-keys="swipeRightKeys"
                    :settings-key="modelSettingsKey"
                    :show-mobile-headers="showMobileHeaders"
                    :label-field="currentModel?.itemLabel"
                    @update:selected-items="selectedItems = $event"
                    @update:options="loadItems"
                    @action="handleActionWithConfirmation"
                    @load-more="loadMoreChildren"
                />
                <model-list-data-table
                    v-else
                    :key="props.model"
                    :class="['mt-2 bg-transparent', {'hide-table-headers': !showColumnHeaders}]"
                    :dynamic-slots="columnSlots"
                    v-model="selectedItems"
                    return-object
                    @update:options="loadItems"
                    :items="items"
                    :items-length="itemCount"
                    :loading="loading || anyItemLoading"
                    :search="query"
                    :headers="visibleHeaders"
                    :items-per-page-options="itemsPerPageOptions"
                    :show-select="selectMode"
                    :page="page"
                    :items-per-page="pageSize"
                    disable-sort
                >
                    <template v-slot:item.space="{ item }" v-if="genericModel.model.name === 'AiProvider'">
                        <v-chip label v-if="item.space == null" color="success">{{ $t('Global') }}</v-chip>
                        <v-chip label v-else color="info">{{ $t('Space') }}</v-chip>
                    </template>
                    <template v-slot:item.groups="{ item }" v-if="genericModel.model.name === 'UserSpace'">
                        {{ item.groups.flatMap((x: Group) => x.name).join(', ') }}
                    </template>
                    <template v-slot:item.active="{ item }" v-if="genericModel.model.name === 'Space'">
                        <v-chip label v-if="item.id === useUserPreferenceStore().activeSpace.id!" color="success">{{ $t('Active') }}</v-chip>
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
                        <template v-if="item._isLoadMore" />
                        <ModelListActionMenu
                            v-else-if="currentModel?.actionDefs"
                            :item="item"
                            :action-defs="actionDefs"
                            :grouped-action-defs="groupedActionDefs"
                            :get-toggle-state="getToggleState"
                            :quick-action-keys="quickActionKeys"
                            @action="handleActionWithConfirmation"
                        />
                        <template v-else>
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
                                        <v-list-item prepend-icon="fa-solid fa-table-list" :to="{name: 'IngredientEditorPage', query: {unit_id: item.id}}"
                                                     v-if="genericModel.model.name === 'Unit'">
                                            {{ $t('Ingredient Editor') }}
                                        </v-list-item>
                                        <v-list-item prepend-icon="fa-solid fa-rotate" v-if="genericModel.model.name === 'Sync'" link>
                                            {{ $t('Import') }}
                                            <sync-dialog :sync="item"></sync-dialog>
                                        </v-list-item>
                                        <v-list-item prepend-icon="fa-solid fa-rotate" v-if="genericModel.model.name === 'RecipeImport'" @click="importRecipe(item)">
                                            {{ $t('Import') }}
                                        </v-list-item>
                                        <v-list-item prepend-icon="fa-solid fa-arrow-right-from-bracket"
                                                     v-if="genericModel.model.name === 'Space'  && item.createdBy.id !== useUserPreferenceStore().userSettings.user.id!"
                                                     @click="leaveSpace(item)">
                                            {{ $t('LeaveSpace') }}
                                        </v-list-item>
                                    </v-list>
                                </v-menu>
                            </v-btn>
                        </template>
                    </template>
                </model-list-data-table>

                <model-list-stats-footer
                    v-if="statsAvailable && showStats"
                    :page-count="rawItems.length"
                    :item-count="itemCount"
                    :stats="stats"
                    :stat-defs="currentModel?.statDefs ?? []"
                    :loading="loading"
                />
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
            :grouped-filter-defs="groupedFilterDefs"
            :get-filter="getFilter"
            :set-filter="setFilter"
            :clear-all-filters="clearAllFilters"
            :active-filter-count="activeFilterCount"
            :action-defs="actionDefs"
        />

        <batch-delete-dialog :items="selectedItems" :model="props.model" v-model="batchDeleteDialog" activator="model"
                             @change="reloadAfterMutation(); exitSelectMode()"></batch-delete-dialog>

        <model-merge-dialog :model="model" :source="selectedItems" v-model="batchMergeDialog" activator="model"
                            @change="reloadAfterMutation(); exitSelectMode()"></model-merge-dialog>

        <model-merge-dialog :model="model" :source="singleMergeSource" v-model="singleMergeDialog" activator="model"
                            @change="reloadAfterMutation()"></model-merge-dialog>

        <batch-edit-food-dialog :items="selectedItems" v-model="batchEditDialog" v-if="model === 'Food'" activator="model"
                                @change="reloadAfterMutation(); exitSelectMode()"></batch-edit-food-dialog>

        <action-confirm-dialog ref="confirmDialogRef" />

    </v-container>
</template>

<script setup lang="ts">


import {computed, h, onBeforeMount, ref, shallowRef, toRef, triggerRef, watch} from "vue";
import {ErrorMessageType, useMessageStore} from "@/stores/MessageStore";
import {useI18n} from "vue-i18n";
import {EditorSupportedModels, GenericModel, getGenericModelFromString, Model, ModelTableHeaders, TInviteLink,} from "@/types/Models";
import {buildSubtitleText} from "@/utils/utils";

import {useRoute, useRouter} from "vue-router";
import {useUserPreferenceStore} from "@/stores/UserPreferenceStore";
import ModelMergeDialog from "@/components/dialogs/ModelMergeDialog.vue";
import {VDataTableUpdateOptions} from "@/vuetify";
import SyncDialog from "@/components/dialogs/SyncDialog.vue";
import {ApiApi, ApiRecipeListRequest, Group, RecipeImport, Space, UserSpace} from "@/openapi";
import {useTitle} from "@vueuse/core";
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
import ModelListFilterChips from "@/components/model_list/ModelListFilterChips.vue";
import ModelListSelectionBar from "@/components/model_list/ModelListSelectionBar.vue";
import ModelListActionMenu from "@/components/model_list/ModelListActionMenu.vue";
import ModelListMobileView from "@/components/model_list/ModelListMobileView.vue";
import ModelListStatsFooter from "@/components/model_list/ModelListStatsFooter.vue";
import {useModelListActions} from "@/composables/modellist/useModelListActions";
import {useModelListSettings} from "@/composables/modellist/useModelListSettings";
import {useModelListTree, CHILD_PAGE_SIZE} from "@/composables/modellist/useModelListTree";
import type {ModelActionDef, ModelItem} from "@/composables/modellist/types";
import {getAncestorPath} from "@/composables/modellist/types";
import ActionConfirmDialog from "@/components/dialogs/ActionConfirmDialog.vue";
import type {ActionConfirmEntry} from "@/components/dialogs/ActionConfirmDialog.vue";
import {useDisplay} from "vuetify";

const {t} = useI18n()
const router = useRouter()
const route = useRoute()
const title = useTitle()

const props = withDefaults(defineProps<{
    model?: EditorSupportedModels
}>(), {
    model: 'food',
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

const selectedItems = ref<ModelItem[]>([])

const batchDeleteDialog = ref(false)
const batchMergeDialog = ref(false)
const batchEditDialog = ref(false)

// data
const loading = ref(false);
const rawItems = shallowRef([] as Array<any>)
const itemCount = ref(0)
const stats = ref<Record<string, number>>({})

const genericModel = ref({} as GenericModel)

// column system: reads model reactively, handles visibility + display modes for all models
const currentModel = computed(() => genericModel.value?.model)
const {visibleHeaders, enhancedColumns, allColumns, hasEnhancedList, isColumnVisible, toggleColumn, getDisplayMode, setDisplayMode} = useModelListColumns(currentModel, t)
const {filterDefs, groupedFilterDefs, activeFilterCount, filterParams, getFilter, setFilter, clearFilter, clearAllFilters} = useModelListFilters(currentModel)

// device settings + tree view
const {mobile} = useDisplay()
const modelSettingsKey = computed(() => currentModel.value?.listSettings?.settingsKey ?? '')
const {showStats, showColumnHeaders, quickActionKeys, desktopSubtitleKeys,
    mobileSubtitleKeys, swipeEnabled, swipeLeftKeys, swipeRightKeys,
    showMobileHeaders, treeEnabled} = useModelListSettings(modelSettingsKey)
const useMobileList = computed(() => mobile.value && hasEnhancedList.value && !!currentModel.value?.listSettings?.mobileList)
const statsAvailable = computed(() => !!currentModel.value?.listSettings?.statsFooter)
const fetchChildren = (parentId: number, page: number) =>
    genericModel.value.list({...filterParams.value, root: parentId, pageSize: CHILD_PAGE_SIZE, page})
        .then((r: any) => ({results: r.results ?? [], hasMore: !!r.next}))
const {treeActive, expandedIds, loadingIds, toggleExpand, loadMoreChildren,
    buildFlatList, clearTreeState, setOnCollapse} =
    useModelListTree(currentModel, fetchChildren, treeEnabled)

/** Tree is suspended when search, filters, or non-default sorting are active.
 *  Name ascending is the default backend ordering, so it's compatible with tree mode. */
const effectiveTreeActive = computed(() =>
    treeActive.value
    && (!ordering.value || ordering.value === 'name')
    && !query.value
    && activeFilterCount.value === 0
)

const hasActiveSearchState = computed(() =>
    !!query.value || activeFilterCount.value > 0 || (!!ordering.value && ordering.value !== 'name')
)

function resetAll() {
    query.value = ''
    ordering.value = ''
    clearAllFilters()
}

// Always return a fresh array reference so that triggerRef(rawItems) propagates
// through Vue's computed Object.is() caching to downstream v-for consumers.
const items = computed(() => {
    const list = effectiveTreeActive.value ? buildFlatList(rawItems.value) : rawItems.value
    return list.slice()
})

const anyItemLoading = computed(() => items.value.some(i => i._isLoading))

// When children are collapsed, remove them from selection
setOnCollapse((removedIds) => {
    const removedSet = new Set(removedIds)
    selectedItems.value = selectedItems.value.filter(item => !removedSet.has(item.id))
})

const modelNameRef = toRef(props, 'model')
const singleMergeDialog = ref(false)
const singleMergeSource = ref<ModelItem[]>([])
const confirmDialogRef = ref<InstanceType<typeof ActionConfirmDialog> | null>(null)

function handleAction(key: string, item: ModelItem) {
    switch (key) {
        case 'merge':
            singleMergeSource.value = [item]
            singleMergeDialog.value = true
            break
    }
}

const {actionDefs, groupedActionDefs, executeAction, getToggleState} = useModelListActions(
    currentModel, genericModel, modelNameRef, handleAction,
    (item: ModelItem, field: string) => {
        const idx = rawItems.value.findIndex(i => i.id === item.id)
        if (idx >= 0) {
            rawItems.value[idx] = {...rawItems.value[idx], [field]: item[field]}
            triggerRef(rawItems)
        }
    },
)

/**
 * Intercepts actions that need confirmation before executing.
 * For toggle actions: confirms when toggling OFF (active → inactive).
 * For non-toggle actions: confirms unconditionally.
 */
async function handleActionWithConfirmation(key: string, item: ModelItem) {
    const action = actionDefs.value.find(a => a.key === key)
    if (!action) return

    if (action.requiresConfirmation) {
        if (action.isToggle && getToggleState(action, item)) {
            // Toggle is active → user wants to deactivate → confirm
            if (key === 'shopping') {
                const confirmed = await showShoppingRemoveConfirm(action, item)
                if (!confirmed) return
            }
        } else if (!action.isToggle) {
            // Non-toggle destructive action → generic confirm
            const confirmed = await confirmDialogRef.value?.open({
                title: t('Confirm'),
                message: t('ConfirmAction', {action: t(action.labelKey), name: item.name}),
                confirmLabel: t(action.labelKey),
                confirmColor: action.isDanger ? 'error' : 'primary',
                confirmIcon: action.icon,
            })
            if (!confirmed) return
        }
    }
    executeAction(key, item)
}

async function showShoppingRemoveConfirm(action: ModelActionDef, item: ModelItem): Promise<boolean> {
    // Open dialog immediately with loading state, fetch entries in background
    const confirmPromise = confirmDialogRef.value?.open({
        title: t('Confirm'),
        message: t('RemoveFromShoppingConfirm', {name: item.name}),
        loading: true,
        confirmLabel: t('Remove'),
        confirmColor: 'warning',
        confirmIcon: action.icon,
    })

    // Fetch shopping list entries for this specific food
    try {
        const api = new ApiApi()
        const result = await api.apiShoppingListEntryList({food: item.id, pageSize: 100})
        const foodEntries = (result.results ?? []).filter((e: any) => !e.checked)
        const entries: ActionConfirmEntry[] = foodEntries.map((e: any) => {
            const parts: string[] = []
            if (e.amount) parts.push(String(e.amount))
            if (e.unit?.name) parts.push(e.unit.name)
            const text = parts.length > 0 ? parts.join(' ') : t('Shopping')
            const subtextParts: string[] = []
            const recipeName = e.listRecipeData?.recipeData?.name
            if (recipeName) subtextParts.push(recipeName)
            if (e.createdBy?.displayName || e.createdBy?.username) {
                subtextParts.push(e.createdBy.displayName || e.createdBy.username)
            }
            if (e.createdAt) {
                subtextParts.push(new Date(e.createdAt).toLocaleString())
            }
            return {text, subtext: subtextParts.join(' · ') || undefined, icon: 'fa-solid fa-cart-shopping'} as ActionConfirmEntry
        })
        confirmDialogRef.value?.setEntries(entries)
    } catch {
        confirmDialogRef.value?.setEntries([])
    }

    return (await confirmPromise) ?? false
}

const showDescription = computed({
    get: () => useUserPreferenceStore().deviceSettings.general_showModelListDescription,
    set: (val: boolean) => { useUserPreferenceStore().deviceSettings.general_showModelListDescription = val },
})
const settingsPanelOpen = ref(false)
const settingsActiveTab = ref('settings')
const selectMode = ref(false)

function exitSelectMode() {
    selectMode.value = false
}

watch(selectMode, (val) => {
    if (!val) selectedItems.value = []
})

function openSettingsPanel(tab: string) {
    settingsActiveTab.value = tab
    settingsPanelOpen.value = true
}

const desktopSubtitleColumns = computed(() =>
    desktopSubtitleKeys.value
        .map((key: string) => enhancedColumns.value.find(c => c.key === key))
        .filter((c: ModelTableHeaders | undefined): c is ModelTableHeaders => !!c)
)

/** Render name cell content with optional subtitle */
function renderNameContent(item: ModelItem, col: ModelTableHeaders) {
    const renderer = h(ModelListCellRenderer, {
        item,
        header: col,
        displayMode: getDisplayMode(col.key),
        showHeaders: true,
    })
    const lines: ReturnType<typeof h>[] = [renderer]

    // Show ancestor path when tree mode is suspended by filters/search/sort
    if (treeActive.value && !effectiveTreeActive.value) {
        const path = getAncestorPath(item)
        if (path) {
            lines.push(h('span', {class: 'text-caption text-disabled text-truncate'}, path))
        }
    }

    const subtitle = buildSubtitleText(item, desktopSubtitleColumns.value, t)
    if (subtitle) {
        lines.push(h('span', {class: 'text-caption text-medium-emphasis text-truncate'}, subtitle))
    }

    if (lines.length === 1) return renderer
    return h('div', {class: 'd-flex flex-column'}, lines)
}

// Build dynamic cell slots for enhanced columns (programmatic — Vue 3 can't v-for on template slots)
const columnSlots = computed(() => {
    if (!hasEnhancedList.value) return {}
    // Access to register as reactive dependency — recompute slots when subtitle settings change
    const _subtitleCols = desktopSubtitleColumns.value
    const slots: Record<string, (...args: any[]) => any> = {}
    for (const col of enhancedColumns.value) {
        if (effectiveTreeActive.value && col.key === 'name') {
            slots[`item.${col.key}`] = ({item}: {item: ModelItem}) => {
                if (item._isLoadMore) {
                    const depth = item._depth ?? 0
                    const indent = depth * (mobile.value ? 20 : 28)
                    const isLoading = loadingIds.value.has(item._parentId)
                    return h('div', {
                        class: 'd-flex align-center',
                        style: {paddingLeft: `${indent}px`},
                    }, [
                        h('button', {
                            type: 'button',
                            class: 'text-primary text-caption font-weight-medium',
                            style: {cursor: 'pointer', appearance: 'none', border: 'none', background: 'none', padding: '4px 8px'},
                            disabled: isLoading,
                            'aria-label': t('Load_More'),
                            onClick: (e: Event) => { e.stopPropagation(); loadMoreChildren(item._parentId) },
                        }, isLoading
                            ? [h('i', {class: 'fa-solid fa-spinner fa-spin', style: {fontSize: '12px', marginRight: '6px'}}), t('Load_More')]
                            : [h('i', {class: 'fa-solid fa-ellipsis', style: {fontSize: '12px', marginRight: '6px'}}), t('Load_More')]
                        ),
                    ])
                }

                const depth = item._depth ?? 0
                const indent = depth * (mobile.value ? 20 : 28)
                const hasChildren = (item.numchild ?? 0) > 0
                const isExpanded = expandedIds.value.has(item.id)
                const isLoading = item._isLoading

                const children: ReturnType<typeof h>[] = []

                if (hasChildren) {
                    if (isLoading) {
                        children.push(h('span', {class: 'tree-expand-btn', style: {width: '28px', display: 'inline-flex', justifyContent: 'center', alignItems: 'center', opacity: '0.4'}},
                            [h('i', {class: 'fa-solid fa-chevron-down', style: {fontSize: '12px'}})]
                        ))
                    } else {
                        children.push(h('button', {
                            class: ['tree-expand-btn', isExpanded ? 'tree-chevron-expanded' : ''],
                            style: {cursor: 'pointer', width: '28px', display: 'inline-flex', justifyContent: 'center', alignItems: 'center', appearance: 'none', border: 'none', background: 'none', padding: 0},
                            'aria-expanded': isExpanded,
                            'aria-label': t('Toggle'),
                            onClick: (e: Event) => { e.stopPropagation(); toggleExpand(item.id) },
                            onKeydown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleExpand(item.id) } },
                        }, [h('i', {class: 'fa-solid fa-chevron-right', style: {fontSize: '12px'}})]))
                    }
                } else if (depth > 0) {
                    children.push(h('span', {style: {width: '28px', display: 'inline-block'}}))
                }

                children.push(renderNameContent(item, col))

                return h('div', {
                    class: 'd-flex align-center',
                    style: {paddingLeft: `${indent}px`},
                }, children)
            }
        } else if (col.key === 'name') {
            slots[`item.${col.key}`] = ({item}: {item: ModelItem}) => renderNameContent(item, col)
        } else {
            slots[`item.${col.key}`] = ({item}: {item: ModelItem}) => {
                if (item._isLoadMore) return null
                return h(ModelListCellRenderer, {
                    item,
                    header: col,
                    displayMode: getDisplayMode(col.key),
                    showHeaders: true,
                })
            }
        }
    }
    return slots
})

// when navigating to ModelListPage from ModelListPage with a different model lifecycle hooks are not called so watch for change here
watch(() => props.model, (newValue, oldValue) => {
    if (newValue !== oldValue) {
        genericModel.value = getGenericModelFromString(props.model, t) || genericModel.value
        loadItems({page: 1})
    }
})

watch([ordering, filterParams, treeActive], () => {
    clearTreeState()
    loadItems({page: 1})
})
// Mobile v-list doesn't emit update:options on search change like v-data-table does,
// so watch query explicitly to trigger reload on mobile
watch(query, () => {
    if (useMobileList.value) loadItems({page: 1})
})

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
/** Reload after a mutation (delete, merge, edit) — clears tree cache so re-expand shows fresh data */
function reloadAfterMutation() {
    clearTreeState()
    loadItems({page: page.value, itemsPerPage: pageSize.value, search: query.value})
}

function loadItems(options: VDataTableUpdateOptions) {
    loading.value = true
    selectedItems.value = []

    const pageChanged = options.page !== page.value
    page.value = options.page
    if (pageChanged) {
        window.scrollTo({top: 0, behavior: 'smooth'})
    }
    if (options.itemsPerPage != null) {
        pageSize.value = options.itemsPerPage
        useUserPreferenceStore().deviceSettings.general_tableItemsPerPage = options.itemsPerPage
    }

    const listParams = {
        ...filterParams.value,
        ...(effectiveTreeActive.value ? {root: 0} : {}),
        query: query.value,
        page: options.page,
        pageSize: pageSize.value,
        ordering: ordering.value || undefined,
        stats: showStats.value && statsAvailable.value ? true : undefined,
    }
    genericModel.value.list(listParams).then((r: any) => {
        rawItems.value = r.results
        itemCount.value = r.count
        stats.value = r.stats ?? {}
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
        if (us.space === space.id!) {
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
:deep(.bg-transparent .v-table__wrapper > table) {
    background: transparent;
}
:deep(.bg-transparent .v-table__wrapper td) {
    border-bottom: none !important;
}
:deep(.bg-transparent .v-table__wrapper tbody tr) {
    background-image: linear-gradient(rgba(var(--v-theme-on-surface), 0.12), rgba(var(--v-theme-on-surface), 0.12));
    background-size: 100% 1px;
    background-repeat: no-repeat;
    background-position: bottom;
}
:deep(.bg-transparent .v-data-table-footer) {
    background: transparent;
}
:deep(.bg-transparent > .v-divider) {
    border-color: rgba(var(--v-theme-on-surface), 0.08);
}
:deep(.tree-chevron-expanded) {
    transform: rotate(90deg);
}
.tree-expand-btn i {
    transition: transform 0.2s;
    font-size: 12px;
}
</style>
