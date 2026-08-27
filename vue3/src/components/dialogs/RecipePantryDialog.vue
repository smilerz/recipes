<template>
    <v-dialog :fullscreen="mobile" v-model="showDialog" max-width="560px" scrollable>
        <v-card>
            <v-closable-card-title :title="title" icon="$pantry" v-model="showDialog"></v-closable-card-title>

            <v-card-text>
                <div v-if="rows.length === 0" class="text-center text-medium-emphasis pa-6">
                    {{ $t('NoIngredients') }}
                </div>
                <v-list v-else density="comfortable">
                    <v-list-item v-for="(row, i) in rows" :key="i" data-test="recipe-pantry-row">
                        <template #prepend>
                            <pantry-jar-indicator v-if="row.inPantry" :in-inventory="true" :earliest-expiry="row.earliestExpiry"></pantry-jar-indicator>
                            <v-icon v-else icon="$shopping" class="text-disabled" size="small"></v-icon>
                        </template>
                        <v-list-item-title>{{ row.food.name }}</v-list-item-title>
                        <v-list-item-subtitle v-if="row.amount > 0">
                            {{ $t('Needs') }}: {{ row.amount }} {{ row.unit?.name || '' }}
                        </v-list-item-subtitle>
                        <template #append>
                            <span v-if="row.inPantry" class="text-success text-body-2">{{ $t('InPantry') }}</span>
                            <v-btn v-else-if="row.added" variant="text" size="small" color="success" prepend-icon="fa-solid fa-check" disabled>
                                {{ $t('Added') }}
                            </v-btn>
                            <v-btn v-else color="create" variant="tonal" size="small" prepend-icon="$shopping"
                                   data-test="add-missing-btn" @click="addMissing(row)">
                                {{ $t('AddToShoppingList') }}
                            </v-btn>
                        </template>
                    </v-list-item>
                </v-list>
            </v-card-text>

            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn variant="text" @click="showDialog = false">{{ $t('Close') }}</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">

import {ref} from "vue";
import {useDisplay} from "vuetify";
import {useI18n} from "vue-i18n";
import type {Recipe, RecipeOverview} from "@/openapi";
import VClosableCardTitle from "@/components/dialogs/VClosableCardTitle.vue";
import PantryJarIndicator from "@/components/display/PantryJarIndicator.vue";
import {recipePantryRows, type RecipePantryRow} from "@/utils/pantry_utils.ts";
import {useShoppingActions} from "@/composables/useShoppingActions.ts";
import {ErrorMessageType, useMessageStore} from "@/stores/MessageStore.ts";

interface Row extends RecipePantryRow<{id?: number | null, name?: string | null}> {
    added: boolean
}

const {t} = useI18n()
const {mobile} = useDisplay()
const {addToShopping} = useShoppingActions()

const showDialog = ref(false)
const title = ref('')
const rows = ref<Row[]>([])

/** Open the have/missing panel for a recipe (FR-I4). Reads inventory status straight off the
 *  recipe payload's nested foods — no extra fetch. */
function open(recipe: Recipe | RecipeOverview) {
    title.value = t('PantryForRecipe', {recipe: recipe.name})
    rows.value = recipePantryRows(recipe as Recipe).map(r => ({...r, added: false}))
    showDialog.value = true
}

async function addMissing(row: Row) {
    if (row.food.id == null) return
    try {
        await addToShopping({id: row.food.id, name: row.food.name ?? ''})
        // Mark every row of this food added — a food used across steps shows as several rows, and
        // one add covers them all; leaving siblings actionable would double-add and contradict.
        for (const r of rows.value) {
            if (r.food.id === row.food.id) r.added = true
        }
    } catch (err) {
        useMessageStore().addError(ErrorMessageType.CREATE_ERROR, err)
    }
}

defineExpose({open})
</script>

<style scoped>

</style>
