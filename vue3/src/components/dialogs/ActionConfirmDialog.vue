<template>
    <v-dialog v-model="dialog" max-width="450" persistent>
        <v-card :loading="loading">
            <v-closable-card-title :title="title" :icon="icon" v-model="dialog" />

            <v-card-text v-if="message" class="pb-2 text-body-1">{{ message }}</v-card-text>

            <v-list v-if="entries.length > 0" density="compact" class="py-0">
                <v-list-item v-for="(entry, idx) in entries" :key="idx" :prepend-icon="entry.icon">
                    <v-list-item-title>{{ entry.text }}</v-list-item-title>
                    <v-list-item-subtitle v-if="entry.subtext">{{ entry.subtext }}</v-list-item-subtitle>
                </v-list-item>
            </v-list>

            <v-list v-if="details.length > 0" density="compact" class="py-0">
                <v-list-item v-for="d in details" :key="d.label" :prepend-icon="d.icon">
                    <v-list-item-subtitle>{{ d.label }}</v-list-item-subtitle>
                    <v-list-item-title>{{ d.value }}</v-list-item-title>
                </v-list-item>
            </v-list>

            <v-card-actions>
                <v-spacer />
                <v-btn variant="text" @click="cancel">{{ $t('Cancel') }}</v-btn>
                <v-btn
                    :color="confirmColor"
                    :prepend-icon="confirmIcon"
                    variant="flat"
                    @click="confirm"
                >
                    {{ confirmLabel }}
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
import {ref} from 'vue'
import VClosableCardTitle from '@/components/dialogs/VClosableCardTitle.vue'

export type ActionConfirmDetail = {
    label: string,
    value: string,
    icon?: string,
}

export type ActionConfirmEntry = {
    text: string,
    subtext?: string,
    icon?: string,
}

const dialog = ref(false)
const loading = ref(false)
const title = ref('')
const icon = ref('')
const message = ref('')
const details = ref<ActionConfirmDetail[]>([])
const entries = ref<ActionConfirmEntry[]>([])
const confirmLabel = ref('')
const confirmColor = ref('primary')
const confirmIcon = ref('')

let resolvePromise: ((confirmed: boolean) => void) | null = null

function open(opts: {
    title: string,
    icon?: string,
    message?: string,
    details?: ActionConfirmDetail[],
    entries?: ActionConfirmEntry[],
    loading?: boolean,
    confirmLabel: string,
    confirmColor?: string,
    confirmIcon?: string,
}): Promise<boolean> {
    title.value = opts.title
    icon.value = opts.icon ?? ''
    message.value = opts.message ?? ''
    details.value = opts.details ?? []
    entries.value = opts.entries ?? []
    loading.value = opts.loading ?? false
    confirmLabel.value = opts.confirmLabel
    confirmColor.value = opts.confirmColor ?? 'primary'
    confirmIcon.value = opts.confirmIcon ?? ''
    dialog.value = true

    return new Promise((resolve) => {
        resolvePromise = resolve
    })
}

function setEntries(newEntries: ActionConfirmEntry[]) {
    entries.value = newEntries
    loading.value = false
}

function confirm() {
    dialog.value = false
    resolvePromise?.(true)
    resolvePromise = null
}

function cancel() {
    dialog.value = false
    resolvePromise?.(false)
    resolvePromise = null
}

defineExpose({open, setEntries})
</script>
