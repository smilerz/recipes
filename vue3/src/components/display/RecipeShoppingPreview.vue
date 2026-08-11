<template>
    <model-select v-if="!liveMode" model="ShoppingList" mode="tags" :hint="$t('LeaveEmptyForDefaultList')" v-model="selectedShoppingLists"></model-select>
    <v-expansion-panels variant="accordion" v-model="panel">
        <v-expansion-panel v-for="r in dialogRecipes" :key="r.recipe.id!" :value="r.recipe.id!">
            <v-expansion-panel-title>{{ r.recipe.name }}</v-expansion-panel-title>
            <v-expansion-panel-text>
                <v-table density="compact">
                    <tbody>
                    <tr v-for="e in r.entries" :key="e.id" @click="liveMode ? toggleEntry(e) : (e.checked = !e.checked)" class="cursor-pointer">
                        <td style="width: 1%; text-wrap: nowrap" class="pa-0">
                            <v-checkbox-btn v-if="!liveMode" v-model="e.checked" color="success"></v-checkbox-btn>
                            <v-checkbox-btn v-else :model-value="e.checked" color="success" @click.stop="toggleEntry(e)"></v-checkbox-btn>
                        </td>
                        <td style="width: 1%; text-wrap: nowrap" class="pr-1"
                            v-html="calculateFoodAmount(e.amount, ingredientFactor, useUserPreferenceStore().userSettings.useFractions)"></td>
                        <td style="width: 1%; text-wrap: nowrap" class="pr-1">
                            <template v-if="e.unit"> {{ ingredientToUnitString(e.ingredient, ingredientFactor) }}</template>
                        </td>
                        <td>
                            <template v-if="e.food"> {{ ingredientToFoodString(e.ingredient, ingredientFactor) }}</template>
                            <!-- Surface why an on-hand row is pre-unchecked: the pantry jar signals it's
                                 already stocked (with expiry tint); a distinct swap icon + the first
                                 available substitute's name signals a substitute covers it instead -
                                 not the same as having the food itself, so it gets its own icon/color
                                 (mirrors IngredientsTable.vue's identical distinction). Both stay
                                 overridable via the row checkbox (D11 P1). -->
                            <pantry-jar-indicator v-if="parseBooleanAnnotation(e.food?.inInventory)" :in-inventory="true"
                                                  :earliest-expiry="e.food?.earliestExpiry" size="x-small" class="ml-1"></pantry-jar-indicator>
                            <v-icon v-else-if="e.food?.substituteOnhand" icon="fa-solid fa-right-left" color="success" size="x-small" class="ml-1"
                                    :aria-label="substituteAvailableLabel(e.food, $t)"></v-icon>
                            <span v-if="!parseBooleanAnnotation(e.food?.inInventory) && e.food?.substituteOnhand" class="text-caption text-medium-emphasis ml-1">
                                ({{ e.food?.availableSubstitutes?.[0]?.name }})
                            </span>
                        </td>
                    </tr>
                    </tbody>
                </v-table>
            </v-expansion-panel-text>
        </v-expansion-panel>
    </v-expansion-panels>
    <v-number-input v-model="servings" class="mt-3" control-variant="split" :label="$t('Servings')" :precision="2" :disabled="loading || liveMode"></v-number-input>
    <v-row v-if="!liveMode" class="mt-1" no-gutters align="center">
        <!-- Meal-plan auto-add preview only: opt into the browser-remembered fast path
             that skips this preview next time (D11 P2a). -->
        <v-checkbox v-if="props.showSkipPreview" class="skip-preview-toggle"
                    v-model="deviceSettings.mealplan_shopping_skipPreview"
                    :label="$t('SkipPreviewNextTime')" density="compact" hide-details></v-checkbox>
        <v-spacer></v-spacer>
        <v-btn prepend-icon="$create" color="create" @click="createShoppingListRecipe()" :disabled="loading">{{ $t('Add_to_Shopping') }}</v-btn>
    </v-row>
</template>

<script setup lang="ts">

import {computed, onMounted, PropType, ref} from "vue";
import {ApiApi, MealPlan, Recipe, RecipeFlat, RecipeOverview, ShoppingList, ShoppingListEntry, type ShoppingListEntryBulkCreate, ShoppingListRecipe} from "@/openapi";
import {ErrorMessageType, PreparedMessage, useMessageStore} from "@/stores/MessageStore";
import {ShoppingDialogRecipe, ShoppingDialogRecipeEntry} from "@/types/Shopping";
import {calculateFoodAmount} from "@/utils/number_utils";
import {useUserPreferenceStore} from "@/stores/UserPreferenceStore";
import {useShoppingStore} from "@/stores/ShoppingStore";
import {ingredientToUnitString, ingredientToFoodString, parseBooleanAnnotation} from "@/utils/model_utils.ts";
import {substituteAvailableLabel} from "@/utils/pantry_utils.ts";
import ModelSelect from "@/components/inputs/ModelSelect.vue";
import PantryJarIndicator from "@/components/display/PantryJarIndicator.vue";

const emit = defineEmits(['created'])

const props = defineProps({
    recipe: {type: Object as PropType<Recipe | RecipeFlat | RecipeOverview>, required: true},
    mealPlan: {type: Object as PropType<MealPlan>, required: false},
    // When opened as the meal-plan auto-add preview, show the "skip preview next time" toggle (D11 P2a).
    showSkipPreview: {type: Boolean, default: false},
    // Called on commit when mealPlan has no id yet - lets the opener persist an unsaved plan
    // (staging/reviewing ingredients never needed one) right before entries link to it.
    onBeforeCommit: {type: Function as PropType<() => Promise<MealPlan | undefined>>, required: false},
    // When given (even an empty array), the component switches to "live" mode: checkboxes reflect
    // real ShoppingListEntry rows (matched by ingredient id) and toggling one immediately
    // creates/deletes it via the API instead of staging a single bulk commit.
    existingEntries: {type: Array as PropType<ShoppingListEntry[]>, required: false, default: undefined},
})

const liveMode = computed(() => props.existingEntries !== undefined)

const existingEntryByIngredient = computed(() => {
    let m = new Map<number, ShoppingListEntry>()
    ;(props.existingEntries ?? []).forEach(e => {
        if (e.ingredient != null) m.set(e.ingredient, e)
    })
    return m
})

const servings = defineModel<number>('servings', {default: 1})

const deviceSettings = useUserPreferenceStore().deviceSettings

const loading = ref(false)
const panel = ref(0)

const selectedShoppingLists = ref([] as ShoppingList[])
const recipe = ref({} as Recipe)
const relatedRecipes = ref([] as Recipe[])

const dialogRecipes = ref([] as ShoppingDialogRecipe[])

const ingredientFactor = computed(() => {
    return servings.value / ((recipe.value.servings != undefined) ? recipe.value.servings : 1)
})

onMounted(() => {
    loadRecipeData()
})

/**
 * load data for the given recipe and all of its related recipes
 */
function loadRecipeData() {
    let api = new ApiApi()
    let promises: Promise<any>[] = []
    loading.value = true

    let recipeRequest = api.apiRecipeRetrieve({id: props.recipe.id!}).then(r => {
        recipe.value = r
        servings.value = r.servings ? r.servings : 1
        panel.value = r.id!
    }).catch(err => {
        useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
    })
    promises.push(recipeRequest)

    api.apiRecipeRelatedList({id: props.recipe.id!}).then(r => {
        r.forEach(rs => {
            let p = api.apiRecipeRetrieve({id: rs.id!}).then(recipe => {
                relatedRecipes.value.push(recipe)
            })
            promises.push(p)
        })

        Promise.allSettled(promises).then(() => {
            loading.value = false

            let allRecipes = [recipe.value].concat(relatedRecipes.value)

            allRecipes.forEach(recipe => {
                let dialogRecipe = {
                    recipe: recipe,
                    entries: [] as ShoppingDialogRecipeEntry[]
                } as ShoppingDialogRecipe

                recipe.steps.forEach(step => {
                    step.ingredients.forEach(ingredient => {
                        if (!ingredient.isHeader) {
                            const existing = liveMode.value ? existingEntryByIngredient.value.get(ingredient.id!) : undefined
                            dialogRecipe.entries.push({
                                amount: ingredient.amount,
                                food: ingredient.food,
                                unit: ingredient.unit,
                                ingredient: ingredient,
                                checked: liveMode.value ? existing != undefined
                                    : (ingredient.food ? !(ingredient.food.ignoreShopping || ingredient.food.foodOnhand || ingredient.food.substituteOnhand) : true),
                                entryId: existing?.id,
                            })
                        }
                    })
                })

                dialogRecipes.value.push(dialogRecipe)
            })
        })
    })
}

/**
 * creates a shopping list recipe from all selected ingredients
 */
async function createShoppingListRecipe() {
    let api = new ApiApi()
    loading.value = true

    let mealPlanId = props.mealPlan?.id
    if (!mealPlanId && props.onBeforeCommit) {
        const savedPlan = await props.onBeforeCommit()
        if (!savedPlan?.id) {
            // save failed (e.g. a required field) - the opener already surfaced the error
            loading.value = false
            return
        }
        mealPlanId = savedPlan.id
    }

    let shoppingListRecipe = {
        recipe: props.recipe.id,
        servings: servings.value,
    } as ShoppingListRecipe

    if (mealPlanId) {
        shoppingListRecipe.mealplan = mealPlanId
    }

    let shoppingListEntries = {
        entries: [],
        shoppingListsIds: selectedShoppingLists.value.map(sl => sl.id!)
    } as ShoppingListEntryBulkCreate

    dialogRecipes.value.forEach(dialogRecipe => {
        dialogRecipe.entries.forEach(entry => {
            if (entry.checked) {
                shoppingListEntries.entries.push({
                    amount: entry.amount * (servings.value / (recipe.value.servings ? recipe.value.servings : 1)),
                    foodId: entry.food ? entry.food.id! : null,
                    unitId: entry.unit ? entry.unit.id! : null,
                    ingredientId: entry.ingredient ? entry.ingredient.id! : null,
                })
            }
        })
    })

    api.apiShoppingListRecipeCreate({shoppingListRecipe: shoppingListRecipe}).then(slr => {
        api.apiShoppingListRecipeBulkCreateEntriesCreate({id: slr.id!, shoppingListEntryBulkCreate: shoppingListEntries}).then(r => {
            useMessageStore().addPreparedMessage(PreparedMessage.CREATE_SUCCESS)
            emit('created')
        }).catch(err => {
            useMessageStore().addError(ErrorMessageType.CREATE_ERROR, err)
        }).finally(() => {
            loading.value = false
        })
    }).catch(err => {
        useMessageStore().addError(ErrorMessageType.CREATE_ERROR, err)
    })
}

/**
 * live mode only: immediately create or delete the real ShoppingListEntry backing this row,
 * instead of staging it for a later bulk commit. Reuses the shopping store's create/delete so
 * the change also gets undo-stack support and stays consistent with the rest of the app.
 */
function toggleEntry(entry: ShoppingDialogRecipeEntry) {
    if (entry.checked) {
        const toDelete = {
            id: entry.entryId,
            amount: entry.amount,
            unit: entry.unit,
            food: entry.food,
            ingredient: entry.ingredient?.id,
        } as ShoppingListEntry
        entry.checked = false
        entry.entryId = undefined
        useShoppingStore().deleteObject(toDelete, true)
    } else {
        const toCreate = {
            amount: entry.amount * ingredientFactor.value,
            unit: entry.unit,
            food: entry.food,
            ingredient: entry.ingredient?.id,
        } as ShoppingListEntry
        if (props.mealPlan?.id) toCreate.mealplanId = props.mealPlan.id
        entry.checked = true
        useShoppingStore().createObject(toCreate, true).then(r => {
            entry.entryId = r?.id
        })
    }
}

</script>
