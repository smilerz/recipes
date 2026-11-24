<template>
    <!-- the top row (tabs, or the select bar in select mode) sits in a container like the rest of the page, so it has the same side margins -->
    <v-container v-if="selectEnabled || props.mealPlanId == undefined" class="py-2">
    <!-- show-arrows: on a phone the bar can be wider than the screen; the arrow appears when it overflows, as a hint that there is more -->
    <v-tabs v-model="currentTab" v-if="!selectEnabled && props.mealPlanId == undefined" class="shopping-top-bar" show-arrows
            next-icon="fa-solid fa-chevron-right" prev-icon="fa-solid fa-chevron-left">
        <v-tab value="shopping"><i class="fas fa-fw"
                                   :class="{'fa-circle-notch fa-spin':useShoppingStore().currentlyUpdating, 'fa-shopping-cart ': !useShoppingStore().currentlyUpdating}"></i> <span
            class="d-none d-md-block ms-1">{{ $t('Shopping_list') }} ({{ useShoppingStore().totalFoods }})</span></v-tab>
        <v-tab value="recipes"><i class="fas fa-book fa-fw"></i> <span class="d-none d-md-block ms-1">{{
                $t('Recipes')
            }} ({{ useShoppingStore().getAssociatedRecipes().length }})</span></v-tab>
        <v-tab value="selected_supermarket" v-if="useUserPreferenceStore().deviceSettings.shopping_selected_supermarket != null">
            <i class="fa-solid fa-store fa-fw"></i> <span class="d-none d-md-block ms-1">{{ useUserPreferenceStore().deviceSettings.shopping_selected_supermarket?.name }}</span>
            <!-- the arrow switches supermarkets; clicking the tab itself still opens the supermarket editor -->
            <span class="ms-1" data-test="switch-supermarket" @click.stop>
                <v-icon icon="fa-solid fa-caret-down" size="small"></v-icon>
                <supermarket-switch-menu :supermarkets="useShoppingStore().supermarkets" :selected-id="useUserPreferenceStore().deviceSettings.shopping_selected_supermarket?.id"
                                         @select="switchSupermarket"></supermarket-switch-menu>
            </span>
        </v-tab>
        <v-btn v-else variant="text" rounded="0" height="100%" class="text-none" prepend-icon="fa-solid fa-store" append-icon="fa-solid fa-caret-down" data-test="pick-supermarket">
            <span class="d-none d-md-block">{{ $t('Supermarket') }}</span>
            <supermarket-switch-menu :supermarkets="useShoppingStore().supermarkets" :selected-id="null" @select="switchSupermarket"></supermarket-switch-menu>
        </v-btn>

        <v-btn class="float-right" height="100%" rounded="0" variant="text"
               prepend-icon="$pantry" @click="stockUpDialog?.open()">
            <span>{{ $t('StockUp') }}</span>
        </v-btn>

        <shopping-undo-button tall class="float-right"></shopping-undo-button>

        <!--        <v-btn height="100%" rounded="0" variant="plain">-->
        <!--            <i class="fa-solid fa-download"></i>-->
        <!--            <shopping-export-dialog></shopping-export-dialog>-->
        <!--        </v-btn>-->

        <!--        <v-btn height="100%" rounded="0" variant="plain" @click="useShoppingStore().undoChange()">-->
        <!--            <i class="fa-solid fa-arrow-rotate-left"></i>-->
        <!--        </v-btn>-->

    </v-tabs>
    <selection-bar v-if="selectEnabled" class="mb-2" :selected-count="selectedLines.length"
                   @close="selectEnabled = false; selectedLines = []" @select-all="selectAll()" @select-none="selectedLines = []">
        <template #actions>
            <v-btn v-for="a in batchActions" :key="a.key" variant="text" class="text-none" :prepend-icon="a.icon" :data-test="`batch-${a.key}`"
                   :disabled="!selectedLines.length" @click="a.run()">{{ $t(a.labelKey) }}</v-btn>

            <shopping-list-select-chip
                v-model="selectedShoppingLists"
                :shopping-lists="useShoppingStore().shoppingLists"
                show-update
                hide-edit
                @refresh="useShoppingStore().loadShoppingLists()"
                @update="batchUpdateShoppingLists"
            ></shopping-list-select-chip>

            <category-select-chip
                :categories="useShoppingStore().supermarketCategories"
                @update="batchUpdateCategories"
            ></category-select-chip>

            <shopping-undo-button></shopping-undo-button>
        </template>
        <template #actions-menu>
            <v-list-item v-for="a in batchActions" :key="a.key" :prepend-icon="a.icon" :title="$t(a.labelKey)" :data-test="`batch-${a.key}`"
                         :disabled="!selectedLines.length" @click="a.run()"></v-list-item>
            <div class="px-3 py-1">
                <shopping-list-select-chip
                    v-model="selectedShoppingLists"
                    :shopping-lists="useShoppingStore().shoppingLists"
                    show-update
                    hide-edit
                    @refresh="useShoppingStore().loadShoppingLists()"
                    @update="batchUpdateShoppingLists"
                ></shopping-list-select-chip>
            </div>
            <div class="px-3 py-1">
                <category-select-chip
                    :categories="useShoppingStore().supermarketCategories"
                    @update="batchUpdateCategories"
                ></category-select-chip>
            </div>
            <div class="px-3 py-1">
                <shopping-undo-button></shopping-undo-button>
            </div>
        </template>
    </selection-bar>
    </v-container>

    <shopping-export-dialog v-model="exportDialog" activator="model"></shopping-export-dialog>
    <stock-up-dialog ref="stockUpDialog"></stock-up-dialog>
    <action-confirm-dialog ref="confirmDialog"></action-confirm-dialog>

    <v-window v-model="currentTab">
        <v-window-item value="shopping">
            <v-container :class="{'pa-1': props.mealPlanId != undefined}">
                <!--                <v-row class="pa-0" dense>-->
                <!--                    <v-col class="pa-0">-->
                <!--                        <v-chip-group v-model="useUserPreferenceStore().deviceSettings.shopping_selected_supermarket" v-if="supermarkets.length > 0">-->
                <!--                            <v-chip v-for="s in supermarkets" :value="s" :key="s.id" label dense variant="outlined" color="primary">{{ s.name }}</v-chip>-->
                <!--                        </v-chip-group>-->
                <!--                    </v-col>-->
                <!--                </v-row>-->

                <!-- no tab bar in the meal plan list, so Undo gets a row of its own there -->
                <div v-if="props.mealPlanId != undefined" class="d-flex justify-end">
                    <shopping-undo-button></shopping-undo-button>
                </div>

                <list-toolbar v-model:query="query" :disable-search="!searchVisible" :has-filters="props.mealPlanId == undefined" has-multi-select :select-mode="selectEnabled"
                              :active-filter-count="shoppingFilters.activeFilterCount.value" :show-reset="hasActiveSearchState"
                              @toggle-select="toggleSelectMode" @open-filters="openDrawer('filters')" @open-settings="openDrawer('settings')" @reset="resetSearchAndFilters"></list-toolbar>

                <model-list-filter-chips
                    v-if="props.mealPlanId == undefined && shoppingFilters.activeFilterCount.value > 0"
                    :filter-defs="shoppingFilters.filterDefs.value"
                    :get-filter="shoppingFilters.getFilter"
                    :set-filter="shoppingFilters.setFilter"
                    :clear-filter="shoppingFilters.clearFilter"
                    :clear-all-filters="shoppingFilters.clearAllFilters"
                    :active-filter-count="shoppingFilters.activeFilterCount.value"
                    @open-filters="openDrawer('filters')"
                />

                <tabbed-drawer v-if="props.mealPlanId == undefined" v-model="drawerOpen" v-model:active-tab="drawerTab" v-model:pinned="shoppingSettings.isPinned.value" :tabs="DRAWER_TABS">
                    <template #filters>
                        <filter-panel
                            :grouped-filter-defs="shoppingFilters.groupedFilterDefs.value"
                            :get-filter="shoppingFilters.getFilter"
                            :set-filter="shoppingFilters.setFilter"
                            :clear-filter="shoppingFilters.clearFilter"
                            :clear-all-filters="shoppingFilters.clearAllFilters"
                            :active-filter-count="shoppingFilters.activeFilterCount.value"
                        />
                    </template>
                    <template #settings>
                        <v-list density="compact">
                            <v-list-item>
                                <v-select hide-details :items="groupingOptionsItems" v-model="useUserPreferenceStore().deviceSettings.shopping_selected_grouping"
                                          :label="$t('GroupBy')">
                                </v-select>
                            </v-list-item>
                            <v-list-item>
                                <v-switch color="primary" hide-details :label="$t('ShowFoodImages')"
                                          v-model="useUserPreferenceStore().deviceSettings.shopping_showFoodImages"></v-switch>
                            </v-list-item>
                            <v-list-item>
                                <v-switch color="primary" hide-details :label="$t('ShowSearchField')"
                                          v-model="useUserPreferenceStore().deviceSettings.shopping_show_search"></v-switch>
                            </v-list-item>
                        </v-list>

                        <collapsible-section :label="$t('Information')">
                            <v-list density="compact">
                                <v-list-item>
                                    <v-switch color="primary" hide-details :label="$t('Recipe')" v-model="useUserPreferenceStore().deviceSettings.shopping_item_info_recipe"></v-switch>
                                </v-list-item>
                                <v-list-item>
                                    <v-switch color="primary" hide-details :label="$t('Meal_Plan')" v-model="useUserPreferenceStore().deviceSettings.shopping_item_info_mealplan"></v-switch>
                                </v-list-item>
                                <v-list-item>
                                    <v-switch color="primary" hide-details :label="$t('CreatedBy')" v-model="useUserPreferenceStore().deviceSettings.shopping_item_info_created_by"></v-switch>
                                </v-list-item>
                                <v-list-item>
                                    <v-switch color="primary" hide-details label="New Input" v-model="useUserPreferenceStore().deviceSettings.shopping_input_autocomplete"></v-switch>
                                </v-list-item>
                                <v-list-item v-if="useUserPreferenceStore().serverSettings.debug">
                                    <v-switch color="primary" hide-details label="Show Debug Info" v-model="useUserPreferenceStore().deviceSettings.shopping_show_debug"></v-switch>
                                </v-list-item>
                            </v-list>
                        </collapsible-section>

                        <collapsible-section :label="$t('Shopping_list')" :default-open="false">
                            <v-list density="compact">
                                <v-list-item v-for="sl in useShoppingStore().shoppingLists" :key="sl.id" :title="sl.name">
                                    <template #append>
                                        <v-btn variant="plain" icon data-test="edit-shopping-list" :aria-label="$t('Edit')">
                                            <v-icon icon="$edit"></v-icon>
                                            <model-edit-dialog activator="parent" :item="sl" @delete="useShoppingStore().loadShoppingLists()"
                                                               @create="useShoppingStore().loadShoppingLists()" @save="useShoppingStore().loadShoppingLists()"
                                                               model="ShoppingList"></model-edit-dialog>
                                        </v-btn>
                                    </template>
                                </v-list-item>
                                <v-list-item prepend-icon="$create" link data-test="create-shopping-list">
                                    {{ $t('Create') }}
                                    <model-edit-dialog activator="parent" @delete="useShoppingStore().loadShoppingLists()" @create="useShoppingStore().loadShoppingLists()"
                                                       @save="useShoppingStore().loadShoppingLists()" model="ShoppingList"></model-edit-dialog>
                                </v-list-item>
                            </v-list>
                        </collapsible-section>

                        <v-list density="compact">
                            <v-divider></v-divider>
                            <v-list-item @click="exportDialog = true" link prepend-icon="fa-solid fa-download" data-test="export-shopping">
                                {{ $t('Export') }}
                            </v-list-item>
                        </v-list>
                    </template>
                </tabbed-drawer>

                <v-row class="mt-0">
                    <v-col>
                        <v-alert v-if="useShoppingStore().hasFailedItems()" color="warning" class="mb-2">
                            <template #prepend>
                                <v-icon icon="fa-solid fa-link-slash"></v-icon>
                            </template>
                            {{ $t('ShoppingBackgroundSyncWarning') }}
                            <template #append>
                                {{ useShoppingStore().itemCheckSyncQueue.length }}
                            </template>
                        </v-alert>

                        <shopping-list-entry-input :meal-plan-id="props.mealPlanId"></shopping-list-entry-input>

                        <v-list class="mt-3" density="compact" v-if="!useShoppingStore().initialized">
                            <v-skeleton-loader type="list-item"></v-skeleton-loader>
                            <v-skeleton-loader type="list-item"></v-skeleton-loader>
                            <v-skeleton-loader type="list-item"></v-skeleton-loader>
                            <v-skeleton-loader type="list-item"></v-skeleton-loader>
                        </v-list>
                        <v-list class="mt-3" density="compact" v-model:selected="selectedLines" select-strategy="leaf" v-else>
                            <template v-for="category in visibleItems" :key="category.name">


                                <v-list-subheader class="shopping-category-header" :style="subheaderStyle" v-if="category.name === useShoppingStore().UNDEFINED_CATEGORY">

                                    <v-btn color="secondary" variant="text" icon="fa-regular fa-square" @click="selectAll(category)"
                                           v-if="selectEnabled && !isAllSelected(category)"></v-btn>
                                    <v-btn color="secondary" variant="text" icon="fa-solid fa-square-check" @click="deselectCategory(category)"
                                           v-if="selectEnabled && isAllSelected(category)"></v-btn>
                                    <i>{{ $t('NoCategory') }}</i>

                                </v-list-subheader>

                                <v-list-subheader class="shopping-category-header" :style="subheaderStyle" v-else>
                                    <v-btn color="secondary" variant="text" icon="fa-regular fa-square" @click="selectAll(category)"
                                           v-if="selectEnabled && !isAllSelected(category)"></v-btn>
                                    <v-btn color="secondary" variant="text" icon="fa-solid fa-square-check" @click="deselectCategory(category)"
                                           v-if="selectEnabled && isAllSelected(category)"></v-btn>
                                    {{ category.name }}
                                </v-list-subheader>

                                <template v-for="[i, value] in category.foods" :key="value.food.id">
                                    <shopping-line-item :shopping-list-food="value" :select-enabled="selectEnabled"></shopping-line-item>
                                </template>

                            </template>
                        </v-list>

                        <!-- TODO remove once append to body for model select is working properly -->
                        <v-spacer style="margin-top: 120px;"></v-spacer>
                    </v-col>
                </v-row>

                <!-- DEBUG views -->
                <v-row v-if="useUserPreferenceStore().deviceSettings.shopping_show_debug">
                    <v-col cols="12" md="4">
                        <v-card>
                            <v-card-title>Auto Sync Debug</v-card-title>
                            <v-btn @click="useShoppingStore().autoSync()">Run Sync</v-btn>
                            <v-card-text>
                                <v-list>
                                    <v-list-item>currentlyUpdating: {{ useShoppingStore().currentlyUpdating }}</v-list-item>
                                    <v-list-item>hasFocus: {{ useShoppingStore().autoSyncHasFocus }}</v-list-item>
                                    <v-list-item>autoSyncTimeoutId: {{ useShoppingStore().autoSyncTimeoutId }}</v-list-item>
                                    <v-list-item>autoSyncLastTimestamp: {{ useShoppingStore().autoSyncLastTimestamp }}</v-list-item>
                                </v-list>
                            </v-card-text>
                        </v-card>
                    </v-col>
                    <v-col cols="12" md="4">
                        <v-card>
                            <v-card-title>Sync Queue Debug</v-card-title>
                            <v-card-text>
                                Length: {{ useShoppingStore().itemCheckSyncQueue.length }} <br/>
                                Has Failed Items: {{ useShoppingStore().hasFailedItems() }}
                                <v-list>
                                    <v-list-item v-for="(i, idx) in useShoppingStore().itemCheckSyncQueue" :key="idx">{{ i }}</v-list-item>
                                </v-list>
                            </v-card-text>
                        </v-card>
                    </v-col>
                    <v-col cols="12" md="4">
                        <v-card>
                            <v-card-title>Undo Debug</v-card-title>
                            <v-card-text>
                                <v-list>
                                    <v-list-item v-for="(i, idx) in useShoppingStore().undoStack" :key="idx">{{ i.type }} {{
                                            i.entries.flatMap((e: ShoppingListEntry) => e.food.name)
                                        }}
                                    </v-list-item>
                                </v-list>
                            </v-card-text>
                        </v-card>
                    </v-col>
                </v-row>
            </v-container>
        </v-window-item>
        <v-window-item value="recipes">
            <v-container>
                <v-row>
                    <v-col>
                        <v-card>
                            <v-card-title>{{ $t('Recipes') }} / {{ $t('Meal_Plan') }}</v-card-title>
                            <v-card-text>
                                <ModelSelect model="Recipe" v-model="manualAddRecipe">
                                    <template #append>
                                        <v-btn icon="$create" color="create" :disabled="manualAddRecipe == undefined">
                                            <v-icon icon="$create"></v-icon>
                                            <add-to-shopping-dialog :recipe="manualAddRecipe" v-if="manualAddRecipe != undefined"
                                                                    @created="useShoppingStore().refreshFromAPI(); manualAddRecipe = undefined"></add-to-shopping-dialog>
                                        </v-btn>
                                    </template>
                                </ModelSelect>

                                <v-list>
                                    <v-list-item v-for="r in useShoppingStore().getAssociatedRecipes()">
                                        <template #prepend>
                                            <v-btn color="edit" icon>
                                                {{ r.servings }}
                                                <number-scaler-dialog
                                                    v-if="r.mealplan == undefined"
                                                    :number="r.servings"
                                                    @confirm="(servings: number) => {updateRecipeServings(r, servings)}"
                                                ></number-scaler-dialog>
                                                <model-edit-dialog model="MealPlan" :item-id="r.mealplan" v-if="r.mealplan != undefined" activator="parent"></model-edit-dialog>
                                            </v-btn>

                                        </template>

                                        <div class="ms-2">
                                            <p v-if="r.recipe">{{ r.recipeData.name }}<br/></p>
                                            <p v-if="r.mealplan">
                                                {{ r.mealPlanData.mealType.name }} - {{ DateTime.fromJSDate(r.mealPlanData.fromDate).toLocaleString(DateTime.DATE_FULL) }}
                                                #{{ r.id }}
                                            </p>
                                        </div>

                                        <template #append>
                                            <v-btn icon color="delete">
                                                <v-icon icon="$delete"></v-icon>
                                                <delete-confirm-dialog :object-name="r.name" :model-name="$t('ShoppingListRecipe')"
                                                                       @delete="deleteListRecipe(r)"></delete-confirm-dialog>
                                            </v-btn>
                                        </template>
                                    </v-list-item>
                                </v-list>


                            </v-card-text>
                        </v-card>
                    </v-col>
                </v-row>
            </v-container>

        </v-window-item>
        <v-window-item value="selected_supermarket">
            <v-container>
                <v-row>
                    <v-col>
                        <supermarket-editor :item="useUserPreferenceStore().deviceSettings.shopping_selected_supermarket ?? undefined"
                                            @save="(args: Supermarket) => (useUserPreferenceStore().deviceSettings.shopping_selected_supermarket = args)"></supermarket-editor>
                    </v-col>
                </v-row>
            </v-container>

        </v-window-item>
    </v-window>

