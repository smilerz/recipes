<template>
    {{ DateTime.fromJSDate(date).toLocaleString(DateTime.DATE_FULL) }}
</template>

<script setup lang="ts">
import {DateTime} from "luxon";

const date = defineModel<Date>({required: true})
</script>

<style scoped>

</style>