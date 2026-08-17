<template>
    <v-dialog max-width="600" v-model="dialog" activator="model">
        <v-card>

            <v-closable-card-title v-model="dialog" :title="$t('Freezer')" :sub-title="$t('FreezerExpiryHelp')"></v-closable-card-title>
            <v-card-text>

                <v-list>
                    <v-list-item v-for="c in FREEZER_CATEGORY_PRESETS"
                                 :key="c.labelKey"
                                 :prepend-icon="c.icon"
                                 :title="t(c.labelKey)"
                                 :subtitle="`${c.months} ${$t('Months')}`"
                                 link
                                 @click="date = DateTime.now().plus({months: c.months}).toJSDate(); dialog = false">
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

import VClosableCardTitle from "@/components/dialogs/VClosableCardTitle.vue";
import {DateTime} from "luxon";
import {useI18n} from "vue-i18n";
import {FREEZER_CATEGORY_PRESETS} from "@/utils/pantry_utils.ts";
const {t} = useI18n()

const dialog = defineModel<boolean>({})

const date = defineModel<Date>('date', {})

</script>

<style scoped>

</style>