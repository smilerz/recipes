<template>
    <div>
        <v-row class="pa-2 align-center">
            <!-- on a phone the toggle and the end actions share a row above the date field, where beside it they would squeeze the date;
                 from md up the order is toggle, date range, date field, end actions -->
            <v-col class="py-1 order-0" cols md="auto">
                <slot name="actions"></slot>
            </v-col>
            <v-col class="align-center d-none d-md-flex text-h5 order-md-1">
                {{ DateTime.fromJSDate(props.headerProps?.displayFirstDate).toLocaleString(DateTime.DATE_MED) }} -
                {{ DateTime.fromJSDate(props.headerProps?.displayLastDate).toLocaleString(DateTime.DATE_MED) }}
            </v-col>
            <v-col cols="12" md="4" class="order-2 order-md-2">
                <v-date-input
                    v-model="date"
                    prepend-icon=""
                    variant="outlined"
                    density="compact"
                    hide-details
                >
                    <template #prepend>
                        <v-btn density="compact" icon="fa-solid fa-chevron-left" variant="plain" @click="date = props.headerProps.previousFullPeriod"></v-btn>
                    </template>
                    <template #append-inner>
                        <v-btn density="compact" icon="fa-solid fa-calendar-day" variant="plain" @click.stop="date = new Date()"></v-btn>
                    </template>
                    <template #append>
                        <v-btn density="compact" icon="fa-solid fa-chevron-right" variant="plain" @click="date = props.headerProps.nextFullPeriod"></v-btn>
                    </template>
                </v-date-input>
            </v-col>
            <v-col cols="auto" class="py-1 order-1 order-md-3">
                <slot name="end-actions"></slot>
            </v-col>
        </v-row>
    </div>
</template>

<script setup lang="ts">

import {ref, watch} from "vue";
import {VDateInput} from "vuetify/components";
import {DateTime} from "luxon";

const emit = defineEmits(['input'])

const props = defineProps({
    headerProps: {
        // vue-simple-calendar's package.json exports an "./interfaces" subpath for
        // IHeaderProps, but the file it points to (dist/lib/interfaces.d.ts) isn't actually
        // published in this version - an upstream packaging bug, not fixable here.
        type: Object as () => any,
        required: true,
    },
})

const date = ref(new Date())

watch(() => date.value, (newValue, oldValue) => {
    emit('input', newValue)
})

</script>

<style scoped>

</style>