</template>

<script setup lang="ts">

import {computed, onBeforeUnmount, onMounted, ref, shallowRef, toRef, watch} from "vue";
import {useShoppingStore} from "@/stores/ShoppingStore";
import {ApiApi, Recipe, ResponseError, ShoppingList, ShoppingListEntry, ShoppingListRecipe, Supermarket, SupermarketCategory} from "@/openapi";
import {ErrorMessageType, PreparedMessage, useMessageStore} from "@/stores/MessageStore";
import ShoppingLineItem from "@/components/display/ShoppingLineItem.vue";
import {useUserPreferenceStore} from "@/stores/UserPreferenceStore";
import ModelSelect from "@/components/inputs/ModelSelect.vue";
import {IShoppingListCategory, IShoppingListFood, ShoppingGroupingOptions} from "@/types/Shopping";
import ShoppingUndoButton from "@/components/display/ShoppingUndoButton.vue";
import SupermarketSwitchMenu from "@/components/display/SupermarketSwitchMenu.vue";
import {useI18n} from "vue-i18n";
import NumberScalerDialog from "@/components/inputs/NumberScalerDialog.vue";
import SupermarketEditor from "@/components/model_editors/SupermarketEditor.vue";
import DeleteConfirmDialog from "@/components/dialogs/DeleteConfirmDialog.vue";
import ShoppingListEntryInput from "@/components/inputs/ShoppingListEntryInput.vue";
import {DateTime} from "luxon";
import ModelEditDialog from "@/components/dialogs/ModelEditDialog.vue";
import {onBeforeRouteLeave} from "vue-router";
import ShoppingExportDialog from "@/components/dialogs/ShoppingExportDialog.vue";
import StockUpDialog from "@/components/dialogs/StockUpDialog.vue";
import AddToShoppingDialog from "@/components/dialogs/AddToShoppingDialog.vue";
import ShoppingListSelectChip from "@/components/inputs/ShoppingListSelectChip.vue";
import CategorySelectChip from "@/components/inputs/CategorySelectChip.vue";
import SelectionBar from "@/components/common/SelectionBar.vue";
import ListToolbar from "@/components/model_list/ListToolbar.vue";
import ModelListFilterChips from "@/components/model_list/ModelListFilterChips.vue";
import FilterPanel from "@/components/model_list/FilterPanel.vue";
import TabbedDrawer from "@/components/common/TabbedDrawer.vue";
import CollapsibleSection from "@/components/common/CollapsibleSection.vue";
import {useShoppingFilters} from "@/composables/useShoppingFilters";
import {useModelListSettings} from "@/composables/modellist/useModelListSettings";
import ActionConfirmDialog from "@/components/dialogs/ActionConfirmDialog.vue";
import {parseBooleanAnnotation} from "@/utils/model_utils";

