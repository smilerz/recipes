<template>
    <v-card :loading="loading">
        <!-- Reuse RecipeCard as the settings-driven display (image + overlays + title +
             keywords, all honouring the card_* device settings — D08). The book supplies
             its own navigation and has no context menu, so the built-in whole-card link
             and menu are switched off; the "Open" button below is the sole nav. -->
        <recipe-card
            :recipe="props.recipeOverview"
            :disable-link="true"
            :show-menu="false"
            height="25vh"
        ></recipe-card>
        <v-card-subtitle>{{ props.recipeOverview.description }}</v-card-subtitle>
        <ingredients-table :ingredient-factor="1" v-model="ingredients" :show-checkbox="false"></ingredients-table>
        <v-card-actions>
            <v-btn :to="{name: 'RecipeViewPage', params: {id: props.recipeOverview.id}}">{{$t('Open')}}</v-btn>
        </v-card-actions>
    </v-card>
</template>

<script setup lang="ts">

import RecipeCard from "@/components/display/RecipeCard.vue";
import {ApiApi, Ingredient, Recipe, RecipeOverview} from "@/openapi";
import {onMounted, PropType, ref} from "vue";
import {ErrorMessageType, useMessageStore} from "@/stores/MessageStore";
import IngredientsTable from "@/components/display/IngredientsTable.vue";
import {getRecipeIngredients} from "@/utils/model_utils";
import {useI18n} from "vue-i18n";

const props = defineProps({
    recipeOverview: {type: {} as PropType<RecipeOverview>, required: true}
})

const {t} = useI18n()

const loading = ref(false)
const recipe = ref({} as Recipe)
const ingredients = ref([] as Ingredient[])

onMounted(() => {
    loadRecipe()
})

function loadRecipe() {
    let api = new ApiApi()

    loading.value = true

    api.apiRecipeRetrieve({id: props.recipeOverview.id!}).then(r => {
        recipe.value = r
        ingredients.value = getRecipeIngredients(recipe.value, t,{showStepHeaders: true})
    }).catch(err => {
        useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
    }).finally(() => {
        loading.value = false
    })
}

</script>


<style scoped>

</style>