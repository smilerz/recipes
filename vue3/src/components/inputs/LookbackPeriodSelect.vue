<template>
    <div class="d-flex align-center flex-wrap ga-2">
        <span class="text-body-2 text-medium-emphasis">{{ $t('LookBackDays') }}</span>
        <v-btn-toggle :model-value="modelValue" @update:model-value="choose" mandatory divided variant="outlined" color="primary" density="comfortable" :aria-label="$t('LookBackDays')">
            <v-btn v-for="days in options" :key="days" :value="days">{{ days }}</v-btn>
        </v-btn-toggle>
    </div>
</template>

<script setup lang="ts">
defineProps<{ modelValue: number, options: number[] }>()
const emit = defineEmits<{ 'update:modelValue': [days: number] }>()

function choose(days: number | null) {
    if (days != null) emit('update:modelValue', days)
}
</script>
