<template>
    <v-btn
        v-if="!disableCreate"
        icon
        :size="compact ? 'small' : undefined"
        :class="{'float-right': !compact}"
        color="create"
        @click="openDialog"
    >
        <v-icon icon="fa-solid fa-plus" />
        <model-edit-dialog
            v-model="dialogOpen"
            :persistent="justOpened"
            :close-after-create="false"
            :model="model"
            @create="emit('change')"
            @save="emit('change')"
            @delete="emit('change')"
        />
    </v-btn>
</template>

<script setup lang="ts">
import {onBeforeUnmount, ref} from 'vue'
import type {EditorSupportedModels} from '@/types/Models'
import ModelEditDialog from '@/components/dialogs/ModelEditDialog.vue'

withDefaults(defineProps<{
    model: EditorSupportedModels
    disableCreate?: boolean
    compact?: boolean
}>(), {
    disableCreate: false,
    compact: false,
})

const emit = defineEmits<{ change: [] }>()

// v-dialog's own activator="parent" default toggles open state on every click, so a
// real double-click on this button opened the dialog on click 1 and immediately
// closed it again on click 2 - net no-op, zero visible feedback (feat-list-shopping-
// list-tc22). Controlling the open state explicitly means repeat clicks just set it
// true again instead of toggling.
const dialogOpen = ref(false)

// The scrim renders over the button's own position within ~30ms of opening, so the
// second click of a real double-click lands on the scrim, not the button - triggering
// v-dialog's own click-outside-to-close. Force persistent for a brief window after
// opening so that stray click doesn't close it; a genuine click-outside after the
// window still closes normally.
const justOpened = ref(false)
let justOpenedTimer: ReturnType<typeof setTimeout> | undefined

function openDialog() {
    dialogOpen.value = true
    justOpened.value = true
    clearTimeout(justOpenedTimer)
    justOpenedTimer = setTimeout(() => { justOpened.value = false }, 500)
}

onBeforeUnmount(() => clearTimeout(justOpenedTimer))
</script>
