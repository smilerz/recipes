<template>
    <v-dialog max-width="600" v-model="dialog" activator="model">
        <v-card>

            <v-closable-card-title v-model="dialog" :title="title ?? $t('Freezer')" :sub-title="subtitle ?? $t('FreezerExpiryHelp')"></v-closable-card-title>
            <v-card-text>

                <v-list>
                    <v-list-item v-for="p in effectivePresets"
                                 :key="p.label"
                                 :prepend-icon="p.icon"
                                 :title="p.label"
                                 :subtitle="p.subtitle"
                                 link
                                 @click="selectPreset(p.days)">
                    </v-list-item>

                    <v-list-item
                                 prepend-icon="$close"
                                 :title="$t('Close')"

                                 link
                                 @click="dialog = false">
                    </v-list-item>
                </v-list>

            </v-card-text>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">

import {computed} from "vue";
import VClosableCardTitle from "@/components/dialogs/VClosableCardTitle.vue";
import {DateTime} from "luxon";
import {useI18n} from "vue-i18n";
import {FREEZER_CATEGORY_PRESETS, SHELF_LIFE_PERIOD_DAYS} from "@/utils/pantry_utils.ts";
const {t} = useI18n()

interface Preset {
    label: string
    subtitle?: string
    icon?: string
    days: number
}

const props = defineProps<{
    presets?: Preset[]
    title?: string
    subtitle?: string
}>()

const emit = defineEmits<{select: [days: number]}>()

const dialog = defineModel<boolean>({})

// Only meaningful to callers that bind v-model:date (freezer-expiry-on-a-lot use cases); a caller
// that only listens for `select` (FoodEditor's shelf-life rows) simply never reads this model.
const date = defineModel<Date>('date', {})

// Freezer-category presets remain the default so every existing v-model:date caller (booking
// dialogs picking a lot's freezer expiry) needs no template changes at all.
const effectivePresets = computed<Preset[]>(() => props.presets ?? FREEZER_CATEGORY_PRESETS.map(c => ({
    label: t(c.labelKey),
    subtitle: `${c.months} ${t('Months')}`,
    icon: c.icon,
    days: c.months * SHELF_LIFE_PERIOD_DAYS.month,
})))

function selectPreset(days: number) {
    date.value = DateTime.now().plus({days}).toJSDate()
    emit('select', days)
    dialog.value = false
}

</script>

<style scoped>

</style>