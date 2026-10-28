<template>
    <v-dialog max-width="400px" v-model="dialog">
        <v-card :loading="loading">
            <v-closable-card-title :title="$t('Edit_Books')" v-model="dialog"></v-closable-card-title>
            <v-card-text>
                <model-select model="RecipeBook" v-model="selectedBook">
                    <template #append>
                        <v-btn icon color="create" data-testid="add-book" :aria-label="$t('Add')" :disabled="!selectedBook || loading" @click="addToBook()">
                            <v-icon icon="$create"></v-icon>
                        </v-btn>
                    </template>
                </model-select>
                <v-list v-if="entries.length > 0">
                    <v-list-item v-for="entry in entries" :key="entry.id" prepend-icon="$books">
                        <span data-testid="book-name">{{ entry.bookContent?.name }}</span>
                        <template #append>
                            <v-btn icon="$delete" variant="text" color="delete" data-testid="remove-book" :aria-label="$t('Delete')" @click="removeFromBook(entry)"></v-btn>
                        </template>
                    </v-list-item>
                </v-list>
            </v-card-text>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
import {PropType, ref, computed, watch} from "vue";
import {useI18n} from "vue-i18n";
import {ApiApi, RecipeBook, RecipeBookEntry, Recipe, RecipeOverview} from "@/openapi";
import {ErrorMessageType, MessageType, PreparedMessage, useMessageStore} from "@/stores/MessageStore";
import VClosableCardTitle from "@/components/dialogs/VClosableCardTitle.vue";
import ModelSelect from "@/components/inputs/ModelSelect.vue";

const props = defineProps({
    recipe: {type: Object as PropType<Recipe | RecipeOverview>, required: true},
    modelValue: {type: Boolean, default: false},
})

const emit = defineEmits(['update:modelValue'])

const {t} = useI18n()

const dialog = computed({
    get: () => props.modelValue,
    set: (val: boolean) => emit('update:modelValue', val),
})

const selectedBook = ref<RecipeBook | null>(null)
const entries = ref([] as RecipeBookEntry[])
const loading = ref(false)

const removing = new Set<number>()

watch(() => [props.modelValue, props.recipe.id], ([open]) => {
    entries.value = []
    if (open) loadEntries()
}, {immediate: true})

/**
 * load the books the recipe is in
 */
function loadEntries() {
    const recipeId = props.recipe.id!
    loading.value = true
    new ApiApi().apiRecipeBookEntryList({recipe: recipeId, pageSize: 100}).then(r => {
        if (recipeId === props.recipe.id) entries.value = r.results
    }).catch(err => {
        useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
    }).finally(() => {
        loading.value = false
    })
}

/**
 * add the recipe to the selected book, unless it is in it already
 */
function addToBook() {
    if (!selectedBook.value) return
    const book = selectedBook.value.id!
    if (entries.value.some(e => e.book == book)) {
        useMessageStore().addMessage(MessageType.WARNING, t('WarningRecipeBookEntryDuplicate'), 5000)
        return
    }
    loading.value = true
    new ApiApi().apiRecipeBookEntryCreate({recipeBookEntry: {book, recipe: props.recipe.id!}}).then(r => {
        entries.value.push(r)
        selectedBook.value = null
        useMessageStore().addPreparedMessage(PreparedMessage.CREATE_SUCCESS)
    }).catch(err => {
        useMessageStore().addError(ErrorMessageType.CREATE_ERROR, err)
    }).finally(() => {
        loading.value = false
    })
}

/**
 * take the recipe out of the book of the given entry, with a chance to undo it
 */
function removeFromBook(entry: RecipeBookEntry) {
    if (removing.has(entry.id!)) return
    removing.add(entry.id!)
    const book = entry.book
    const recipe = props.recipe.id!

    new ApiApi().apiRecipeBookEntryDestroy({id: entry.id!}).then(() => {
        const index = entries.value.findIndex(e => e.id == entry.id)
        if (index >= 0) entries.value.splice(index, 1)
        useMessageStore().addMessage(MessageType.SUCCESS, {title: t('Removed'), text: ''}, 6000, {}, {
            label: t('Undo'),
            callback: () => restoreToBook(book, recipe, index),
        })
    }).catch(err => {
        useMessageStore().addError(ErrorMessageType.DELETE_ERROR, err)
    }).finally(() => {
        removing.delete(entry.id!)
    })
}

/**
 * undo removeFromBook by recreating the entry at its old position
 */
function restoreToBook(book: number, recipe: number, index: number) {
    new ApiApi().apiRecipeBookEntryCreate({recipeBookEntry: {book, recipe}}).then(r => {
        if (recipe !== props.recipe.id) return
        entries.value.splice(Math.min(index, entries.value.length), 0, r)
    }).catch(err => {
        useMessageStore().addError(ErrorMessageType.CREATE_ERROR, err)
    })
}
</script>
