<template>
    <v-btn variant="text" class="text-none flex-shrink-0" :size="size" :icon="iconOnly" :append-icon="iconOnly ? undefined : direction"
           :aria-label="iconOnly ? label : undefined" :title="iconOnly ? label : undefined">
        <!-- a v-btn with any default slot ignores its icon props, so the icon-only arrow goes in the slot -->
        <v-icon v-if="iconOnly" :icon="direction" size="small" />
        <template v-else>{{ label }}</template>
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
import {SORT_ICON_ASC, SORT_ICON_DESC} from '@/utils/sort'

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
    /** text on the button (the accessible name when `iconOnly`) */
    label: string
    size?: string
    /** show just the arrow, for tight toolbars */
    iconOnly?: boolean
}>()

const emit = defineEmits<{
    select: [key: string]
}>()

const direction = computed(() => props.descending ? SORT_ICON_DESC : SORT_ICON_ASC)
</script>
