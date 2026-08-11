<template>
    <model-editor-base
        :loading="loading"
        :dialog="dialog"
        @save="onSave()"
        @delete="useMealPlanStore().plans.delete(editingObj.id); deleteObject()"
        @close="emit('close'); editingObjChanged = false"
        :is-update="isUpdate()"
        :is-changed="editingObjChanged"
        :model-class="modelClass"
        :object-name="editingObjName()"
        :editing-object="editingObj">

        <v-card-text class="pa-0">
            <v-tabs v-model="tab" :disabled="loading">
                <v-tab prepend-icon="$mealplan" value="plan" class="meal-plan-tab">{{ $t('Meal_Plan') }}</v-tab>
                <v-tab prepend-icon="$shopping" value="shopping" v-if="editingObj.shopping || editingObj.addshopping" class="meal-plan-tab">{{ $t('Shopping_list') }}</v-tab>
            </v-tabs>
        </v-card-text>

        <v-card-text>
            <v-tabs-window v-model="tab">
                <v-tabs-window-item value="plan">
                    <v-form :disabled="loading">

                        <v-row>
                            <v-col cols="12" md="6">
                                <ModelSelect model="Recipe" :label="$t('Recipe')" v-model="editingObj.recipe"
                                             @update:modelValue="editingObj.servings = editingObj.recipe ? editingObj.recipe.servings : 1"></ModelSelect>
                                <!--                                <v-number-input label="Days" control-variant="split" :min="1"></v-number-input>-->
                                <!--TODO create days input with +/- synced to date -->
                                <recipe-card :recipe="editingObj.recipe" :servings="editingObj.servings" v-if="editingObj && editingObj.recipe" link-target="_blank"></recipe-card>

                                <v-checkbox :label="$t('AddToShopping')" v-model="editingObj.addshopping" hide-details
                                            data-test="addshopping-checkbox" v-if="editingObj.recipe && !editingObj.shopping"></v-checkbox>
                            </v-col>
                            <v-col cols="12" md="6">
                                <v-text-field :label="$t('Title')" v-model="editingObj.title"></v-text-field>
                                <v-row no-gutters class="datetime-joined-group">
                                    <v-col cols="12" sm="7">
                                        <v-date-input
                                            v-model="dateRangeValue"
                                            @update:modelValue="updateDate()"
                                            :first-day-of-week="useUserPreferenceStore().deviceSettings.mealplan_startingDayOfWeek"
                                            :show-week="useUserPreferenceStore().deviceSettings.mealplan_displayWeekNumbers"
                                            :label="$t('Date')"
                                            multiple="range"
                                            prepend-icon=""
                                            prepend-inner-icon="$calendar"
                                            hide-details
                                        ></v-date-input>
                                    </v-col>
                                    <v-col cols="12" sm="5">
                                        <v-text-field v-model="mealPlanTime"
                                            :active="timePickerMenu" :focus="timePickerMenu"
                                            :label="$t('Time')" prepend-inner-icon="fa-solid fa-clock" readonly
                                            hide-details>
                                            <v-menu v-model="timePickerMenu" :close-on-content-click="false"
                                                    activator="parent" transition="scale-transition">
                                                <v-time-picker v-if="timePickerMenu" format="24hr"
                                                               v-model="mealPlanTime"
                                                               @update:modelValue="applyTimeToEditingDates"></v-time-picker>
                                            </v-menu>
                                        </v-text-field>
                                    </v-col>
                                </v-row>

                                <v-input>
                                    <v-btn-group elevation="1" class="w-100" divided border>
                                        <v-btn class="w-25" @click="adjustDateRangeLength(dateRangeValue,-1); updateDate()"><i class="fa-solid fa-minus"></i></v-btn>
                                        <v-btn class="w-25" @click="dateRangeValue = shiftDateRange(dateRangeValue, -1); updateDate()"><i class="fa-solid fa-angles-left"></i>
                                        </v-btn>
                                        <v-btn class="w-25" @click="dateRangeValue = shiftDateRange(dateRangeValue, +1); updateDate()"><i class="fa-solid fa-angles-right"></i>
                                        </v-btn>
                                        <v-btn class="w-25" @click="adjustDateRangeLength(dateRangeValue,+1); updateDate()"><i class="fa-solid fa-plus"></i></v-btn>
                                    </v-btn-group>
                                </v-input>

                                <ModelSelect model="MealType" :label="$t('Meal_Type')" :allow-create="true" v-model="editingObj.mealType"></ModelSelect>
                                <v-number-input control-variant="split" :min="0" v-model="editingObj.servings" :label="$t('Servings')" :precision="2"></v-number-input>
                            </v-col>

                        </v-row>
                        <v-row density="compact">
                            <v-col cols="12">
                                <v-textarea :label="$t('Note')" v-model="editingObj.note" rows="3"></v-textarea>
                            </v-col>
                        </v-row>

                        <closable-help-alert :text="$t('HouseholdSettingsHelp')" :title="$t('Household')"></closable-help-alert>

                    </v-form>
                </v-tabs-window-item>

                <v-tabs-window-item value="shopping">
                    <closable-help-alert class="mb-2" :text="$t('MealPlanShoppingHelp')"></closable-help-alert>

                    <!-- Same reusable component either way - staging (not yet committed) shows the
                         recipe's ingredients with a commit button; live (already committed) shows the
                         real, editable ShoppingListEntry rows once they're loaded. -->
                    <recipe-shopping-preview v-if="editingObj.recipe && editingObj.shopping && shoppingEntries !== undefined"
                                              :key="editingObj.id"
                                              :recipe="editingObj.recipe" :meal-plan="editingObj"
                                              :existing-entries="shoppingEntries"></recipe-shopping-preview>
                    <recipe-shopping-preview v-else-if="editingObj.recipe && !editingObj.shopping"
                                              :recipe="editingObj.recipe" :meal-plan="editingObj"
                                              :on-before-commit="ensurePlanSaved"
                                              @created="onShoppingCreated"></recipe-shopping-preview>
                    <div v-else class="d-flex justify-center pa-4"><v-progress-circular indeterminate></v-progress-circular></div>

                </v-tabs-window-item>
            </v-tabs-window>
        </v-card-text>
    </model-editor-base>

