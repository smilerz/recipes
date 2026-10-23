<template>
    <th :aria-sort="ariaSort" class="sortable-header-cell">
        <button type="button" class="sortable-header" @click="emit('sort')">
            {{ label }}
            <v-icon v-if="active" :icon="descending ? SORT_ICON_DESC : SORT_ICON_ASC" size="x-small" class="ms-1"></v-icon>
        </button>
    </th>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {SORT_ICON_ASC, SORT_ICON_DESC} from '@/utils/sort'

/**
 * A column title that sorts its column when clicked: shows the direction arrow while it is the sorted
 * column. Presentational — the table owns the sort state and reacts to `sort`.
 */
const props = defineProps<{
    label: string
    active: boolean
    descending: boolean
}>()

const emit = defineEmits<{
    sort: []
}>()

const ariaSort = computed(() => props.active ? (props.descending ? 'descending' : 'ascending') : 'none')
</script>

<style scoped>
/* a plain title that happens to be a button: no browser button chrome */
.sortable-header {
    background: none;
    border: 0;
    padding: 0;
    margin: 0;
    font: inherit;
    color: inherit;
    cursor: pointer;
    white-space: nowrap;
}

.sortable-header:hover {
    text-decoration: underline;
}
</style>
