<template>
    <v-btn variant="text" class="text-none flex-shrink-0" :size="size" :append-icon="direction">
        {{ label }}
        <v-menu activator="parent" close-on-content-click>
            <v-list density="compact">
                <v-list-item
                    v-for="opt in options"
                    :key="opt.key"
                    :active="field === opt.key"
                    color="primary"
                    @click="emit('select', opt.key)"
                >
                    <template #append v-if="field === opt.key">
                        <v-icon size="small" :icon="direction" />
                    </template>
                    {{ $t(opt.labelKey) }}
                </v-list-item>
            </v-list>
        </v-menu>
    </v-btn>
</template>

<script setup lang="ts">
import {computed} from 'vue'

/**
 * The one sort control: a button showing what is sorted (and which way) that opens the list of fields.
 * Presentational — the page owns the sort state and reacts to `select`, so every list (model lists,
 * their phone layout, the pantry) shows the same icons and menu instead of each keeping its own copy.
 */
const props = defineProps<{
    options: ReadonlyArray<{key: string, labelKey: string}>
    /** key of the field currently sorted by, if any */
    field?: string | null
    descending: boolean
    /** text on the button */
    label: string
    size?: string
}>()

const emit = defineEmits<{
    select: [key: string]
}>()

const direction = computed(() => props.descending ? 'fa-solid fa-arrow-down-short-wide' : 'fa-solid fa-arrow-up-short-wide')
</script>