const {t} = useI18n()

const props = defineProps({
    mealPlanId: {type: Number, required: false}
})

const exportDialog = ref(false)
const stockUpDialog = ref<InstanceType<typeof StockUpDialog> | null>(null)
const currentTab = ref("shopping")
const manualAddRecipe = ref<undefined | Recipe>(undefined)

const selectEnabled = ref(false)
const selectedLines = shallowRef([] as IShoppingListFood[])
const selectedShoppingLists = ref([] as ShoppingList[])

/**
 * VSelect items for shopping list grouping options with localized names
 */
const groupingOptionsItems = computed(() => {
    let items: any[] = []
    Object.values(ShoppingGroupingOptions).forEach(x => {
        items.push({'title': t(x), 'value': x})
    })
    return items
})

/**
 * return the correct pre-cached entries structure depending on where the shopping lsit view is shown
 */
const shoppingListItems = computed(() => {
    if (props.mealPlanId != undefined) {
        return useShoppingStore().entriesByGroupMealPlan
    } else {
        return useShoppingStore().entriesByGroup
    }
})

// search and filters, same controls as the other list pages; applied on the client to the loaded list
const query = ref('')
const shoppingFilters = useShoppingFilters()
// the panel can be pinned open beside the list, remembered per device like on the other list pages
const shoppingSettings = useModelListSettings(computed(() => 'shopping'))
const drawerOpen = ref(false)
const drawerTab = ref('filters')
const DRAWER_TABS = [
    {key: 'filters', label: t('Filters'), icon: 'fa-solid fa-filter'},
    {key: 'settings', label: t('Settings'), icon: 'fa-solid fa-sliders'},
]

