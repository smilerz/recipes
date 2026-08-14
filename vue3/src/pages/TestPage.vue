<template>
    <v-container>
        <model-select model="Food" :object="false" allow-create></model-select>

        <v-model-select model="Food" create label="Food(Create)"></v-model-select>
        <v-model-select model="Food" create chips multiple label="Food(Create+Tags+Mult)"></v-model-select>
        <v-model-select model="Recipe" clearable label="Recipe"></v-model-select>

        <v-model-select model="Food" v-model="value" label="Food (id)" :return-object="false"></v-model-select>
    </v-container>
</template>

<script setup lang="ts">


import VModelSelect from "@/components/inputs/VModelSelect.vue";
import ModelSelect from "@/components/inputs/ModelSelect.vue";

let value = 15977

</script>


<style scoped>

</style>