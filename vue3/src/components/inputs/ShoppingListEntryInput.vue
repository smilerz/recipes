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
        @focus="onFocus"
    ></v-autocomplete>
</template>

<script setup lang="ts">


import {nextTick, onBeforeUnmount, PropType, ref} from "vue";
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

let picked = false
let searchTimer: ReturnType<typeof setTimeout> | undefined

function onPick(food: Food | null) {
    if (!food) return
    picked = true
    setTimeout(() => picked = false)
    clearTimeout(searchTimer)
    searchText.value = ''
    addIngredient(1, null, food)
}

/** Enter on typed text sends it to the parser, unless that same Enter just picked a highlighted food. */
function onEnter() {
    const text = searchText.value.trim()
    nextTick(() => {
        if (picked || text === '') return
        searchText.value = ''
        ingredientInput.value = text
        parseIngredient()
    })
}

function onSearch(query: string | null) {
    if (picked) return // Vuetify echoes the picked name into the search box right after a selection
    searchText.value = query ?? ''
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => searchFoods(searchText.value), 300)
}

function onFocus() {
    if (foodOptions.value.length === 0) searchFoods('')
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
