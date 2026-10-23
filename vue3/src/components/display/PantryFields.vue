<template>
    <div class="d-flex align-center ga-2" style="min-width: 0">
        <!-- the two pickers share the line (Location gets the larger share: its name is the longer one); Add takes only what it needs and anchors the end -->
        <model-select
            model="Food"
            :model-value="foodId"
            @update:model-value="emit('update:foodId', $event ?? null)"
            :object="false"
            density="compact"
            mode="single"
            :can-clear="true"
            :search-on-load="true"
            hide-details
            style="min-width: 0; flex: 2 1 0"
        />
        <model-select
            model="InventoryLocation"
            v-model="inventoryLocation"
            density="compact"
            hide-details
            style="min-width: 0; flex: 3 1 0"
        />
        <!-- same height as the fields beside it; icon-only on a phone to leave them room -->
        <v-btn v-if="mobile" icon="$pantry" color="create" variant="tonal" height="40" width="40"
               :title="$t('Add')" :aria-label="$t('Add')" data-test="pantry-add" @click="emit('add')"></v-btn>
        <v-btn v-else color="create" variant="tonal" height="40" prepend-icon="$pantry"
               data-test="pantry-add" @click="emit('add')">{{ $t('Add') }}</v-btn>
    </div>
</template>

<script setup lang="ts">

import {useDisplay} from "vuetify";
import ModelSelect from "@/components/inputs/ModelSelect.vue";
import type {InventoryLocation} from "@/openapi";

defineProps<{
    /** the Food filter's food (id), if one is chosen */
    foodId: number | null
}>()

const inventoryLocation = defineModel<InventoryLocation | undefined>('inventoryLocation')

const emit = defineEmits<{
    'update:foodId': [id: number | null]
    add: []
}>()

const {mobile} = useDisplay()

</script>