// the search field can be hidden per device; devices that never had the setting keep it (only an explicit off hides it)
const searchVisible = computed(() => useUserPreferenceStore().deviceSettings.shopping_show_search !== false)
// a search typed before the field was hidden must not go on filtering the list unseen
watch(searchVisible, visible => {
    if (!visible) query.value = ''
})

const hasActiveSearchState = computed(() => query.value.trim() !== '' || shoppingFilters.activeFilterCount.value > 0)

function openDrawer(tab: 'filters' | 'settings') {
    drawerTab.value = tab
    drawerOpen.value = true
}

function resetSearchAndFilters() {
    query.value = ''
    shoppingFilters.clearAllFilters()
}

/**
 * the grouped list after the search text and the category filter; categories left without foods are dropped.
 * Foods stay the very same objects, so selection and the line items keep working.
 */
const visibleItems = computed(() => {
    const text = query.value.trim().toLowerCase()
    const categoryId = shoppingFilters.getFilter('category')
    const categoryName = categoryId !== undefined ? useShoppingStore().supermarketCategories.find(c => String(c.id) === categoryId)?.name : undefined
    if (text === '' && categoryId === undefined) return shoppingListItems.value

    return shoppingListItems.value.flatMap(category => {
        if (categoryId !== undefined && category.name !== categoryName) return []
        const foods = new Map(Array.from(category.foods.entries()).filter(([, line]) => text === '' || (line.food.name ?? '').toLowerCase().includes(text)))
        return foods.size > 0 ? [{...category, foods} as IShoppingListCategory] : []
    })
})

