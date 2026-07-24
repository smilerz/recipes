<template>
    <v-dialog :fullscreen="mobile" v-model="showDialog" max-width="640px" scrollable>
        <v-card>
            <v-closable-card-title :title="title" icon="$pantry" v-model="showDialog"></v-closable-card-title>

            <v-card-text>
                <div v-if="loading" class="text-center pa-6">
                    <v-progress-circular indeterminate color="primary"></v-progress-circular>
                </div>
                <div v-else-if="rows.length === 0" class="text-center text-medium-emphasis pa-6">
                    {{ scoped ? $t('NoRecipePantryItems') : $t('NoPantryEntries') }}
                </div>
                <template v-else>
                    <closable-help-alert :title="$t('UseUp')" :text="$t('UseUpHelp')"></closable-help-alert>

                    <template v-for="section in sections" :key="section.key">
                        <div v-if="section.header" class="text-overline text-medium-emphasis mt-1 mb-1">{{ section.header }}</div>
                        <v-btn v-if="section.expandable" variant="text" size="small" prepend-icon="fa-solid fa-boxes-stacked"
                               class="mb-2" @click="showAll = true">
                            {{ $t('ShowWholePantry', {count: section.expandable}) }}
                        </v-btn>
                        <v-card v-for="row in section.rows" :key="`${row.food.id}-${row.unit?.id ?? 'none'}`" border class="mb-2" data-test="useup-row">
                            <v-card-text class="useup-grid">
                                <div class="overflow-hidden">
                                    <div class="font-weight-medium text-truncate">{{ row.food.name }}</div>
                                    <div class="text-caption text-medium-emphasis">
                                        {{ $t('InStock') }}: {{ row.original }} {{ row.unit?.name || '' }}
                                        <span v-if="rowChanged(row)" class="text-warning">
                                            → {{ row.amount }} {{ (row.newUnit ?? row.unit)?.name || '' }}<template v-if="row.amount === 0"> · {{ $t('OutToList') }}</template>
                                        </span>
                                    </div>
                                </div>
                                <!-- re-declared rows are a new measurement in a new unit — the old
                                     unit's count is not a meaningful bound (1 gallon -> 16 cups) -->
                                <v-number-input v-model="row.amount" :precision="2" :min="0" :max="row.newUnit ? undefined : row.original"
                                                control-variant="stacked" hide-details density="compact"></v-number-input>
                                <model-select :label="$t('Unit')" :placeholder="row.unit?.name || undefined" v-model="row.newUnit"
                                              model="Unit" hide-details density="compact" append-to-body inline></model-select>
                                <v-btn icon="fa-solid fa-minus" variant="text" size="small" data-test="consumed-btn"
                                       :color="row.amount === 0 && row.original !== 0 ? 'warning' : undefined"
                                       :title="$t('Consumed')" :aria-label="$t('Consumed')"
                                       @click="toggleConsumed(row)"></v-btn>
                            </v-card-text>
                        </v-card>
                    </template>
                </template>
            </v-card-text>

            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn variant="text" @click="showDialog = false">{{ $t('Cancel') }}</v-btn>
                <v-btn color="save" variant="flat" :loading="saving" :disabled="changedCount === 0" @click="confirm">
                    {{ $t('Save') }} ({{ changedCount }})
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">

import {computed, ref} from "vue";
import {useDisplay} from "vuetify";
import {useI18n} from "vue-i18n";
import {ApiApi, Food, Unit} from "@/openapi";
import VClosableCardTitle from "@/components/dialogs/VClosableCardTitle.vue";
import ModelSelect from "@/components/inputs/ModelSelect.vue";
import ClosableHelpAlert from "@/components/display/ClosableHelpAlert.vue";
import {
    distinctRecentRecipes,
    groupInventoryByFoodUnit,
    groupUseUpRowsByRecipe,
    recipeFoodIds,
    useUpItemsFromRows,
} from "@/utils/pantry_utils.ts";
import {useShoppingActions} from "@/composables/useShoppingActions.ts";
import {ErrorMessageType, MessageType, useMessageStore} from "@/stores/MessageStore.ts";

interface Row {
    food: Food
    unit: Unit | null
    newUnit: Unit | null
    amount: number
    original: number
    recipe?: string  // the recently-cooked recipe this row is grouped under
}

/** How many recent recipes to seed the "Recently cooked" section from (DEC-7). */
const RECENT_RECIPE_LIMIT = 5

const {t} = useI18n()
const {mobile} = useDisplay()
const {addToShopping} = useShoppingActions()
const emit = defineEmits(['used'])

const showDialog = ref(false)
const loading = ref(false)
const saving = ref(false)
const rows = ref<Row[]>([])
const title = ref('')
const showAll = ref(false)
const scoped = ref(false)  // recipe-scoped open — changes the empty-state message

function rowChanged(row: Row): boolean {
    return row.amount !== row.original || row.newUnit != null
}

const changedCount = computed(() => rows.value.filter(rowChanged).length)

// recipe names (most-recent first) that seeded groups this open; drives the section order
const recipeOrder = ref<string[]>([])

/**
 * Ordered render sections: one section per recently-cooked recipe (its on-hand ingredients under the
 * recipe name), then the rest of the pantry — shown inline when there are no recents (the graceful
 * floor), or behind a "Show whole pantry" expander when recents exist.
 */
