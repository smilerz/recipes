<template>
    <v-container>
        <model-select model="Food" allow-create></model-select>

        <v-model-select model="Food" create label="Food(Create)"></v-model-select>
        <v-model-select model="Food" create chips multiple label="Food(Create+Tags+Mult)"></v-model-select>
    </v-container>
</template>

<script setup lang="ts">


import VModelSelect from "@/components/inputs/VModelSelect.vue";
import ModelSelect from "@/components/inputs/ModelSelect.vue";
</script>


<style scoped>

</style>