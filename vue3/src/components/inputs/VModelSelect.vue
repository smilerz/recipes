<template>
    {{ props.model }}
    <v-autocomplete
        :ref="`ref_${props.id}`"
        v-model="modelValue"
        v-model:search="search"
        autocomplete="suppress"
        no-filter
        :items="items"
        item-title="name"
        :label="props.label"
        :hint="props.hint"
        :hide-details="props.hideDetails"
        :density="props.density"
        :clearable="props.clearable"
        :disabled="props.disabled"
        :return-object="props.returnObject"
        :chips="props.chips"
        :closable-chips="props.chips"
        :multiple="props.multiple"
        :placeholder="props.placeholder"
        :loading="loading"

        @keydown.enter.exact="createItem(search, false)"
        @keydown.shift.enter="createItem(search, true)"
        @blur="hasFocus = false"
        @focus="hasFocus = true"
    >
        <template v-slot:chip="{ props, item }">
            <v-chip
                v-bind="props"
                :text="item.title"
                :prepend-avatar="(modelClass.model.name == 'Recipe') ? item.raw.image : undefined"

            ></v-chip>
        </template>

        <template v-slot:item="{ props, item }">
            <v-list-item
                v-bind="props"
                :title="item.title"
            >
                <template #prepend v-if="modelClass.model.name == 'Recipe'">
                    <v-avatar :image="item.raw.image" v-if="item.raw.image"></v-avatar>
                    <v-avatar image="../../assets/recipe_no_image.svg" v-else></v-avatar>
                </template>

                <template v-if="item.raw.id == undefined" #append>
                    <v-icon icon="$create" color="success">

                    </v-icon>
                </template>
            </v-list-item>
        </template>

        <template #menu-footer>
            <!-- TODO condition items or select does not include search -->
            <v-list-item v-if="search != undefined && search != '' && props.create">
<!--                <v-chip label size="small">Erstellen-->
<!--                    <span class="fa-stack">-->
<!--                        <i class="fa-regular fa-square fa-stack-2x"></i>-->
<!--                        <i class="fa-solid fa-arrow-turn-down fa-stack-1x fa-rotate-90"></i>-->
<!--                    </span>-->
<!--                </v-chip>-->
<!--                <v-chip label size="small">Erstellen & Bearbeiten-->

<!--                    <span class="fa-stack">-->
<!--                        <i class="fa-regular fa-square fa-stack-2x"></i>-->
<!--                        <i class="fa-solid fa-arrow-up fa-stack-1x"></i>-->
<!--                    </span>-->
<!--                    +-->
<!--                    <span class="fa-stack">-->
<!--                        <i class="fa-regular fa-square fa-stack-2x"></i>-->
<!--                        <i class="fa-solid fa-arrow-turn-down fa-stack-1x fa-rotate-90"></i>-->
<!--                    </span>-->
<!--                </v-chip>-->
                <v-chip size="x-small" class="mr-1" label><i class="fas fa-level-down-alt fa-rotate-90"></i></v-chip>
                <span class="mr-4">Erstellen</span>

                <v-chip size="x-small" class="mr-1" label><i class="fas fa-arrow-up"></i></v-chip>
                <v-chip size="x-small" class="mr-1" label><i class="fas fa-level-down-alt fa-rotate-90"></i></v-chip>
                <span>Erstellen & Bearbeiten</span>
                <span class="text-disabled font-italic text-caption ms-3" v-if="hasMoreItems">{{ $t('ModelSelectResultsHelp') }}</span>
            </v-list-item>
        </template>


    </v-autocomplete>

    <model-edit-dialog :model="props.model" v-model="editDialog" :item="modelValue" @save="modelValue = $event" v-if="!props.multiple"></model-edit-dialog>

    {{ search }} <br/>
    {{ modelValue }}
</template>

<script setup lang="ts">

import {computed, onBeforeMount, onMounted, PropType, ref, watch} from "vue";
import {ApiApi, Food} from "@/openapi";
import {useDebounceFn} from "@vueuse/core";
import {Density} from "vuetify/lib/composables/density";
import {EditorSupportedModels, EditorSupportedTypes, GenericModel, getGenericModelFromString} from "@/types/Models.ts";
import {ErrorMessageType, PreparedMessage, useMessageStore} from "@/stores/MessageStore.ts";
import {useI18n} from "vue-i18n";
import ModelEditDialog from "@/components/dialogs/ModelEditDialog.vue";
import {useUserPreferenceStore} from "@/stores/UserPreferenceStore.ts";

const {t} = useI18n()

const emit = defineEmits(['update:modelValue', 'create'])