/**
 * change style of subheaders depending on select mode
 */
const subheaderStyle = computed(() => {
    if (selectEnabled.value) {
        return 'padding-inline-start: 0!important'
    }
    return ''
})

watch(() => useUserPreferenceStore().deviceSettings, () => {
    useShoppingStore().updateEntriesStructure()
}, {deep: true})

watch(() => useShoppingStore().entriesByGroup, () => {
    selectedLines.value = []
})

/**
 * pause auto sync while the tab is hidden (nobody is looking), resume it when it is visible again
 */
function onVisibilityChange() {
    useShoppingStore().autoSyncHasFocus = (document.visibilityState === 'visible')
}

onMounted(() => {
    window.addEventListener("visibilitychange", onVisibilityChange)

    // meal-plan-scoped view only needs that plan's entries - loading the whole household
    // list here made a single meal plan's Shopping tab pull every entry, unfiltered.
    useShoppingStore().refreshFromAPI(props.mealPlanId)

    autoSyncLoop()

    // refresh selected supermarket since category ordering might have changed
    if (useUserPreferenceStore().deviceSettings.shopping_selected_supermarket != null) {
        new ApiApi().apiSupermarketRetrieve({id: useUserPreferenceStore().deviceSettings.shopping_selected_supermarket!.id!}).then(r => {
            useUserPreferenceStore().deviceSettings.shopping_selected_supermarket = r
        }).catch(err => {
            if (err instanceof ResponseError && err.response.status == 404) {
                useUserPreferenceStore().deviceSettings.shopping_selected_supermarket = null
            }
        })
    }

    useShoppingStore().loadShoppingLists()
})