</template>

<script setup lang="ts">

import {nextTick, onMounted, PropType, ref, toRaw, watch} from "vue";
import {ApiApi, MealPlan, MealType, ShoppingListRecipe} from "@/openapi";
import ModelEditorBase from "@/components/model_editors/ModelEditorBase.vue";
import {useModelEditorFunctions} from "@/composables/useModelEditorFunctions";
import {DateTime} from "luxon";
import {adjustDateRangeLength, shiftDateRange} from "@/utils/date_utils";
import ModelSelect from "@/components/inputs/ModelSelect.vue";
import RecipeCard from "@/components/display/RecipeCard.vue";
import {VDateInput} from "vuetify/components";
import {useUserPreferenceStore} from "@/stores/UserPreferenceStore";
import {ErrorMessageType, MessageType, useMessageStore} from "@/stores/MessageStore";
import ShoppingLineItem from "@/components/display/ShoppingLineItem.vue";
import ShoppingListEntryInput from "@/components/inputs/ShoppingListEntryInput.vue";
import ClosableHelpAlert from "@/components/display/ClosableHelpAlert.vue";
import {useMealPlanStore} from "@/stores/MealPlanStore";
import RecipeShoppingPreview from "@/components/display/RecipeShoppingPreview.vue";
import {resolveMealplanShoppingAction} from "@/utils/mealplan_shopping";
import type {ShoppingListEntry} from "@/openapi";

const props = defineProps({
    item: {type: {} as PropType<MealPlan>, required: false, default: null},
    itemDefaults: {type: {} as PropType<MealPlan>, required: false, default: {} as MealPlan},
    itemId: {type: [Number, String], required: false, default: undefined},
    dialog: {type: Boolean, default: false}
})

const emit = defineEmits(['create', 'save', 'delete', 'close', 'changedState'])
const {
    setupState,
    deleteObject,
    saveObject,
    isUpdate,
    editingObjName,
    applyItemDefaults,
    loading,
    editingObj,
    editingObjChanged,
    modelClass
} = useModelEditorFunctions<MealPlan>('MealPlan', emit)

/**
 * watch prop changes and re-initialize editor
 * required to embed editor directly into pages and be able to change item from the outside
 */
watch([() => props.item, () => props.itemId], () => {
    initializeEditor()
})

// object specific data (for selects/display)
const tab = ref('plan')

// D11 P2a: a new plan's "add to shopping" intent opens an editable preview (default) instead of
// the silent backend auto-add; the browser-remembered fast-path skips straight to the silent add.
const deviceSettings = useUserPreferenceStore().deviceSettings

