<template>
    <div class="d-flex flex-wrap ga-1">
        <v-chip v-for="days in EXPIRY_PRESET_DAYS" :key="days" size="small" variant="outlined" @click="emit('select', days)">
            {{ formatShelfLifeDuration(days, t) }}
        </v-chip>
    </div>
</template>

<script setup lang="ts">
import {EXPIRY_PRESET_DAYS, formatShelfLifeDuration} from "@/utils/pantry_utils.ts";
import {useI18n} from "vue-i18n";

const {t} = useI18n()
const emit = defineEmits<{select: [days: number]}>()
</script>
