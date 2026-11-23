<template>
    <!-- opens from the element it sits in (activator="parent"): the supermarket button in the shopping list's top bar -->
    <v-menu activator="parent">
        <v-list density="compact">
            <v-list-item :active="selectedId == null" @click="emit('select', null)">
                {{ $t('SelectNone') }}
            </v-list-item>
            <v-list-item v-for="s in supermarkets" :key="s.id" :active="s.id === selectedId" @click="emit('select', s.id!)">
                {{ s.name }}
            </v-list-item>
            <v-divider></v-divider>
            <v-list-item prepend-icon="$create" :to="{name: 'ModelEditPage', params: {model: 'Supermarket'}}">
                {{ $t('Create') }}
            </v-list-item>
        </v-list>
    </v-menu>
</template>

<script setup lang="ts">
import {PropType} from "vue";
import {Supermarket} from "@/openapi";

defineProps({
    supermarkets: {type: Array as PropType<Supermarket[]>, required: true},
    selectedId: {type: Number as PropType<number | null | undefined>, default: null},
})

const emit = defineEmits<{
    select: [id: number | null]
}>()
</script>