function onSave() {
    const wantsShopping = !isUpdate() && !!editingObj.value.recipe && !!editingObj.value.addshopping
    const action = resolveMealplanShoppingAction(wantsShopping, deviceSettings.mealplan_shopping_skipPreview)
    // Only the fast path lets the backend auto-add; otherwise the preview commits the entries.
    editingObj.value.addshopping = action.addshopping
    return saveObject().then((obj: MealPlan | undefined) => {
        if (!obj?.id) return obj  // save failed (e.g. validation error) — saveObject already surfaced it
        useMealPlanStore().plans.set(obj.id, obj)
        if (action.openPreview && obj.recipe) {
            tab.value = 'shopping'
        }
        return obj
    })
}

const dateRangeValue = ref([] as Date[])
const timePickerMenu = ref(false)
const mealPlanTime = ref('12:00')

watch(() => editingObj.value.mealType, (newType, oldType) => {
    if (newType?.time && newType?.time !== oldType?.time) {
        mealPlanTime.value = newType.time.substring(0, 5)
        applyTimeToEditingDates()
    }
})

// Checking the box switches straight to the Shopping tab, which already shows the same staging
// preview inline (item 17) - no separate popup needed anymore. The new-plan skip-preview fast
// path is untouched: it stays on the Plan tab and lets onSave() resolve addshopping straight
// through to the backend's silent auto-add.
watch(() => editingObj.value.addshopping, (val) => {
    if (!val || editingObj.value.shopping) return
    if (!isUpdate() && deviceSettings.mealplan_shopping_skipPreview) return
    tab.value = 'shopping'
})

/**
 * ensures the plan is persisted before the shopping preview commits its entries - a shopping
 * entry links to a real meal-plan id, but staging/reviewing it never required one. Called by
 * RecipeShoppingPreview only when its own "Add to Shopping" button is clicked.
 */
async function ensurePlanSaved(): Promise<MealPlan | undefined> {
    if (isUpdate()) return editingObj.value
    // the caller (the shopping preview) is about to commit its own entries right after this -
    // the backend's create() serializer ALSO silently auto-adds when addshopping is true
    // (RecipeShoppingEditor, server-side), which would otherwise produce a second, duplicate
    // ShoppingListRecipe for the same plan+recipe.
    editingObj.value.addshopping = false
    const obj = await saveObject()
    if (obj?.id) {
        useMealPlanStore().plans.set(obj.id, obj)
    }
    return obj
}

function applyTimeToEditingDates() {
    if (!mealPlanTime.value) return
    let changed = editingObjChanged.value
    const [hours, minutes] = mealPlanTime.value.split(':').map(Number)
    if (editingObj.value.fromDate) {
        editingObj.value.fromDate = DateTime.fromJSDate(editingObj.value.fromDate)
            .set({hour: hours, minute: minutes, second: 0, millisecond: 0}).toJSDate()
    }
    if (editingObj.value.toDate) {
        editingObj.value.toDate = DateTime.fromJSDate(editingObj.value.toDate)
            .set({hour: hours, minute: minutes, second: 0, millisecond: 0}).toJSDate()
    }
    nextTick(() => {
        editingObjChanged.value = changed
    })
}

const shoppingEntries = ref<ShoppingListEntry[] | undefined>(undefined)

/**
 * fetch just this plan's shopping entries (not the whole household list) so
 * recipe-shopping-preview can render its live, editable view.
 */
async function loadShoppingEntries() {
    if (!editingObj.value.id) return
    try {
        const r = await new ApiApi().apiShoppingListEntryList({mealplan: editingObj.value.id, pageSize: 100})
        shoppingEntries.value = r.results
    } catch (err) {
        useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
    }
}

/**
 * load the plan's entries once switching to an already-committed Shopping tab - never triggers
 * a save (the tab is only reachable once the plan is saved or the preview is staging, per its
 * own v-if/v-else-if).
 */
watch(() => tab.value, (newVal) => {
    if (newVal !== 'shopping' || !editingObj.value.shopping) return
    loadShoppingEntries()
})

/**
 * the shopping preview already persisted the entries itself (independent of Save) - don't let
 * this nested mutation mark the whole plan as unsaved. editingObjChanged's watcher runs on the
 * next tick's flush, so it must be reset after that flush, not synchronously here.
 */
