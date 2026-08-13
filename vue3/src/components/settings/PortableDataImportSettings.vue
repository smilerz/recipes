<template>
    <p class="text-h6">{{ $t('PortableDataImport') }}</p>
    <v-divider></v-divider>

    <v-stepper v-model="stepper" class="mt-2" flat>
        <v-stepper-header>
            <v-stepper-item :title="$t('Upload')" value="upload"></v-stepper-item>
            <v-divider></v-divider>
            <v-stepper-item :title="$t('Confirm')" value="confirm"></v-stepper-item>
        </v-stepper-header>

        <v-stepper-window>
            <v-stepper-window-item value="upload">
                <v-file-input
                    :label="$t('PortableDataImportFile')"
                    accept="application/json"
                    :model-value="file ? [file] : []"
                    @update:model-value="handleFileChange"
                    :loading="analyzing"
                    :error-messages="fileError ? [fileError] : []"
                    data-test="portable-import-file"
                ></v-file-input>

                <template v-if="analysis">
                    <v-select :items="mergePolicyOptions" :label="$t('MergePolicy')" v-model="mergePolicy" @update:model-value="reanalyze" data-test="portable-import-merge-policy"></v-select>

                    <v-table density="compact" class="mt-2">
                        <thead>
                        <tr>
                            <th></th>
                            <th>{{ $t('New') }}</th>
                            <th>{{ $t('Matching') }}</th>
                            <th>{{ $t('PossibleMatch') }}</th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr v-for="cat in CATEGORIES" :key="cat" :data-test="`portable-import-summary-${cat}`">
                            <td>{{ $t(categoryLabel(cat)) }}</td>
                            <td>{{ analysis[cat].new.length }}</td>
                            <td>{{ analysis[cat].matching.length }}</td>
                            <td>{{ analysis[cat].possible_match.length }}</td>
                        </tr>
                        </tbody>
                    </v-table>

                    <v-alert v-if="analysis.warnings.length" type="warning" variant="tonal" class="mt-2" data-test="portable-import-warnings">
                        <div v-for="(w, i) in analysis.warnings" :key="i">{{ w }}</div>
                    </v-alert>

                    <v-btn color="save" class="mt-4" @click="stepper = 'confirm'" data-test="portable-import-continue">{{ $t('Continue') }}</v-btn>
                </template>
            </v-stepper-window-item>

            <v-stepper-window-item value="confirm">
                <p>{{ $t('PortableDataImportConfirmHint') }}</p>

                <v-btn variant="text" @click="stepper = 'upload'" class="mr-2">{{ $t('Back') }}</v-btn>
                <v-btn color="save" :loading="importing" @click="doImport()" data-test="portable-import-commit">{{ $t('Confirm') }}</v-btn>

                <template v-if="report">
                    <v-divider class="mt-4 mb-4"></v-divider>
                    <div data-test="portable-import-report">
                        <p v-for="cat in (['foods', 'keywords'] as const)" :key="cat">
                            {{ $t(categoryLabel(cat)) }}: {{ $t('Created') }} {{ report[cat].created }}, {{ $t('Merged') }} {{ report[cat].merged }}
                        </p>
                        <p>{{ $t('Books') }}: {{ $t('Created') }} {{ report.books.created }}, {{ $t('Merged') }} {{ report.books.merged }}</p>
                    </div>

                    <v-alert v-if="report.warnings.length" type="warning" variant="tonal" class="mt-2" data-test="portable-import-report-warnings">
                        <div v-for="(w, i) in report.warnings" :key="i">{{ w }}</div>
                    </v-alert>
                </template>
            </v-stepper-window-item>
        </v-stepper-window>
    </v-stepper>
</template>

<script setup lang="ts">

import {ref} from "vue"
import {ApiApi} from "@/openapi"
import {ErrorMessageType, useMessageStore} from "@/stores/MessageStore.ts"
import {useI18n} from "vue-i18n"

interface ClassifyResult {
    new: string[]
    matching: string[]
    possible_match: string[]
}

interface AnalyzeReport {
    foods: ClassifyResult
    keywords: ClassifyResult
    books: ClassifyResult
    warnings: string[]
}

interface ImportResult {
    created: number
    merged: number
    errors?: string[]
}

interface ApplyReport {
    foods: ImportResult
    keywords: ImportResult
    books: {created: number, merged: number}
    warnings: string[]
}

const CATEGORIES = ['foods', 'keywords', 'books'] as const

const {t} = useI18n()
const messageStore = useMessageStore()

const stepper = ref('upload')
const file = ref<File | null>(null)
const envelope = ref<object | null>(null)
const fileError = ref<string | null>(null)
const analyzing = ref(false)
const importing = ref(false)
const mergePolicy = ref<'fill_gaps' | 'skip' | 'overwrite'>('fill_gaps')
const analysis = ref<AnalyzeReport | null>(null)
const report = ref<ApplyReport | null>(null)

const mergePolicyOptions = [
    {title: t('FillGaps'), value: 'fill_gaps'},
    {title: t('Skip'), value: 'skip'},
    {title: t('Overwrite'), value: 'overwrite'},
]

function categoryLabel(cat: typeof CATEGORIES[number]) {
    return cat === 'foods' ? 'Foods' : cat === 'keywords' ? 'Keywords' : 'Books'
}

function handleFileChange(value: File[] | File | null) {
    const picked = Array.isArray(value) ? value[0] : value
    file.value = picked ?? null
    fileError.value = null
    analysis.value = null
    report.value = null
    envelope.value = null
    stepper.value = 'upload'

    if (!picked) {
        return
    }

    picked.text().then(text => {
        try {
            envelope.value = JSON.parse(text)
        } catch {
            fileError.value = t('PortableDataImportInvalidFile')
            return
        }
        runAnalyze()
    }).catch(() => {
        fileError.value = t('PortableDataImportInvalidFile')
    })
}

function runAnalyze() {
    if (!envelope.value) {
        return
    }
    const api = new ApiApi()
    analyzing.value = true

    api.apiImportPortableDataCreate({
        portableDataImportRequest: {mode: 'analyze', _export: envelope.value, mergePolicy: mergePolicy.value},
    }).then(r => {
        analysis.value = r as unknown as AnalyzeReport
    }).catch(err => {
        fileError.value = t('PortableDataImportInvalidFile')
        messageStore.addError(ErrorMessageType.FETCH_ERROR, err)
    }).finally(() => {
        analyzing.value = false
    })
}

function reanalyze() {
    runAnalyze()
}

function doImport() {
    if (!envelope.value) {
        return
    }
    const api = new ApiApi()
    importing.value = true

    api.apiImportPortableDataCreate({
        portableDataImportRequest: {mode: 'apply', _export: envelope.value, mergePolicy: mergePolicy.value},
    }).then(r => {
        report.value = r as unknown as ApplyReport
    }).catch(err => {
        messageStore.addError(ErrorMessageType.CREATE_ERROR, err)
    }).finally(() => {
        importing.value = false
    })
}

</script>


<style scoped>

</style>
