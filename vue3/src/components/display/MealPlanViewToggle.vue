<template>
    <!-- switches the meal plan between the day list and the calendar; both options are shown, the current one highlighted -->
    <v-btn-toggle :model-value="showingList ? 'list' : 'calendar'" mandatory divided density="compact" variant="outlined" color="primary"
                  @update:model-value="(view: string) => emit('select', view as 'list' | 'calendar')">
        <v-btn value="list" size="small" class="text-none" data-test="mealplan-view-list">{{ $t('List') }}</v-btn>
        <v-btn value="calendar" size="small" class="text-none" data-test="mealplan-view-calendar">{{ $t('Calendar') }}</v-btn>
    </v-btn-toggle>
</template>

<script setup lang="ts">
defineProps({
    showingList: {type: Boolean, required: true},
})

const emit = defineEmits<{
    select: [view: 'list' | 'calendar']
}>()
</script>
