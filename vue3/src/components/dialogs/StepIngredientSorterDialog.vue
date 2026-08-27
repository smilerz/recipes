<template>
    <v-dialog
        v-model="dialog"
        :max-width="(mobile) ? '100vw': '25vw'"
        :fullscreen="mobile">
        <v-card>
            <v-closable-card-title :title="$t('Move')" v-model="dialog"
                                   :sub-title="ingredientToString(step.ingredients[editingIngredientIndex] as Ingredient)"></v-closable-card-title>
            <v-card-text>
                <template v-if="step.ingredients.length > 1">
                    {{$t('Order')}}
                    <v-btn block :disabled="editingIngredientIndex== 0" @click="moveIngredient(editingIngredientIndex, props.stepIndex, 0)">{{ $t('First') }}</v-btn>
                    <v-btn block :disabled="editingIngredientIndex == 0" class="mt-1" @click="moveIngredient(editingIngredientIndex, props.stepIndex, editingIngredientIndex - 1)">
                        {{
                            $t('Up')
                        }}
                    </v-btn>
                    <v-btn block :disabled="editingIngredientIndex + 1 == step.ingredients.length" class="mt-1"
                           @click="moveIngredient(editingIngredientIndex, props.stepIndex, editingIngredientIndex + 1)"> {{ $t('Down') }}
                    </v-btn>
                    <v-btn block :disabled="editingIngredientIndex + 1 == step.ingredients.length" class="mt-1"
                           @click="moveIngredient(editingIngredientIndex, props.stepIndex, step.ingredients.length - 1)">{{ $t('Last') }}
                    </v-btn>
                </template>

                {{ $t('MoveToStep') }}
                <v-btn block v-for="(s,i) in recipe.steps" :disabled="i == props.stepIndex" class="mt-1"
                       @click="moveIngredient(editingIngredientIndex, i, recipe.steps[i].ingredients.length)">{{ i + 1 }} <span v-if="'name' in s">{{ s.name }}</span>
                </v-btn>
            </v-card-text>
            <v-card-actions>
                <v-btn @click="dialog = false">{{ $t('Close') }}</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">

import {Ingredient, Recipe, SourceImportRecipe, SourceImportStep, Step} from "@/openapi";
import {ingredientToString} from "@/utils/model_utils.ts";
import VClosableCardTitle from "@/components/dialogs/VClosableCardTitle.vue";
import {ref, watch} from "vue";
import {useDisplay} from "vuetify/framework";

const dialog = defineModel<boolean>({required: true, default: false})
const step = defineModel<Step | SourceImportStep>('step', {required: true})
const recipe = defineModel<Recipe | SourceImportRecipe>('recipe', {required: true})
const props = defineProps({
    stepIndex: {type: Number, required: true},
    ingredientIndex: {type: Number, required: true},
})

const {mobile} = useDisplay()

watch(() => props.ingredientIndex, () => {
    editingIngredientIndex.value = props.ingredientIndex
})

const editingIngredientIndex = ref(0)

/**
 * move the ingredient at the given index of this step to the step and index at that step given in the target
 * @param sourceIngredientIndex index of the ingredient to move
 * @param targetStepIndex index of the step to place ingredient into
 * @param targetIngredientIndex place in the target steps ingredient list to insert into
 */
function moveIngredient(sourceIngredientIndex: number, targetStepIndex: number, targetIngredientIndex: number,) {
    // step/recipe are typed as unions of the real editor shape (Step/Recipe) and the import-preview
    // shape (SourceImportStep/SourceImportRecipe) - both carry an `ingredients` array with the same
    // amount/food/unit/note/order shape at runtime, but TS won't splice across the two unions.
    const sourceIngredients = step.value.ingredients as any[]
    let ingredient = sourceIngredients[sourceIngredientIndex]
    sourceIngredients.splice(sourceIngredientIndex, 1)
    const targetIngredients = (recipe.value.steps[targetStepIndex] as any).ingredients as any[]
    targetIngredients.splice(targetIngredientIndex, 0, ingredient)

    targetIngredients.forEach((ingredient, index) => {
        ingredient.order = index
    })

    // close dialog if moved to a new step, update index if its in the same step
    if (targetStepIndex != props.stepIndex) {
        dialog.value = false
    } else {
        editingIngredientIndex.value = targetIngredientIndex
    }
}

</script>


<style scoped>

</style>