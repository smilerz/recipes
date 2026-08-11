<template>
    <v-chip label :color="obj">{{ obj }}</v-chip>
</template>

<script setup lang="ts">

const obj = defineModel<String>({required: true})
</script>

<style scoped>

</style>