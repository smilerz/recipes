<template>
    <div class="d-flex flex-wrap ga-1">
        <v-chip v-for="c in FREEZER_CATEGORY_PRESETS" :key="c.labelKey" size="small" variant="outlined"
                :prepend-icon="c.icon" @click="emit('select', c.months * SHELF_LIFE_PERIOD_DAYS.month)">
            {{ t(c.labelKey) }}
        </v-chip>
    </div>
</template>

<script setup lang="ts">
import {FREEZER_CATEGORY_PRESETS, SHELF_LIFE_PERIOD_DAYS} from "@/utils/pantry_utils.ts";
import {useI18n} from "vue-i18n";

const {t} = useI18n()
const emit = defineEmits<{select: [days: number]}>()
</script>
