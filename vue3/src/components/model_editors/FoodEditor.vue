<template>
    <model-editor-base
        :loading="loading"
        :dialog="dialog"
        @save="saveObject(); saveObjectConversions()"
        @delete="deleteObject"
        @close="emit('close'); editingObjChanged = false"
        :is-update="isUpdate()"
        :is-changed="editingObjChanged"
        :model-class="modelClass"
        :object-name="editingObjName()"
        :editing-object="editingObj">

        <v-card-text class="pa-0">
            <v-tabs v-model="tab" :disabled="loading" grow>
                <v-tab value="food">{{ $t('Food') }}</v-tab>
                <v-tab value="properties" :disabled="!isUpdate()">{{ $t('Properties') }}</v-tab>
                <v-tab value="conversions" :disabled="!isUpdate()">{{ $t('Conversion') }}</v-tab>
                <v-tab value="hierarchy" :disabled="!isUpdate()">{{ $t('Hierarchy') }}</v-tab>
                <v-tab value="misc" :disabled="!isUpdate()">{{ $t('Miscellaneous') }}</v-tab>
            </v-tabs>
        </v-card-text>

        <v-card-text>
            <v-tabs-window v-model="tab">
                <v-tabs-window-item value="food">
                    <v-form :disabled="loading">
                        <v-text-field :label="$t('Name')" v-model="editingObj.name"></v-text-field>
                        <v-text-field :label="$t('Plural')" v-model="editingObj.pluralName"></v-text-field>
                        <v-textarea :label="$t('Description')" v-model="editingObj.description"></v-textarea>
                        <!-- TODO fix card overflow invisible, overflow-visible class is not working -->
                        <user-file-field v-model="editingObj.foodImage" :label="$t('Image')" />
                        <model-select :label="$t('Category')" v-model="editingObj.supermarketCategory" model="SupermarketCategory" allow-create append-to-body></model-select>
                        <model-select :label="$t('ShoppingList')" :hint="$t('DefaultShoppingListHelp')" v-model="editingObj.shoppingLists" model="ShoppingList" mode="tags" allow-create append-to-body></model-select>

                        <div class="text-caption text-medium-emphasis mb-1">{{ $t('ShelfLife') }}</div>

                        <v-row density="compact" align="center">
                            <v-col cols="7">
                                <v-number-input :label="$t('Pantry / Fridge')" v-model="shelfLifeValue" :precision="0" :min="0" control-variant="hidden" clearable hide-details></v-number-input>
                            </v-col>
                            <v-col cols="5">
                                <v-select :label="$t('Period')" v-model="shelfLifePeriod" hide-details
                                          :items="[{title: $t('Days'), value: 'day'}, {title: $t('Weeks'), value: 'week'}, {title: $t('Months'), value: 'month'}]"></v-select>
                            </v-col>
                            <v-col cols="12">
                                <expiry-preset-chips @select="(days:number) => setShelfLife('pantry', days)"></expiry-preset-chips>
                            </v-col>
                        </v-row>

                        <v-row density="compact" align="center">
                            <v-col cols="7">
                                <v-number-input :label="$t('Freezer')" v-model="shelfLifeFrozenValue" :precision="0" :min="0" control-variant="hidden" clearable hide-details></v-number-input>
                            </v-col>
                            <v-col cols="5">
                                <v-select :label="$t('Period')" v-model="shelfLifeFrozenPeriod" hide-details
                                          :items="[{title: $t('Days'), value: 'day'}, {title: $t('Weeks'), value: 'week'}, {title: $t('Months'), value: 'month'}]"></v-select>
                            </v-col>
                            <v-col cols="12">
                                <freezer-category-chips @select="(days:number) => setShelfLife('frozen', days)"></freezer-category-chips>
                            </v-col>
                        </v-row>

                        <v-row density="compact" align="center" class="mb-2">
                            <v-col cols="7">
                                <v-number-input :label="$t('Opened')" v-model="shelfLifeOpenedValue" :precision="0" :min="0" control-variant="hidden" clearable hide-details></v-number-input>
                            </v-col>
                            <v-col cols="5">
                                <v-select :label="$t('Period')" v-model="shelfLifeOpenedPeriod" hide-details
                                          :items="[{title: $t('Days'), value: 'day'}, {title: $t('Weeks'), value: 'week'}, {title: $t('Months'), value: 'month'}]"></v-select>
                            </v-col>
                            <v-col cols="12">
                                <expiry-preset-chips @select="(days:number) => setShelfLife('opened', days)"></expiry-preset-chips>
                            </v-col>
                        </v-row>
                        <div class="text-caption text-medium-emphasis mb-4">{{ $t('ShelfLifeHelp') }}</div>

                        <v-row density="compact" align="center" class="mb-2">
                            <v-col cols="7">
                                <v-number-input :label="$t('ShoppingAmount')" v-model="editingObj.shoppingAmount" :precision="2" :min="0" control-variant="hidden" clearable hide-details></v-number-input>
                            </v-col>
                            <v-col cols="5">
                                <model-select :label="$t('ShoppingUnit')" v-model="editingObj.preferredShoppingUnit" model="Unit" append-to-body hide-details></model-select>
                            </v-col>
                        </v-row>

                        <model-select :label="$t('PreferredUnit')" v-model="editingObj.preferredUnit" model="Unit" append-to-body></model-select>
                    </v-form>
                </v-tabs-window-item>

                <v-tabs-window-item value="properties">
                    <v-alert icon="$help">{{ $t('PropertiesFoodHelp') }}</v-alert>
                    <v-form :disabled="loading" class="mt-5">
                        <v-number-input :label="$t('FDC_ID')" v-model="editingObj.fdcId" :precision="0" control-variant="hidden" clearable>
                            <template #append-inner>
                                <v-btn icon="$search" size="small" density="compact" variant="plain" v-if="editingObj.fdcId == undefined"
                                       @click="fdcDialog = true"></v-btn>
                                <v-btn @click="updateFoodFdcData()" icon="fa-solid fa-arrows-rotate" size="small" density="compact" variant="plain"
                                       v-if="editingObj.fdcId"></v-btn>
                                <v-btn @click="openFdcPage(editingObj.fdcId)" :href="`https://fdc.nal.usda.gov/food-details/${editingObj.fdcId}/nutrients`" target="_blank"
                                       icon="fa-solid fa-arrow-up-right-from-square"
                                       size="small" variant="plain" v-if="editingObj.fdcId"></v-btn>
                            </template>

                        </v-number-input>

                        <v-number-input :label="$t('Properties_Food_Amount')" v-model="editingObj.propertiesFoodAmount" :precision="2"></v-number-input>
                        <model-select :label="$t('Properties_Food_Unit')" v-model="editingObj.propertiesFoodUnit" model="Unit"></model-select>

                        <properties-editor v-model="editingObj" :amount-for="propertiesAmountFor"></properties-editor>

                        <!-- TODO remove once append to body for model select is working properly -->
                        <v-spacer style="margin-top: 80px;"></v-spacer>
                    </v-form>
                </v-tabs-window-item>

                <v-tabs-window-item value="conversions">
                    <v-alert icon="$help">{{ $t('ConversionsHelp') }}</v-alert>
                    <v-form :disabled="loading" class="mt-5">

                        <v-btn color="create" @click="unitConversions.push({food: editingObj} as UnitConversion)" prepend-icon="$create">{{ $t('Add') }}</v-btn>

                        <v-card class="mt-2" border v-for="uc in unitConversions">
                            <v-card-title>
                                <span v-if="uc.baseUnit">{{ uc.baseAmount }} {{ uc.baseUnit.name }}</span>
                                <v-icon size="x-small" icon="fa-solid fa-arrows-left-right" class="me-2 ms-2"></v-icon>
                                <span v-if="uc.convertedUnit">{{ uc.convertedAmount }} {{ uc.convertedUnit.name }}</span>
                                <v-btn color="delete" class="float-right d-none d-md-block" @click="deleteUnitConversion(uc, true)">
                                    <v-icon icon="$delete"></v-icon>
                                </v-btn>
                                <v-btn color="edit" class="float-right d-md-none">
                                    <v-icon icon="$edit"></v-icon>
                                    <model-edit-dialog model="UnitConversion" :item="uc" @delete="deleteUnitConversion(uc, false)" :disabled-fields="['food']"></model-edit-dialog>
                                </v-btn>
                            </v-card-title>
                            <v-card-text class="d-none d-md-block">
                                <v-row density="compact">
                                    <v-col md="6">
                                        <v-number-input :label="$t('Amount')" :step="10" v-model="uc.baseAmount" control-variant="stacked" :precision="3" hide-details></v-number-input>
                                    </v-col>
                                    <v-col md="6">
                                        <!-- TODO fix card overflow invisible, overflow-visible class is not working -->
                                        <model-select v-model="uc.baseUnit" model="Unit" :label="$t('Unit')" hide-details></model-select>
                                    </v-col>
                                </v-row>
                                <v-row density="compact">
                                    <v-col cols="12" class="text-center">
                                        <v-icon icon="fa-solid fa-arrows-up-down" class="mt-4 mb-4"></v-icon>
                                    </v-col>
                                </v-row>
                                <v-row density="compact">
                                    <v-col md="6">
                                        <v-number-input :label="$t('Amount')" :step="10" v-model="uc.convertedAmount" control-variant="stacked" :precision="3"></v-number-input>
                                    </v-col>
                                    <v-col md="6">
                                        <!-- TODO fix card overflow invisible, overflow-visible class is not working -->
                                        <model-select v-model="uc.convertedUnit" model="Unit" :label="$t('Unit')"></model-select>
                                    </v-col>
                                </v-row>
                            </v-card-text>

                        </v-card>
                    </v-form>
                    <!-- TODO remove once append to body for model select is working properly -->
                        <v-spacer style="margin-top: 80px;"></v-spacer>
                </v-tabs-window-item>

                <v-tabs-window-item value="hierarchy">
                    <hierarchy-editor v-model="editingObj" :model="modelClass.model.name"></hierarchy-editor>

                    <v-divider class="my-4" />
                    <div class="text-caption text-medium-emphasis mb-2">
                        <v-icon size="x-small" class="mr-1" icon="fa-solid fa-location-crosshairs" />
                        {{ $t('Settings') }}: <strong>{{ editingObj.name }}</strong>
                    </div>

                    <v-checkbox :label="$t('substitute_siblings')" :hint="$t('substitute_siblings_help')" v-model="editingObj.substituteSiblings" persistent-hint></v-checkbox>
                    <v-checkbox :label="$t('substitute_children')" :hint="$t('substitute_children_help')" v-model="editingObj.substituteChildren" persistent-hint></v-checkbox>

                    <ModelSelect model="FoodInheritField" v-model="editingObj.inheritFields" :label="$t('InheritFields')" :hint="$t('InheritFields_help')"
                                 mode="tags"></ModelSelect>
                    <ModelSelect model="FoodInheritField" v-model="editingObj.childInheritFields" :label="$t('ChildInheritFields')" :hint="$t('ChildInheritFields_help')"
                                 mode="tags"></ModelSelect>

                    <!-- TODO remove once append to body for model select is working properly -->
                        <v-spacer style="margin-top: 100px;"></v-spacer>
                </v-tabs-window-item>

                <v-tabs-window-item value="misc">
                    <v-form :disabled="loading" class="mt-5">
                        <ModelSelect model="Recipe" v-model="editingObj.recipe" :label="$t('Recipe')"></ModelSelect>
                        <v-text-field :label="$t('Website')" v-model="editingObj.url"></v-text-field>
                        <v-checkbox :label="$t('OnHand')" :hint="$t('OnHand_help')" v-model="editingObj.foodOnhand" persistent-hint></v-checkbox>
                        <v-checkbox :label="$t('Ignore_Shopping')" :hint="$t('ignore_shopping_help')" v-model="editingObj.ignoreShopping" persistent-hint></v-checkbox>
                        <v-divider class="mt-2 mb-2"></v-divider>
                        <ModelSelect model="Food" v-model="editingObj.substitute" :label="$t('Substitutes')" :hint="$t('substitute_help')" mode="tags"></ModelSelect>

                        <!-- TODO re-add reset inheritance button/api call /function (previously annotated field on food -->
                        <v-text-field :label="$t('Open_Data_Slug')" :hint="$t('open_data_help_text')" persistent-hint v-model="editingObj.openDataSlug" disabled></v-text-field>
                    </v-form>
                </v-tabs-window-item>
            </v-tabs-window>

        </v-card-text>

        <fdc-search-dialog v-model="fdcDialog"
                           @selected="(fdcId:number) => {editingObj.fdcId = fdcId;}"></fdc-search-dialog>

    </model-editor-base>

</template>

<script setup lang="ts">

import {computed, nextTick, onMounted, PropType, ref, watch} from "vue";
import {ApiApi, Food, Unit, UnitConversion} from "@/openapi";
import {ErrorMessageType, useMessageStore} from "@/stores/MessageStore";
import ModelSelect from "@/components/inputs/ModelSelect.vue";
import UserFileField from "@/components/inputs/UserFileField.vue";
import ModelEditDialog from "@/components/dialogs/ModelEditDialog.vue";
import ModelEditorBase from "@/components/model_editors/ModelEditorBase.vue";
import {useModelEditorFunctions} from "@/composables/useModelEditorFunctions";
import PropertiesEditor from "@/components/inputs/PropertiesEditor.vue";
import {useUserPreferenceStore} from "@/stores/UserPreferenceStore";
import FdcSearchDialog from "@/components/dialogs/FdcSearchDialog.vue";
import {openFdcPage} from "@/utils/fdc.ts";
import {DateTime} from "luxon";
import HierarchyEditor from "@/components/inputs/HierarchyEditor.vue";
import {useRoute} from 'vue-router'
import {shelfLifeFromDays, shelfLifeToDays, type ShelfLifePeriod} from "@/utils/pantry_utils.ts";
import ExpiryPresetChips from "@/components/inputs/ExpiryPresetChips.vue";
import FreezerCategoryChips from "@/components/inputs/FreezerCategoryChips.vue";


const props = defineProps({
    item: {type: {} as PropType<Food>, required: false, default: null},
    itemId: {type: [Number, String], required: false, default: undefined},
    itemDefaults: {type: {} as PropType<Food>, required: false, default: {} as Food},
    dialog: {type: Boolean, default: false}
})

const emit = defineEmits(['create', 'save', 'delete', 'close', 'changedState'])
const {setupState, deleteObject, saveObject, isUpdate, editingObjName, loading, editingObj, editingObjChanged, modelClass} = useModelEditorFunctions<Food>('Food', emit)

/**
 * watch prop changes and re-initialize editor
 * required to embed editor directly into pages and be able to change item from the outside
 */
watch([() => props.item, () => props.itemId], () => {
    initializeEditor()
})

// object specific data (for selects/display)

// shelf life is stored as days but edited as a value + period (days/weeks/months) — three
// independent pairs, one per physical state: sealed (Pantry/Fridge), sealed & frozen, and Opened.
const shelfLifeValue = ref<number | null>(null)
const shelfLifePeriod = ref<ShelfLifePeriod>('day')
const shelfLifeFrozenValue = ref<number | null>(null)
const shelfLifeFrozenPeriod = ref<ShelfLifePeriod>('day')
const shelfLifeOpenedValue = ref<number | null>(null)
const shelfLifeOpenedPeriod = ref<ShelfLifePeriod>('day')

/** Wire a {value, period} picker pair to a shelfLifeDays* field on editingObj: initializes from
 * the stored days on load, and writes picker changes back — only when the value actually changes,
 * so initializing on load doesn't mark a pristine food as edited (undefined and null both mean
 * "unset"). Shared by all three rows so the three pairs don't hand-copy the same watcher logic. */
function useShelfLifePicker(field: 'shelfLifeDays' | 'shelfLifeDaysFrozen' | 'shelfLifeDaysOpened', value: typeof shelfLifeValue, period: typeof shelfLifePeriod) {
    watch(() => editingObj.value?.[field], (days) => {
        const sl = shelfLifeFromDays(days)
        value.value = sl.value
        period.value = sl.period
    }, {immediate: true})

    watch([value, period], ([v, p]) => {
        if (!editingObj.value) return
        const days = shelfLifeToDays(v, p)
        if ((days ?? null) !== (editingObj.value[field] ?? null)) {
            editingObj.value[field] = days
        }
    })
}

useShelfLifePicker('shelfLifeDays', shelfLifeValue, shelfLifePeriod)
useShelfLifePicker('shelfLifeDaysFrozen', shelfLifeFrozenValue, shelfLifeFrozenPeriod)
useShelfLifePicker('shelfLifeDaysOpened', shelfLifeOpenedValue, shelfLifeOpenedPeriod)

/** Quick-select preset chip handler: fills a row's value+period pair from a preset day count,
 * without requiring the food to have any shelf-life field configured first. */
function setShelfLife(row: 'pantry' | 'frozen' | 'opened', days: number) {
    const sl = shelfLifeFromDays(days)
    if (row === 'pantry') {
        shelfLifeValue.value = sl.value
        shelfLifePeriod.value = sl.period
    } else if (row === 'frozen') {
        shelfLifeFrozenValue.value = sl.value
        shelfLifeFrozenPeriod.value = sl.period
    } else {
        shelfLifeOpenedValue.value = sl.value
        shelfLifeOpenedPeriod.value = sl.period
    }
}

/**
 * compute label for the properties amount input to show user for
 * what amount of food a property is entered
 */
const propertiesAmountFor = computed(() => {
    let amountFor = ''
    if (editingObj.value.propertiesFoodAmount) {
        amountFor += editingObj.value.propertiesFoodAmount
    }
    if (editingObj.value.propertiesFoodUnit) {
        amountFor += " " + editingObj.value.propertiesFoodUnit.name
    }
    return amountFor
})

const route = useRoute()
const requestedTab = !props.dialog ? (route.query.tab as string) : null
const tab = ref('food')

// Apply route query tab after loading completes (tabs are disabled until isUpdate())
if (requestedTab) {
    const stopTabWatcher = watch(loading, (isLoading) => {
        if (!isLoading && isUpdate()) {
            nextTick(() => { tab.value = requestedTab })
            stopTabWatcher()
        }
    })
}

const unitConversions = ref([] as UnitConversion[])

const fdcDialog = ref(false)

// load conversions the first time the conversions tab is opened
const stopConversionsWatcher = watch(tab, (value, oldValue, onCleanup) => {
    if (value == 'conversions') {
        loadConversions()
        stopConversionsWatcher()
    }
})

onMounted(() => {
    initializeEditor()
})

/**
 * component specific state setup logic
 */
function initializeEditor() {
    setupState(props.item, props.itemId, {
        newItemFunction: () => {
            editingObj.value.propertiesFoodAmount = 100
            editingObj.value.propertiesFoodUnit = (useUserPreferenceStore().defaultUnitObj != null) ? useUserPreferenceStore().defaultUnitObj! : {name: 'g'} as Unit
        },
        itemDefaults: props.itemDefaults,
    })
}


/**
 * saves the edited object in the database
 */
async function saveObjectConversions() {
    const api = new ApiApi()
    unitConversions.value.forEach((uc) => {
        if (uc.id) {
            api.apiUnitConversionUpdate({id: uc.id, unitConversion: uc}).catch(err => {
                useMessageStore().addError(ErrorMessageType.UPDATE_ERROR, err)
            })
        } else {
            api.apiUnitConversionCreate({id: uc.id, unitConversion: uc}).catch(err => {
                useMessageStore().addError(ErrorMessageType.CREATE_ERROR, err)
            })
        }
    })
}

// ------------------------------------------------------
// object specific functions
// ------------------------------------------------------

/**
 * load conversions for currently editing food from API
 */
function loadConversions() {
    const api = new ApiApi()
    api.apiUnitConversionList({foodId: editingObj.value.id}).then(r => {
        unitConversions.value = r.results
    }).catch(err => {
        useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
    })
}

/**
 * delete unit conversion from local list and if parameter is true also from database
 * @param unitConversion UnitConversion to delete
 * @param database if UnitConversion should also be deleted from database
 */
function deleteUnitConversion(unitConversion: UnitConversion, database = false) {
    unitConversions.value = unitConversions.value.filter(uc => uc !== uc)
    if (database && unitConversion.id) {
        const api = new ApiApi()
        api.apiUnitConversionDestroy({id: unitConversion.id}).catch(err => {
            useMessageStore().addError(ErrorMessageType.DELETE_ERROR, err)
        })
    }
}

/**
 * Update the food FDC data on the server and update the editing object
 */
function updateFoodFdcData() {
    let api = new ApiApi()
    if (editingObj.value.fdcId) {
        saveObject().then(() => {

            loading.value = true
            api.apiFoodFdcCreate({id: editingObj.value.id!, food: editingObj.value}).then(r => {
                editingObj.value = r
            }).catch(err => {
                useMessageStore().addError(ErrorMessageType.UPDATE_ERROR, err)
            }).finally(() => {
                loading.value = false
                editingObjChanged.value = false
            })
        })
    }
}

</script>

<style scoped>

</style>