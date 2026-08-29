<template>
    <v-dialog max-width="400px" v-model="dialog">
        <v-card :loading="loading">
            <v-closable-card-title :title="$t('Export')" v-model="dialog"></v-closable-card-title>
            <v-card-text>
                <p>{{ $t('BatchExportSummary', {count: props.items.length}) }}</p>
                <p v-if="exportLog.id && !exportLog.running">
                    {{ $t('ExportedRecipesCount', {count: exportLog.exportedRecipes ?? 0}) }}
                </p>
            </v-card-text>
            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn variant="text" @click="dialog = false">{{ $t('Cancel') }}</v-btn>
                <v-btn
                    v-if="!exportLog.id || exportLog.running"
                    color="create" prepend-icon="$create"
                    :loading="loading" :disabled="props.items.length < 1"
                    @click="doExport()"
                >
                    {{ $t('Export') }}
                </v-btn>
                <v-btn
                    v-else
                    color="create"
                    data-test="batch-export-download"
                    :href="useDjangoUrls().getDjangoUrl(`export-file/${exportLog.id}`)"
                >
                    {{ $t('Download') }}
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
import {PropType, ref, watch} from 'vue'
import {ApiApi, ExportLog, RecipeOverview, RecipeSimple} from '@/openapi'
import {useDjangoUrls} from '@/composables/useDjangoUrls'
import {ErrorMessageType, useMessageStore} from '@/stores/MessageStore'
import VClosableCardTitle from '@/components/dialogs/VClosableCardTitle.vue'

const props = defineProps({
    items: {type: Array as PropType<Array<RecipeOverview>>, required: true},
})

const dialog = defineModel<boolean>({default: false})
const loading = ref(false)
const exportLog = ref({} as ExportLog)

/** reset so re-opening the dialog on a new selection starts a fresh export, not a stale one */
watch(dialog, (newValue, oldValue) => {
    if (!oldValue && newValue) {
        exportLog.value = {} as ExportLog
    }
})

function doExport() {
    const api = new ApiApi()
    loading.value = true

    api.apiExportCreate({
        exportRequest: {all: false, type: 'LDJSON', recipes: props.items as unknown as RecipeSimple[], customFilter: null},
    }).then(r => {
        exportLog.value = r
        pollExportLog()
    }).catch(err => {
        loading.value = false
        useMessageStore().addError(ErrorMessageType.CREATE_ERROR, err)
    })
}

function pollExportLog() {
    const api = new ApiApi()
    api.apiExportLogRetrieve({id: exportLog.value.id!}).then(r => {
        exportLog.value = r
        if (exportLog.value.running) {
            setTimeout(() => pollExportLog(), 1000)
        } else {
            loading.value = false
        }
    })
}
</script>
