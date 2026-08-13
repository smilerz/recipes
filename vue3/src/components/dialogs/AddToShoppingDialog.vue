<template>
    <v-dialog max-width="600px" v-model="dialog">
        <v-card>
            <v-closable-card-title :title="$t('Add_Servings_to_Shopping', {servings: servings})" v-model="dialog"></v-closable-card-title>
            <v-card-text>
                <recipe-shopping-preview :recipe="props.recipe" :meal-plan="props.mealPlan" :show-skip-preview="props.showSkipPreview"
                                          :on-before-commit="props.onBeforeCommit" v-model:servings="servings"
                                          @created="dialog = false; emit('created')"></recipe-shopping-preview>
            </v-card-text>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">

import {PropType, ref} from "vue";
import VClosableCardTitle from "@/components/dialogs/VClosableCardTitle.vue";
import {MealPlan, Recipe, RecipeFlat, RecipeOverview} from "@/openapi";
import RecipeShoppingPreview from "@/components/display/RecipeShoppingPreview.vue";

const emit = defineEmits(['created'])

const props = defineProps({
    recipe: {type: Object as PropType<Recipe | RecipeFlat | RecipeOverview>, required: true},
    mealPlan: {type: Object as PropType<MealPlan>, required: false},
    // When opened as the meal-plan auto-add preview, show the "skip preview next time" toggle (D11 P2a).
    showSkipPreview: {type: Boolean, default: false},
    // Called on commit when mealPlan has no id yet - lets the opener persist an unsaved plan
    // (staging/reviewing ingredients never needed one) right before entries link to it.
    onBeforeCommit: {type: Function as PropType<() => Promise<MealPlan | undefined>>, required: false},
})

// v-model controlled by the opener (e.g. RecipeContextMenu's "Add to Shopping" item). Previously a
// private ref + activator="parent", which the menu could not drive — clicking it was a no-op (D10).
const dialog = defineModel<boolean>({default: false})
const servings = ref(1)

</script>

<style scoped>

</style>
