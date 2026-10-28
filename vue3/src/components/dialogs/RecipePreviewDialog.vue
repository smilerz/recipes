<template>
    <v-dialog max-width="600px" scrollable v-model="dialog">
        <v-card>
            <v-closable-card-title :title="$t('Preview')" v-model="dialog"></v-closable-card-title>
            <v-card-text class="pa-0">
                <book-entry-card variant="flat" :recipe-overview="props.recipe as RecipeOverview"></book-entry-card>
            </v-card-text>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
import {PropType, computed} from "vue";
import {Recipe, RecipeOverview} from "@/openapi";
import VClosableCardTitle from "@/components/dialogs/VClosableCardTitle.vue";
import BookEntryCard from "@/components/display/BookEntryCard.vue";

const props = defineProps({
    recipe: {type: Object as PropType<Recipe | RecipeOverview>, required: true},
    modelValue: {type: Boolean, default: false},
})

const emit = defineEmits(['update:modelValue'])

const dialog = computed({
    get: () => props.modelValue,
    set: (val: boolean) => emit('update:modelValue', val),
})
</script>
