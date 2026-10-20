<template>
    <v-dialog max-width="500" v-model="dialog">
        <v-card>
            <v-closable-card-title v-model="dialog" :title="mode === 'location' ? $t('Move') : $t('Expires')" :sub-title="`${$t('Selected')} ${count}`"></v-closable-card-title>

            <v-card-text>
                <model-select v-if="mode === 'location'" model="InventoryLocation" v-model="location" hide-details></model-select>
                <v-date-input v-else :label="$t('Expires')" v-model="date" hide-details></v-date-input>
            </v-card-text>

            <v-card-actions>
                <v-btn v-if="mode === 'expires'" color="delete" data-test="batch-clear" @click="emit('confirm', null)">{{ $t('Clear') }}</v-btn>
                <v-spacer></v-spacer>
                <v-btn @click="dialog = false">{{ $t('Cancel') }}</v-btn>
                <v-btn color="save" variant="elevated" data-test="batch-confirm" :disabled="mode === 'location' ? !location : !date"
                       @click="emit('confirm', (mode === 'location' ? location : date) ?? null)">{{ $t('Save') }}</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">

import {ref, watch} from "vue";
import {VDateInput} from "vuetify/components";
import ModelSelect from "@/components/inputs/ModelSelect.vue";
import VClosableCardTitle from "@/components/dialogs/VClosableCardTitle.vue";
import type {InventoryLocation} from "@/openapi";

const dialog = defineModel<boolean>({default: false})

defineProps<{
    mode: 'location' | 'expires',
    count: number,
}>()

const emit = defineEmits<{
    confirm: [value: InventoryLocation | Date | null]
}>()

const location = ref<InventoryLocation | undefined>(undefined)
const date = ref<Date | undefined>(undefined)

// a fresh pick every time it opens — never carry the last batch's value into the next
watch(dialog, open => {
    if (open) {
        location.value = undefined
        date.value = undefined
    }
})

</script>