const props = defineProps({
    // custom logic
    model: {type: String as PropType<EditorSupportedModels>, required: true},
    id: {type: String, required: false, default: Math.floor(Math.random() * 10000).toString()},
    create: {type: Boolean, default: false},
    searchOnLoad: {type: Boolean, default: false},
    limit: {type: Number, default: 25},

    // default props
    label: {type: String, default: ''},
    hint: {type: String, default: ''},
    hideDetails: {type: Boolean, default: false},
    density: {type: String as PropType<Density | undefined>},
    clearable: {type: Boolean, default: false},
    disabled: {type: Boolean, default: false},
    returnObject: {type: Boolean, default: true},
    chips: {type: Boolean, default: false},
    multiple: {type: Boolean, default: false},
    placeholder: {type: String, default: undefined},
})

const modelValue = defineModel<EditorSupportedTypes | EditorSupportedTypes[]>()
const modelClass = ref({} as GenericModel)
const loading = ref(false)
const hasFocus = ref(false)
const hasLoadedOnce = ref(false)
const editDialog = ref(false)
const hasMoreItems = ref(false) // TODO implement

const items = ref([] as EditorSupportedTypes[])

const search = ref<string | undefined>(undefined)

/**
 * determine if the user should be able to create a new item based on create prop and if the item is already present
 */
const showCreate = computed(() => {
    const existingNames = items.value.map(item => item.name.toLowerCase())
    if (Array.isArray(modelValue.value)) {
        existingNames.concat(modelValue.value.map(item => item.name.toLowerCase()))
    } else if (props.returnObject && modelValue.value != undefined) {
        existingNames.push(modelValue.value.name.toLowerCase())
    }

    return props.create && search.value != undefined && search.value.length > 0 && !existingNames.includes(search.value.toLowerCase())
})

/**
 * listen to search update and call debounced search
 */
watch(search, (newValue, oldValue) => {
    if (hasFocus.value) {
        debouncedSearchItems()
    }
})

/**
 * watch for changes in modelValue to detect new, local items being added so they can be saved to the server
 */
watch(modelValue, (newValue, oldValue) => { // TODO simulate with slow networ
    console.log('modelValue changed', `"${oldValue}"`, `--> "${newValue}"`)
    if (Array.isArray(newValue)) {
        newValue.filter(item => item.id == undefined && item.creating == undefined).forEach(item => {
            // prevent same item from being created multiple times
            if (Array.isArray(modelValue.value)) {
                let tempItem = modelValue.value.filter(item => item.name == newValue.name)
                if (tempItem != undefined && Array.isArray(modelValue.value)) {
                    tempItem.creating = true
                }
            }

            // create item
            createItem(item.name, false)
        })
    } else {
        if (newValue && newValue.id == undefined) {
            createItem(newValue.name, false)
        }
    }
})

/**
 * create instance of model class before mounting
 */
onBeforeMount(() => {
    modelClass.value = getGenericModelFromString(props.model, t)
})

onMounted(() => {
    if (props.searchOnLoad) {
        searchItems()
    }
})

/**
 * debounce search to prevent race conditions
 */
const debouncedSearchItems = useDebounceFn(() => {
    searchItems()
}, 300)

/**
 * performs the API request to search for the selected input
 */
function searchItems() {
    let query = (search.value == undefined) ? '' : search.value
    if (query.startsWith(' ')) {
        return
    }

    loading.value = true
    return modelClass.value.list({query: query, page: 1, pageSize: props.limit}).then((r: any) => {
        if (modelClass.value.model.isPaginated) {
            hasMoreItems.value = !!r.next
            items.value = r.results
        } else {
            hasMoreItems.value = false
            items.value = r
        }

        if (showCreate.value) {
            items.value.splice(0, 0, {name: search.value})
        }

    }).catch((err: any) => {
        useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
    }).finally(() => {
        loading.value = false
        hasLoadedOnce.value = true
    })
}


/**
 * handle new object being created
 * @param name name of the item to create
 * @param edit if the edit dialog should be opened after creation
 */
async function createItem(name: string | undefined, edit: boolean) {
    if (props.create && name != undefined && name != '') {
        return modelClass.value.create({name: name}).then((createdObj: any) => {
            useMessageStore().addPreparedMessage(PreparedMessage.CREATE_SUCCESS, createdObj)
            emit('create', createdObj)

            items.value.push(createdObj)
            if (props.multiple) {
                if (Array.isArray(modelValue.value)) {
                    let tempItem = modelValue.value.filter(item => item.name == createdObj.name)
                    if (tempItem) {
                        modelValue.value.splice(modelValue.value.indexOf(tempItem), 1, createdObj)
                    } else {
                        modelValue.value.push(createdObj)
                    }
                } else {
                    modelValue.value = [createdObj]
                }

                search.value = ''
            } else {
                modelValue.value = createdObj
            }

            if (edit) {
                editDialog.value = true
            }
            return createdObj
        }).catch((err: any) => {
            useMessageStore().addError(ErrorMessageType.CREATE_ERROR, err)
        })
    }

}

</script>

<style scoped>

</style>