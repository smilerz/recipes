<template>
    <v-icon v-if="jar.present" icon="$pantry" :color="jar.color" :size="size" :aria-label="ariaLabel" role="img"></v-icon>
</template>

<script setup lang="ts">

import {computed} from "vue";
import {useI18n} from "vue-i18n";
import {pantryJarState} from "@/utils/pantry_utils.ts";

const props = withDefaults(defineProps<{
    inInventory?: boolean
    earliestExpiry?: Date | string | null
    size?: string
}>(), {size: 'x-small'})

const {t} = useI18n()

const jar = computed(() => pantryJarState(
    !!props.inInventory,
    props.earliestExpiry ? new Date(props.earliestExpiry) : null,
))

const ariaLabel = computed(() => {
    switch (jar.value.state) {
        case 'expired':
            return t('JarExpired')
        case 'expiring':
            return t('JarExpiringSoon')
        default:
            return t('OnHand')
    }
})
</script>
