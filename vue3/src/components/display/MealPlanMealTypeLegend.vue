<template>
    <!-- the meal types and their colours, drawn like the strip on an entry, so a colour in the meal plan can be read -->
    <div>
        <div v-for="mealType in mealTypes" :key="mealType.id" class="d-flex align-center py-1" data-test="legend-item">
            <span class="legend-bar" :class="{'legend-bar-none': !mealType.color}" data-test="legend-bar"
                  :data-colored="mealType.color ? 'true' : 'false'" :style="mealType.color ? {backgroundColor: mealType.color} : undefined"></span>
            <span class="ms-3">{{ mealType.name }}</span>
        </div>
    </div>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from "vue";
import {ApiApi, MealType} from "@/openapi";
import {ErrorMessageType, useMessageStore} from "@/stores/MessageStore";

const loaded = ref<MealType[]>([])

const mealTypes = computed(() => [...loaded.value].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))

onMounted(() => {
    new ApiApi().apiMealTypeList({pageSize: 100}).then(r => {
        loaded.value = r.results
    }).catch(err => {
        useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
    })
})
</script>

<style scoped>
.legend-bar {
    flex: 0 0 3px;
    height: 20px;
}

.legend-bar-none {
    background: rgba(var(--v-theme-on-surface), 0.3);
}
</style>
