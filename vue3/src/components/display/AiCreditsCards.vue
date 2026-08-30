<template>
    <v-col cols="12" md="6">
        <v-card :to="{name: 'ModelListPage', params: {model: 'AiLog'}}">
            <v-card-title><i class="fa-solid fa-hand-holding-dollar"></i> {{ $t('MonthlyCredits') }}</v-card-title>
            <v-card-text>{{ $n(space.aiMonthlyCreditsUsed) }} / {{ $n(space.aiCreditsMonthly ?? 0) }} {{ $t('Credits') }}
            </v-card-text>
            <v-progress-linear :model-value="space.aiMonthlyCreditsUsed" :max="space.aiCreditsMonthly" height="10"
            ></v-progress-linear>
        </v-card>
    </v-col>

    <v-col cols="12" md="6">
        <v-card :to="{name: 'ModelListPage', params: {model: 'AiLog'}}">
            <v-card-title><i class="fa-solid fa-hand-holding-dollar"></i> {{ $t('AiCreditsBalance') }}</v-card-title>
            <v-card-text>{{ $n(space.aiCreditsBalance ?? 0) }} {{ $t('Credits') }}
            </v-card-text>
            <v-progress-linear height="10"
            ></v-progress-linear>
        </v-card>
    </v-col>
</template>

<script setup lang="ts">
import {PropType} from "vue";
import {Space} from "@/openapi";

defineProps({
    space: {type: {} as PropType<Space>, required: true},
})
</script>
