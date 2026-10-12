<template>
    <v-text-field :label="$t('Shopping_input_placeholder')" density="compact" @keyup.enter="parseIngredient()" v-model="ingredientInput" :loading="props.loading" hide-detail
                  v-if="!useUserPreferenceStore().deviceSettings.shopping_input_autocomplete" s>
        <template #append>
            <v-btn
                density="comfortable"
                @click="parseIngredient()"
                :icon="ingredientInputIcon"
                color="create"
            ></v-btn>
        </template>
    </v-text-field>

    <!-- picking a food adds an entry for it; typed text goes to the ingredient parser when Enter is pressed -->
    <v-autocomplete
        v-if="useUserPreferenceStore().deviceSettings.shopping_input_autocomplete"
        :label="$t('Shopping_input_placeholder')"
        :model-value="null"
        :search="searchText"
        :items="foodOptions"
        item-title="name"
        item-value="id"
        return-object
        no-filter
        hide-no-data
        hide-details
        density="compact"
        :loading="loading || props.loading"
        @update:model-value="onPick"
        @update:search="onSearch"
        @keydown.enter="onEnter"
        @focus="loadDefaultFoods"
        @click="loadDefaultFoods"
    >
        <!-- Vuetify writes a picked item's title into the search box, unless a selection slot is present -->
        <template #selection></template>
    </v-autocomplete>
</template>

<script setup lang="ts">


import {onBeforeUnmount, PropType, ref} from "vue";
import {SEARCH_DEBOUNCE_MS} from "@/utils/utils";
import {ApiApi, Food, FoodSimple,  ShoppingListEntry, ShoppingListRecipe, Unit} from "@/openapi";
import {useShoppingStore} from "@/stores/ShoppingStore";
import {ErrorMessageType, useMessageStore} from "@/stores/MessageStore";
import {useUserPreferenceStore} from "@/stores/UserPreferenceStore";

const props = defineProps({
    shoppingListRecipe: {type: {} as PropType<ShoppingListRecipe>, required: false},
    mealPlanId: {type: Number, required: false},
    loading: {type: Boolean, required: false},
})

const ingredientInput = ref('')
const ingredientInputIcon = ref('fa-solid fa-plus')

const searchText = ref('')
const foodOptions = ref<Food[]>([])

const loading = ref(false)

/**
 * add new ingredient from ingredient text input
 */
function addIngredient(amount: number, unit: Unit | null, food: Food|FoodSimple | null) {
    let sle = {
        amount: Math.max(amount, 1),
        unit: unit,
        food: food,
        shoppingLists: useShoppingStore().shoppingLists.filter(sl => useUserPreferenceStore().deviceSettings.shopping_selected_shopping_lists.includes(sl.id!))
    } as ShoppingListEntry

    if (props.mealPlanId) {
        sle.mealplanId = props.mealPlanId
    }

    useShoppingStore().createObject(sle, true).finally(() => {
        loading.value = false
    })
    ingredientInput.value = ''

    ingredientInputIcon.value = 'fa-solid fa-check'
    setTimeout(() => {
        ingredientInputIcon.value = 'fa-solid fa-plus'
    }, 1000)
}

function parseIngredient() {
    const api = new ApiApi()
    loading.value = true

    api.apiIngredientParserPostCreate({ingredientParserRequest: {ingredient: ingredientInput.value}}).then(r => {
        if (r.ingredient) {
            addIngredient(r.ingredient.amount, r.ingredient.unit, r.ingredient.food)
        }
    }).catch(err => {
        useMessageStore().addError(ErrorMessageType.CREATE_ERROR, err)
        loading.value = false
    })
}

// ----------- AUTOCOMPLETE INPUT -------------

let searchTimer: ReturnType<typeof setTimeout> | undefined

function onPick(food: Food | null) {
    if (!food) return
    clearTimeout(searchTimer)
    searchText.value = ''
    addIngredient(1, null, food)
}

/** Enter in the field always means "parse what is typed": the field never picks a suggestion on Enter itself. */
function onEnter() {
    const text = searchText.value.trim()
    if (text === '') return
    clearTimeout(searchTimer)
    latestSearch++
    searchText.value = ''
    foodOptions.value = []
    ingredientInput.value = text
    parseIngredient()
}

function onSearch(query: string | null) {
    if ((query ?? '') === searchText.value) return
    searchText.value = query ?? ''
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => searchFoods(searchText.value), SEARCH_DEBOUNCE_MS)
}

let defaultFoodsLoad: Promise<void> | null = null

/** An empty field opens with the unfiltered list; a click covers a field that is already focused and so fires no focus. */
function loadDefaultFoods() {
    if (foodOptions.value.length !== 0 || defaultFoodsLoad) return
    defaultFoodsLoad = searchFoods('').finally(() => defaultFoodsLoad = null)
}

onBeforeUnmount(() => clearTimeout(searchTimer))

let latestSearch = 0

/**
 * performs the API request to search for the selected input
 * @param query input to search for on the API
 */
function searchFoods(query: string) {
    const request = ++latestSearch
    loading.value = true
    return new ApiApi().apiFoodList({query: query, page: 1, pageSize: 25}).then(r => {
        if (request === latestSearch) foodOptions.value = r.results
    }).catch((err: any) => {
        useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
    }).finally(() => {
        if (request === latestSearch) loading.value = false
    })
}

</script>
