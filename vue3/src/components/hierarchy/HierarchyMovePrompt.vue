<template>
    <div class="pa-4">
        <p class="mb-4" data-testid="move-prompt-text">
            {{ $t(alreadyThere ? 'hierarchy_already_under' : 'hierarchy_move_under', {item: movingName, target: targetName}) }}
        </p>

        <v-btn
            color="save"
            block
            prepend-icon="fa-solid fa-arrow-right"
            :disabled="operating || alreadyThere"
            data-testid="move-here-btn"
            @click="$emit('move')"
        >
            {{ $t('Move') }}
        </v-btn>

        <v-btn
            color="warning"
            variant="outlined"
            block
            class="mt-2"
            prepend-icon="fa-solid fa-link-slash"
            :disabled="operating || !movingParent"
            data-testid="make-root-btn"
            @click="$emit('makeRoot')"
        >
            {{ $t('RemoveParent') }}
        </v-btn>

        <v-btn
            variant="text"
            block
            class="mt-2"
            :disabled="operating"
            data-testid="manage-instead-btn"
            @click="$emit('manage')"
        >
            {{ $t('hierarchy_manage_instead', {target: targetName}) }}
        </v-btn>
    </div>
</template>

<script setup lang="ts">
import {computed} from "vue"
import type {EditorSupportedTypes} from "@/types/Models"

const props = defineProps<{
    movingItem: EditorSupportedTypes
    targetItem: EditorSupportedTypes
    operating: boolean
}>()

defineEmits<{
    move: []
    makeRoot: []
    manage: []
}>()

const movingName = computed(() => (props.movingItem as any).name)
const targetName = computed(() => (props.targetItem as any).name)
const movingParent = computed(() => (props.movingItem as any).parent ?? null)
const alreadyThere = computed(() => movingParent.value === props.targetItem.id)
</script>