/**
 * update the number of servings for an embedded recipe and with it the ShoppingListEntry amounts
 * @param recipe ShoppingListRecipe to update
 * @param servings number of servings to set the recipe to
 */
function updateRecipeServings(recipe: ShoppingListRecipe, servings: number) {
    let api = new ApiApi()
    useShoppingStore().currentlyUpdating = true

    recipe.servings = servings
    api.apiShoppingListRecipeUpdate({id: recipe.id!, shoppingListRecipe: recipe}).then(r => {
        useShoppingStore().currentlyUpdating = false
        useShoppingStore().refreshFromAPI()
        useMessageStore().addPreparedMessage(PreparedMessage.UPDATE_SUCCESS)
    }).catch(err => {
        useMessageStore().addError(ErrorMessageType.UPDATE_ERROR, err)
        useShoppingStore().currentlyUpdating = false
    })
}

/**
 * run the autosync function in a loop
 */
let autoSyncStopped = false

function autoSyncLoop() {
    if (autoSyncStopped) return

    // this should not happen in production but sometimes in development with HMR
    clearTimeout(useShoppingStore().autoSyncTimeoutId)

    let timeout = Math.max(useUserPreferenceStore().userSettings.shoppingAutoSync!, 1) * 1000 // if disabled (shopping_auto_sync=0) check again after 1 second if enabled

    // window.setTimeout forces the DOM `number` overload - plain setTimeout() resolves to
    // @types/node's NodeJS.Timeout in this project's ambient types, which doesn't match the
    // store's number-typed id.
    useShoppingStore().autoSyncTimeoutId = window.setTimeout(() => {
        if (useUserPreferenceStore().userSettings.shoppingAutoSync! > 0) {
            useShoppingStore().autoSync()
        }
        autoSyncLoop()
    }, timeout)
}

