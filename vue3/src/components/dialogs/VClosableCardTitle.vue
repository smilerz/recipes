<template>
    <v-card-title class="pb-1 pt-1 pl-1 pr-1">
        <div class="d-flex align-center">
            <!-- flex-grow + min-width:0 lets the title use all space up to the close button's
                 actual width, instead of a fixed 10/2-column split that reserved far more room
                 for the button than it needs and truncated the title prematurely -->
            <div class="flex-grow-1 text-truncate pl-2" style="min-width: 0;">
                <slot name="content">
                    <i :class="props.icon" v-if="props.icon != ''"></i>
                    {{ props.title }}
                    <v-card-subtitle class="pa-0" v-if="props.subTitle != ''">{{ props.subTitle }}</v-card-subtitle>
                </slot>
            </div>
            <v-btn class="flex-shrink-0" icon="$close" variant="plain" @click="model = false; emit('close')" v-if="!props.hideClose"></v-btn>
        </div>
    </v-card-title>
</template>

<script setup lang="ts">
/**
 * Component used to render a VCardTitle with a "close" button that can either close the model bound dialog given via v-model or
 * emit a close event a parent dialog can listen to
 *
 * Should be used for all dialogs that have a "close" function (which likely all dialogs should have)
 */
const emit = defineEmits(['close'])

const props = defineProps({
    title: {type: String, default: ''},
    icon: {type: String, default: ''},
    subTitle: {type: String, default: ''},
    hideClose: {type: Boolean, default: false},
})

const model = defineModel<Boolean>()

</script>

<style scoped>

</style>