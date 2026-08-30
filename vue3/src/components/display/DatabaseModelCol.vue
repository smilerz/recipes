<template>
    <v-col cols="12" md="6" lg="4">
        <v-card :prepend-icon="genericModel.model.icon" :title="$t(genericModel.model.localizationKey)" :subtitle="$t(genericModel.model.localizationKeyDescription)"
                :to="disabled ? undefined : {name: 'ModelListPage', params: {model: genericModel.model.name}}"
                :disabled="disabled"
                append-icon="fa-solid fa-arrow-right">
        </v-card>
    </v-col>
</template>

<script setup lang="ts">

import {EditorSupportedModels, GenericModel, getGenericModelFromStringOrDefault} from "@/types/Models.ts";
import {onBeforeMount, PropType, shallowRef, watch} from "vue";
import {useI18n} from "vue-i18n";

const {t} = useI18n()

const props = defineProps({
    model: {
        type: String as PropType<EditorSupportedModels>,
        default: 'food'
    },
    disabled: {
        type: Boolean,
        default: false
    },
})

const genericModel = shallowRef({} as GenericModel)

watch(() => props.model, (newValue, oldValue) => {
    if (newValue != oldValue) {
        genericModel.value = getGenericModelFromStringOrDefault(props.model, t)
    }
})

/**
 * select model class before mount because template renders before onMounted is called
 */
onBeforeMount(() => {
    genericModel.value = getGenericModelFromStringOrDefault(props.model, t)
})

</script>


<style scoped>

</style>