/**
 * cancel auto sync loop before leaving to another page
 */
onBeforeRouteLeave(() => {
    clearTimeout(useShoppingStore().autoSyncTimeoutId)
})

/**
 * the loop belongs to this list: leaving the route is not the only way it goes away (the meal plan's Shopping tab is unmounted when its dialog closes)
 */
onBeforeUnmount(() => {
    autoSyncStopped = true
    clearTimeout(useShoppingStore().autoSyncTimeoutId)
    window.removeEventListener("visibilitychange", onVisibilityChange)
})

/**
 * delete shopping list recipe
 */
function deleteListRecipe(slr: ShoppingListRecipe) {
    let api = new ApiApi()

    api.apiShoppingListRecipeDestroy({id: slr.id!}).then(r => {
        useShoppingStore().refreshFromAPI()
        useMessageStore().addPreparedMessage(PreparedMessage.DELETE_SUCCESS)
    }).catch(err => {
        useMessageStore().addError(ErrorMessageType.DELETE_ERROR, err)
    })
}

/** switch the supermarket from the top bar; the filter loads it in full (the list is ordered by its categories) */
function switchSupermarket(id: number | null) {
    shoppingFilters.setFilter('supermarket', id == null ? undefined : String(id))
}

function toggleSelectMode() {
    selectEnabled.value = !selectEnabled.value
    selectedLines.value = []
}

const confirmDialog = ref<InstanceType<typeof ActionConfirmDialog> | null>(null)

/** every entry of the selected foods: the batch actions work on whole foods, not on single entries */
const selectedEntries = computed(() => selectedLines.value.flatMap(slf => Array.from(slf.entries.values())))

function batchDelay() {
    if (selectedEntries.value.length === 0) return
    useShoppingStore().delayEntries(selectedEntries.value, true, true)
    selectedLines.value = []
}

function batchScale(factor: number) {
    if (selectedEntries.value.length === 0) return
    useShoppingStore().scaleEntries(selectedEntries.value, factor, true)
    selectedLines.value = []
}

async function batchIgnore() {
    const entries = selectedEntries.value
    if (entries.length === 0) return
    const confirmed = await confirmDialog.value?.open({
        title: t('Ignore_Shopping'),
        message: t('IgnoreShoppingConfirm', {count: selectedLines.value.length}),
        confirmLabel: t('Ignore_Shopping'),
        icon: 'fa-solid fa-ban',
        confirmColor: 'warning',
        confirmIcon: 'fa-solid fa-ban',
    })
    if (!confirmed) return
    useShoppingStore().setFoodIgnoredState(entries, true, true)
    selectedLines.value = []
}

