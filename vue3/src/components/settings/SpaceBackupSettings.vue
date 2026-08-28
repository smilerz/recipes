<template>
    <p class="text-h6">{{ $t('Backup') }}</p>
    <v-divider></v-divider>
    <p class="text-body-2 mt-2">{{ $t('SpaceBackupHelp') }}</p>

    <v-btn class="mt-2 mb-4" color="save" @click="createBackup()" :loading="creating" data-test="create-backup-btn">
        {{ $t('CreateBackup') }}
    </v-btn>

    <v-table density="compact" v-if="backups.length > 0">
        <thead>
        <tr>
            <th>{{ $t('Created') }}</th>
            <th>{{ $t('Status') }}</th>
            <th>{{ $t('Size') }}</th>
            <th></th>
        </tr>
        </thead>
        <tbody>
        <tr v-for="backup in backups" :key="backup.id" data-test="backup-row">
            <td>{{ backup.createdAt ? new Date(backup.createdAt).toLocaleString() : '' }}</td>
            <td>
                <v-progress-circular v-if="backup.running" indeterminate size="20" width="2" data-test="backup-running"></v-progress-circular>
                <span v-else>{{ $t('Done') }}</span>
            </td>
            <td>{{ backup.fileSizeKb ?? 0 }} KB</td>
            <td class="text-right">
                <v-btn v-if="!backup.running && backup.file" :href="backup.file" target="_blank" icon variant="text" size="small" data-test="backup-download">
                    <v-icon icon="fa-solid fa-download"></v-icon>
                </v-btn>
                <v-btn v-if="!backup.running && backup.file" variant="text" size="small" @click="openRestore(backup)" data-test="backup-restore-btn">
                    {{ $t('Restore') }}
                </v-btn>
            </td>
        </tr>
        </tbody>
    </v-table>

    <v-card v-if="restorePreview" class="mt-4" variant="outlined" color="warning" data-test="restore-review-panel">
        <v-card-title>{{ $t('ReviewBeforeRestore') }}</v-card-title>
        <v-card-text>
            <template v-if="!restoreResult">
                <v-table density="compact">
                    <tbody>
                    <tr v-for="(count, name) in restorePreview.model_counts" :key="name">
                        <td>{{ name }}</td>
                        <td>{{ count }}</td>
                    </tr>
                    </tbody>
                </v-table>

                <template v-if="restorePreview.users.length > 0">
                    <p class="text-subtitle-2 mt-4">{{ $t('UserReLink') }}</p>
                    <v-table density="compact">
                        <tbody>
                        <tr v-for="u in restorePreview.users" :key="u.username">
                            <td>{{ u.username }}</td>
                            <td>{{ u.email }}</td>
                            <td>
                                <v-icon v-if="u.resolved" icon="fa-solid fa-check" color="success"></v-icon>
                                <span v-else class="text-warning">{{ $t('Unresolved') }}</span>
                            </td>
                        </tr>
                        </tbody>
                    </v-table>
                </template>

                <v-checkbox :label="$t('RestoreAckLabel')" v-model="acknowledged" class="mt-2" hide-details data-test="restore-ack-checkbox"></v-checkbox>

                <v-btn color="delete" class="mt-4 mr-2" :disabled="!acknowledged" :loading="restoring" @click="confirmRestore()" data-test="restore-confirm-btn">
                    {{ $t('Restore') }}
                </v-btn>
                <v-btn variant="text" class="mt-4" @click="cancelRestore()">{{ $t('Cancel') }}</v-btn>
            </template>

            <template v-else>
                <p data-test="restore-result">{{ $t('RestoreComplete', {name: restoreResult.space_name}) }}</p>
                <p v-if="restoreResult.report.unresolved_users.length > 0" class="text-warning">
                    {{ $t('RestoreUnresolvedUsers', {users: restoreResult.report.unresolved_users.join(', ')}) }}
                </p>
                <v-btn variant="text" class="mt-2" @click="cancelRestore()">{{ $t('Close') }}</v-btn>
            </template>
        </v-card-text>
    </v-card>
</template>

<script setup lang="ts">

import {onMounted, onUnmounted, ref} from "vue"
import {ApiApi, SpaceBackup} from "@/openapi"
import {ErrorMessageType, useMessageStore} from "@/stores/MessageStore.ts"

interface RestorePreview {
    model_counts: Record<string, number>
    users: {username: string, email: string, resolved: boolean}[]
}

interface RestoreResult {
    space_id: number
    space_name: string
    report: {models: Record<string, {created: number, skipped: number}>, unresolved_users: string[]}
}

const messageStore = useMessageStore()

const backups = ref<SpaceBackup[]>([])
const creating = ref(false)
let pollTimer: ReturnType<typeof setTimeout> | null = null

const restoreTarget = ref<SpaceBackup | null>(null)
const restorePreview = ref<RestorePreview | null>(null)
const restoreResult = ref<RestoreResult | null>(null)
const acknowledged = ref(false)
const restoring = ref(false)

function loadBackups() {
    const api = new ApiApi()
    api.apiSpaceBackupList({}).then(r => {
        backups.value = (r as any).results ?? r
        if (pollTimer) {
            clearTimeout(pollTimer)
            pollTimer = null
        }
        if (backups.value.some(b => b.running)) {
            pollTimer = setTimeout(loadBackups, 3000)
        }
    }).catch(err => {
        messageStore.addError(ErrorMessageType.FETCH_ERROR, err)
    })
}

function createBackup() {
    const api = new ApiApi()
    creating.value = true
    api.apiSpaceBackupCreate({}).then(() => {
        loadBackups()
    }).catch(err => {
        messageStore.addError(ErrorMessageType.CREATE_ERROR, err)
    }).finally(() => {
        creating.value = false
    })
}

function openRestore(backup: SpaceBackup) {
    restoreTarget.value = backup
    restorePreview.value = null
    restoreResult.value = null
    acknowledged.value = false
    const api = new ApiApi()
    api.apiSpaceBackupRestorePreviewCreate({id: backup.id!}).then(r => {
        restorePreview.value = r as unknown as RestorePreview
    }).catch(err => {
        messageStore.addError(ErrorMessageType.FETCH_ERROR, err)
    })
}

function cancelRestore() {
    restoreTarget.value = null
    restorePreview.value = null
    restoreResult.value = null
    acknowledged.value = false
}

function confirmRestore() {
    if (!restoreTarget.value) {
        return
    }
    const api = new ApiApi()
    restoring.value = true
    api.apiSpaceBackupRestoreCreate({id: restoreTarget.value.id!}).then(r => {
        restoreResult.value = r as unknown as RestoreResult
    }).catch(err => {
        messageStore.addError(ErrorMessageType.CREATE_ERROR, err)
    }).finally(() => {
        restoring.value = false
    })
}

onMounted(() => {
    loadBackups()
})
onUnmounted(() => {
    if (pollTimer) {
        clearTimeout(pollTimer)
    }
})

</script>


<style scoped>

</style>