function onShoppingCreated() {
    editingObj.value.shopping = true
    loadShoppingEntries()
    nextTick(() => {
        editingObjChanged.value = false
    })
}

onMounted(() => {
    initializeEditor()
})

/**
 * component specific state setup logic
 */
function initializeEditor() {
    const api = new ApiApi()

    // load meal types and create new object based on default type when initially loading
    // TODO remove this once moved to user preference from MealType property
    loading.value = true

    setupState(props.item, props.itemId, {
        newItemFunction: () => {
            const noonToday = DateTime.now().set({hour: 12, minute: 0, second: 0, millisecond: 0})
            editingObj.value.fromDate = noonToday.toJSDate()
            editingObj.value.toDate = noonToday.toJSDate()
            mealPlanTime.value = '12:00'

            editingObj.value.servings = 1

            if (useUserPreferenceStore().userSettings.defaultMealType){
                editingObj.value.mealType = useUserPreferenceStore().userSettings.defaultMealType
            }

            editingObj.value.addshopping = useUserPreferenceStore().userSettings.mealplanAutoaddShopping

            applyItemDefaults(props.itemDefaults)

            if (editingObj.value.mealType?.time) {
                mealPlanTime.value = editingObj.value.mealType.time.substring(0, 5)
            }
            applyTimeToEditingDates()

            if (editingObj.value.toDate < editingObj.value.fromDate) {
                editingObj.value.toDate = editingObj.value.fromDate
            }

            initializeDateRange()

            nextTick(() => {
                editingObjChanged.value = false
            })
        }, existingItemFunction: () => {
            editingObj.value = structuredClone(toRaw(editingObj.value))
            if (editingObj.value.fromDate) {
                mealPlanTime.value = DateTime.fromJSDate(editingObj.value.fromDate).toFormat('HH:mm')
            }
            initializeDateRange()
        }
    },)

}

/**
 * update the editing object with data from the date range selector whenever its changed (could probably be a watcher)
 */
// TODO properly hook into beforeSave hook if i ever implement one for model editors
function updateDate() {
    // v-date-input emits an empty array (not null) when cleared - `!= null` alone let an
    // empty array through, corrupting fromDate to undefined and crashing Save (#21).
    if (dateRangeValue.value != null && dateRangeValue.value.length > 0) {
        editingObj.value.fromDate = dateRangeValue.value[0]
        if (dateRangeValue.value[dateRangeValue.value.length - 1] > editingObj.value.fromDate) {
            editingObj.value.toDate = dateRangeValue.value[dateRangeValue.value.length - 1]
        } else {
            editingObj.value.toDate = editingObj.value.fromDate
        }
        applyTimeToEditingDates()
    } else {
        useMessageStore().addMessage(MessageType.WARNING, 'Missing Date', 7000)
    }
}

/**
 * initialize the dateRange selector when the editingObject is initialized
 */
function initializeDateRange() {
    if (editingObj.value.toDate && DateTime.fromJSDate(editingObj.value.toDate).diff(DateTime.fromJSDate(editingObj.value.fromDate), 'days').toObject().days! >= 1) {
        dateRangeValue.value = [editingObj.value.fromDate]
        let currentDate = DateTime.fromJSDate(editingObj.value.fromDate).plus({day: 1}).toJSDate()
        while (currentDate <= editingObj.value.toDate) {
            dateRangeValue.value.push(currentDate)
            currentDate = DateTime.fromJSDate(currentDate).plus({day: 1}).toJSDate()
        }
    } else {
        dateRangeValue.value = [editingObj.value.fromDate, editingObj.value.fromDate]
    }
}

</script>

<style scoped>
/* pinned to a fixed half-width instead of v-tabs' "grow" (equal-share of visible tabs) so the
   Meal Plan tab doesn't jump between full and half width as the Shopping List tab appears/disappears */
.meal-plan-tab {
    flex: 0 0 50%;
    max-width: 50%;
}

@media (min-width: 600px) {
    .datetime-joined-group {
        background: rgba(0, 0, 0, 0.04);
        border-radius: 4px 4px 0 0;
    }
    .datetime-joined-group :deep(.v-field__overlay) {
        display: none;
    }
    .datetime-joined-group :deep(.v-field) {
        border-radius: 0;
    }
    .datetime-joined-group > :first-child :deep(.v-field) {
        border-top-left-radius: 4px;
    }
    .datetime-joined-group > :last-child :deep(.v-field) {
        border-top-right-radius: 4px;
    }
}
</style>