/**
 * the shopping trip is done for these foods: check their entries off and put the ones that are not in the
 * pantry yet there (one request, the backend picks the default location) - the batch version of the
 * check-off "add to pantry" affordance on a single line
 */
async function batchBought() {
    const entries = [...selectedEntries.value]
    if (entries.length === 0) return
    // checking off is undoable; adding to the pantry is a separate note in the history that is not (undo never removes inventory)
    useShoppingStore().setEntriesCheckedState(entries, true, true)
    const toStock = selectedLines.value.filter(l => l.food.id != null && !parseBooleanAnnotation(l.food.inInventory))
    selectedLines.value = []
    if (toStock.length === 0) return
    try {
        await new ApiApi().apiInventoryEntryStockUpCreate({stockUp: {items: toStock.map(l => ({food: l.food.id!, amount: 1}))}})
        // show the pantry jar on those lines right away
        toStock.forEach(l => {
            (l.food as any).inInventory = 'True'
            l.entries.forEach(e => {
                if (e.food) (e.food as any).inInventory = 'True'
            })
        })
        useShoppingStore().registerNote('PANTRY_ADD', toStock.length)
        useShoppingStore().updateEntriesStructure()
    } catch (err) {
        useMessageStore().addError(ErrorMessageType.CREATE_ERROR, err)
    }
}

const batchActions = [
    {key: 'delay', icon: 'fa-solid fa-clock', labelKey: 'Postpone', run: batchDelay},
    {key: 'double', icon: 'fa-solid fa-angles-up', labelKey: 'Double', run: () => batchScale(2)},
    {key: 'halve', icon: 'fa-solid fa-angles-down', labelKey: 'Halve', run: () => batchScale(0.5)},
    {key: 'ignore', icon: 'fa-solid fa-ban', labelKey: 'Ignore_Shopping', run: batchIgnore},
    {key: 'bought', icon: 'fa-solid fa-circle-check', labelKey: 'Bought', run: batchBought},
]

/** adds the chosen lists to the entries (it used to replace their lists) */
function batchUpdateShoppingLists() {
    if (selectedEntries.value.length === 0) return
    useShoppingStore().addEntriesToShoppingLists(selectedEntries.value, selectedShoppingLists.value, true)
    selectedLines.value = []
}

function batchUpdateCategories(category: SupermarketCategory) {
    useShoppingStore().updateCategories(selectedLines.value, category, true)
    selectedLines.value = []
}

/**
 * select all entries or all entries of a given category
 * @param category
 */
function selectAll(category: IShoppingListCategory | undefined = undefined) {
    visibleItems.value.forEach(sLC => {
        if (category != undefined && sLC.name !== category.name) return
        selectedLines.value = selectedLines.value.concat(Array.from(sLC.foods.values()))
    })
}

/**
 * remove the foods that are within a given category from the selected lines array
 * @param category
 */
function deselectCategory(category: IShoppingListCategory) {
    const categoryFoodIds = new Set(Array.from(category.foods.values()).map(f => f.food.id));
    selectedLines.value = selectedLines.value.filter(f => !categoryFoodIds.has(f.food.id));
}

/**
 * check if all foods of a certain category are included in the selected lines array
 * @param category
 */
function isAllSelected(category: IShoppingListCategory | undefined = undefined) {
    let selected = true
    if (category) {
        category.foods.forEach(f => {
            if (!selectedLines.value.includes(f)) {
                selected = false
                return selected
            }
        })
    } else {
        let count = 0
        visibleItems.value.forEach(category => {
            count += category.foods.size
        })
        selected = selectedLines.value.length === count
    }
    return selected
}

</script>

<style scoped>
/* The top bar's overflow hint looks like the search toolbar's: a single plain, small, faint chevron on the right
   (no left arrow, and not the default 52px arrow button). */
.shopping-top-bar :deep(.v-slide-group__prev) {
    display: none;
}

.shopping-top-bar :deep(.v-slide-group__next) {
    flex: 0 0 auto;
    min-width: 20px;
}

.shopping-top-bar :deep(.v-slide-group__next .v-icon) {
    font-size: 0.75em;
    opacity: 0.4;
}

/* Q2/DEC-5: make supermarket-category subheaders read as real section headers — bolder,
   tinted, and sticky — instead of faint grey text lost between dense rows. Tokens only. */
.shopping-category-header {
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgb(var(--v-theme-on-surface)) !important;
    opacity: 1;
    background: rgba(var(--v-theme-primary), 0.08);
    border-radius: 4px;
    position: sticky;
    top: 0;
    z-index: 1;
}
</style>