<template>
    <p class="text-h6">{{ $t('Export') }}</p>
    <v-divider></v-divider>

    <v-btn-toggle v-model="scope" mandatory color="primary" class="mt-2 mb-4" density="comfortable" data-test="export-scope-toggle">
        <v-btn value="recipes" data-test="export-scope-recipes">{{ $t('Recipes') }}</v-btn>
        <v-btn value="portable" data-test="export-scope-portable">{{ $t('FoodKeywordsBooks') }}</v-btn>
    </v-btn-toggle>

    <v-form v-if="scope === 'recipes'">
        <v-select :items="exportFormats" :label="$t('Type')" v-model="exportType"></v-select>

        <v-checkbox :label="$t('AllRecipes')" v-model="allRecipes" :disabled="selectedRecipes.length > 0 || selectedFilter != null"></v-checkbox>
        <ModelSelect model="Recipe" :label="$t('Recipe')" mode="tags" v-model="selectedRecipes" :disabled="allRecipes || selectedFilter != null"></ModelSelect>
        <ModelSelect model="CustomFilter" :label="$t('SavedSearch')" mode="single" v-model="selectedFilter" :disabled="selectedRecipes.length > 0 || allRecipes"></ModelSelect>

        <v-btn @click="doExport()" :loading="loading" :disabled="selectedRecipes.length == 0 && selectedFilter == null && !allRecipes">{{ $t('Export') }}</v-btn>

        <template v-if="exportLog.id">
            <v-divider class="mt-4 mb-4"></v-divider>
            <h4>{{ $t('Export') }} #{{ exportLog.id }}</h4>
            <p>
                {{ $t('Recipes') }}: {{ exportLog.exportedRecipes }}
            </p>

            <v-btn color="success" :href="useDjangoUrls().getDjangoUrl(`export-file/${exportLog.id!}`)" class="mt-2" :disabled="exportLog.running">{{ $t('Download') }}</v-btn>

            <v-textarea :label="$t('Messages')" auto-grow readonly max-rows="20" v-model="exportLog.msg" class="mt-2"></v-textarea>

        </template>
    </v-form>

    <v-form v-else>
        <v-checkbox :label="$t('Foods')" v-model="includeFoods" data-test="portable-export-foods" hide-details></v-checkbox>
        <v-checkbox :label="$t('Keywords')" v-model="includeKeywords" data-test="portable-export-keywords" hide-details></v-checkbox>
        <v-checkbox :label="$t('Books')" v-model="includeBooks" data-test="portable-export-books" hide-details></v-checkbox>

        <v-btn class="mt-4" @click="doPortableExport()" :loading="portableLoading" :disabled="!includeFoods && !includeKeywords && !includeBooks" data-test="portable-export-btn">{{ $t('Export') }}</v-btn>

        <p v-if="portableSummary" class="mt-4" data-test="portable-export-summary">
            {{ $t('PortableDataExportSummary', {foods: portableSummary.foods, keywords: portableSummary.keywords, books: portableSummary.books}) }}
        </p>
    </v-form>
</template>

<script setup lang="ts">

import {computed, ref} from "vue";
import {INTEGRATIONS} from "@/utils/integration_utils.ts";
import ModelSelect from "@/components/inputs/ModelSelect.vue";
import {ApiApi, CustomFilter, ExportLog, Recipe} from "@/openapi";
import {useDjangoUrls} from "@/composables/useDjangoUrls.ts";
import {ErrorMessageType, useMessageStore} from "@/stores/MessageStore.ts";

const exportType = ref('DEFAULT')
const allRecipes = ref(false)
const selectedRecipes = ref([] as Recipe[])
const selectedFilter = ref<null|CustomFilter>(null)

const exportLog = ref({} as ExportLog)
const loading = ref(false)

const scope = ref<'recipes' | 'portable'>('recipes')
const includeFoods = ref(true)
const includeKeywords = ref(true)
const includeBooks = ref(true)
const portableLoading = ref(false)
const portableSummary = ref<{foods: number, keywords: number, books: number} | null>(null)

/**
 * show export option for all types that have export marked as true in integration list
 */
const exportFormats = computed(() => {
    let formats = []

    INTEGRATIONS.forEach(integration => {
        if (integration.export) {
            formats.push({title: integration.name, value: integration.id})
        }
    })

    return formats
})

function doExport() {
    let api = new ApiApi()
    exportLog.value = {} as ExportLog
    loading.value = true

    api.apiExportCreate({exportRequest: {all: allRecipes.value, type: exportType.value, recipes: selectedRecipes.value, customFilter: selectedFilter.value}}).then(r => {
        exportLog.value = r
        recRefreshExportLog()
    }).catch(err => {
        loading.value = false
        useMessageStore().addError(ErrorMessageType.CREATE_ERROR, err)
    }).finally(() => {

    })
}

function doPortableExport() {
    const api = new ApiApi()
    portableLoading.value = true
    portableSummary.value = null

    api.apiExportPortableDataCreate({
        portableDataExportRequest: {includeFoods: includeFoods.value, includeKeywords: includeKeywords.value, includeBooks: includeBooks.value},
    }).then(r => {
        const content = (r as any).content ?? {foods: [], keywords: [], books: []}
        portableSummary.value = {foods: content.foods.length, keywords: content.keywords.length, books: content.books.length}
        downloadJson(r, `tandoor-portable-data-${new Date().toISOString().slice(0, 10)}.json`)
    }).catch(err => {
        useMessageStore().addError(ErrorMessageType.CREATE_ERROR, err)
    }).finally(() => {
        portableLoading.value = false
    })
}

function downloadJson(data: object, filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
}

function recRefreshExportLog() {
    let api = new ApiApi()

    api.apiExportLogRetrieve({id: exportLog.value.id!}).then(r => {
        exportLog.value = r
        if (exportLog.value.running) {
            setTimeout(() => recRefreshExportLog(), 1000)
        } else {
            loading.value = false
        }
    })
}

</script>


<style scoped>

</style>