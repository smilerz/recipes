<template>
    <v-row>
        <ai-credits-cards :space="store.activeSpace" />
    </v-row>
</template>

<script setup lang="ts">
import {useUserPreferenceStore} from '@/stores/UserPreferenceStore'
import AiCreditsCards from '@/components/display/AiCreditsCards.vue'
const store = useUserPreferenceStore()
</script>