const sections = computed(() => {
    const out: Array<{key: string, header: string, rows: Row[], expandable: number}> = []
    for (const recipe of recipeOrder.value) {
        const groupRows = rows.value.filter(r => r.recipe === recipe)
        if (groupRows.length) out.push({key: `recipe:${recipe}`, header: recipe, rows: groupRows, expandable: 0})
    }
    const other = rows.value.filter(r => !r.recipe)
    if (other.length) {
        if (!recipeOrder.value.length) {
            out.push({key: 'all', header: '', rows: other, expandable: 0})
        } else {
            out.push({
                key: 'rest',
                header: '',
                rows: showAll.value ? other : [],
                expandable: showAll.value ? 0 : other.length,
            })
        }
    }
    return out
})

/** One-tap "all gone" (M4): zero the row; tapping again restores the untouched amount. */
function toggleConsumed(row: Row) {
    row.amount = row.amount === 0 && row.original !== 0 ? row.original : 0
}

/**
 * Open the dialog. With `opts.foodIds` (recipe view, FR-I5) rows are scoped to that recipe's
 * on-hand foods. Otherwise (pantry page) the recently-cooked foods are seeded first from the
 * CookLog and labelled with the recipe that used them (DEC-7/G4), with the rest of the pantry
 * behind an expander. One row per (food, unit) — never summing across units (DEC-2).
 */
async function open(opts?: {foodIds?: number[], title?: string}) {
    showDialog.value = true
    loading.value = true
    rows.value = []
    showAll.value = false
    scoped.value = opts?.foodIds != null
    title.value = opts?.title ?? t('UseUp')
    const api = new ApiApi()
    try {
        const inventory = await api.apiInventoryEntryList({pageSize: 500})
        let grouped = groupInventoryByFoodUnit<Food, Unit>(inventory.results ?? [])

        if (opts?.foodIds) {
            const wanted = new Set(opts.foodIds)
            rows.value = grouped.filter(g => g.food.id != null && wanted.has(g.food.id)).map(g => ({...g, newUnit: null}))
            return
        }

        const orderedRecipes = await recentRecipes(api)
        const {groups, other} = groupUseUpRowsByRecipe(grouped, orderedRecipes)
        recipeOrder.value = groups.map(g => g.recipe)
        rows.value = [
            ...groups.flatMap(g => g.rows.map(gr => ({...gr, newUnit: null, recipe: g.recipe}))),
            ...other.map(gr => ({...gr, newUnit: null, recipe: undefined})),
        ]
    } catch (err) {
        useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
    } finally {
        loading.value = false
    }
}

/** Recently-cooked recipes (most-recent first) with their food ids, from the CookLog (best-effort). */
async function recentRecipes(api: ApiApi): Promise<Array<{name: string, foodIds: number[]}>> {
    try {
        const cooks = await api.apiCookLogList({ordering: '-created_at', pageSize: 25})
        const recipes = distinctRecentRecipes(cooks.results ?? [], RECENT_RECIPE_LIMIT)
        return await Promise.all(recipes.map(async r => {
            try {
                const full = await api.apiRecipeRetrieve({id: r.id})
                return {name: r.name, foodIds: recipeFoodIds(full)}
            } catch {
                return {name: r.name, foodIds: []}
            }
        }))
    } catch (err) {
        // Recents is an enhancement — degrade to the plain whole-pantry list, but leave a trace so
        // a persistently-broken CookLog fetch is debuggable rather than silently invisible.
        console.warn('Use-up: could not load recent cooks; showing the whole pantry.', err)
        return []
    }
}

async function confirm() {
    saving.value = true
    const items = useUpItemsFromRows(rows.value)
    try {
        await new ApiApi().apiInventoryEntryDrawDownCreate({drawDown: {items}})
        // DEC-8: a food goes back on the list only when ALL its rows ended at zero, once — zeroing
        // the gallon row while cups remain must not re-list the food. Add-back failures must NOT
        // look like a failed save: the draw-down is already committed, and a retry would
        // double-decrement — so they get their own catch and a targeted warning instead.
        const byFood = new Map<number, Row[]>()
        for (const row of rows.value) {
            const id = row.food.id!
            if (!byFood.has(id)) byFood.set(id, [])
            byFood.get(id)!.push(row)
        }
        const addBackFailures: string[] = []
        for (const [id, foodRows] of byFood) {
            if (foodRows.some(r => r.amount !== r.original) && foodRows.every(r => r.amount === 0)) {
                try {
                    await addToShopping({id, name: foodRows[0].food.name})
                } catch {
                    addBackFailures.push(foodRows[0].food.name)
                }
            }
        }
        useMessageStore().addMessage(MessageType.SUCCESS, t('UsedUpN', {count: items.length}), 3000)
        if (addBackFailures.length) {
            useMessageStore().addMessage(MessageType.WARNING, t('CouldNotAddToShopping', {foods: addBackFailures.join(', ')}), 6000)
        }
        emit('used')
        showDialog.value = false
    } catch (err) {
        useMessageStore().addError(ErrorMessageType.UPDATE_ERROR, err)
    } finally {
        saving.value = false
    }
}

defineExpose({open})
</script>

<style scoped>
/* D4: fixed columns so steppers, unit pickers, and consumed buttons form clean vertical lines. */
.useup-grid {
    display: grid;
    grid-template-columns: 1fr 130px 140px 40px;
    gap: 12px;
    align-items: center;
}

@media (max-width: 600px) {
    /* name gets the full first line; stepper | unit | consumed share the second */
    .useup-grid {
        grid-template-columns: 1fr 1fr 36px;
        gap: 8px;
    }

    .useup-grid > :first-child {
        grid-column: 1 / -1;
    }
}
</style>
