<template>
    <v-dialog max-width="400px" v-model="dialog">
        <v-card :loading="loading">
            <v-closable-card-title :title="$t('Add_to_Plan')" v-model="dialog"></v-closable-card-title>
            <v-card-text>
                <p>{{ $t('BatchAddToMealPlanSummary', {count: props.items.length}) }}</p>
                <v-date-input v-model="date" :label="$t('Date')" prepend-icon="" prepend-inner-icon="$calendar" hide-details></v-date-input>
                <model-select model="MealType" :label="$t('Meal_Type')" allow-create v-model="mealType"></model-select>
            </v-card-text>
            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn variant="text" @click="dialog = false">{{ $t('Cancel') }}</v-btn>
                <v-btn color="create" prepend-icon="$create" :loading="loading" :disabled="!date || !mealType" @click="addToMealPlan()">
                    {{ $t('Add') }}
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
import {PropType, ref, watch} from 'vue'
import {VDateInput} from 'vuetify/components'
import {ApiApi, MealPlan, MealType, RecipeOverview} from '@/openapi'
import {ErrorMessageType, PreparedMessage, useMessageStore} from '@/stores/MessageStore'
import VClosableCardTitle from '@/components/dialogs/VClosableCardTitle.vue'
import ModelSelect from '@/components/inputs/ModelSelect.vue'

const props = defineProps({
    items: {type: Array as PropType<Array<RecipeOverview>>, required: true},
})

const emit = defineEmits(['change'])

const dialog = defineModel<boolean>({default: false})
const loading = ref(false)
const date = ref<Date | null>(null)
const mealType = ref<MealType | null>(null)

/** reset so re-opening the dialog on a new selection doesn't carry a stale date/meal type */
watch(dialog, (newValue, oldValue) => {
    if (!oldValue && newValue) {
        date.value = null
        mealType.value = null
    }
})

/** applies the chosen meal type's configured time-of-day to the chosen date, matching
 *  MealPlanEditor's own date+mealType time-sync behavior - defaults to noon if the meal
 *  type has no configured time. */
function buildDateTime(): Date {
    const dt = new Date(date.value!)
    if (mealType.value?.time) {
        const [hours, minutes] = mealType.value.time.substring(0, 5).split(':').map(Number)
        dt.setHours(hours, minutes, 0, 0)
    } else {
        dt.setHours(12, 0, 0, 0)
    }
    return dt
}

function addToMealPlan() {
    const api = new ApiApi()
    loading.value = true
    const fromDate = buildDateTime()

    Promise.all(props.items.map(recipe => api.apiMealPlanCreate({
        mealPlan: {
            recipe: recipe,
            mealType: mealType.value as MealType,
            fromDate: fromDate,
            toDate: fromDate,
            servings: recipe.servings ?? 1,
        } as unknown as MealPlan,
    }))).then(() => {
        useMessageStore().addPreparedMessage(PreparedMessage.CREATE_SUCCESS)
        dialog.value = false
        emit('change')
    }).catch(err => {
        useMessageStore().addError(ErrorMessageType.CREATE_ERROR, err)
    }).finally(() => {
        loading.value = false
    })
}
</script>
