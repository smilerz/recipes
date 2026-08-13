<template>

    <v-autocomplete
        :ref="`ref_${props.id}`"
        v-model="modelValue"
        v-model:search="search"
        autocomplete="suppress"
        no-filter
        :items="items"
        item-title="name"
        :label="label"
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

        @keydown.enter.exact="createItem(search, false); console.log('triggered enter keydown')"
        @keydown.shift.enter="createItem(search, true); console.log('triggered shift enter keydown')"
        @keydown.shift.e.prevent="editDialog = true"
        @blur="hasFocus = false"
        @focus="hasFocus = true; searchItems()"
    >
        <template v-slot:chip="{ props, item }">
            <v-chip
                v-bind="props"
                :text="item.title"
                :prepend-avatar="(modelClass.model.name == 'Recipe') ? item.raw.image : undefined"
            ></v-chip>
        </template>

        <template #no-data>
            <v-list-item v-if="hasLoadedOnce">
                {{$t('No_Results')}}
            </v-list-item>
        </template>

        <template v-slot:item="{ props, item }">
            <v-list-item v-if="item.raw.id == undefined"
                         :title="item.title"
                         @click.exact="createItem(search, false); console.log('triggered click ITEM')"
                         @click.shift="createItem(search, true); console.log('triggered click ITEM SHIFT')"
            >
                <template #append>
                    <v-icon icon="$create" color="success">

                    </v-icon>
                </template>
            </v-list-item>
            <!-- normal items -> normal rendering -->
            <v-list-item v-if="item.raw.id > 0"
                         v-bind="props"
                         :title="item.title"
            >
                <template #prepend v-if="modelClass.model.name == 'Recipe'">
                    <v-avatar :image="item.raw.image" v-if="item.raw.image"></v-avatar>
                    <v-avatar image="../../assets/recipe_no_image.svg" v-else></v-avatar>
                </template>


            </v-list-item>
            <!-- render special info item last -->
            <v-list-item v-if="item.raw.id == -1"
                         size="small"
                         density="compact"
                         disabled
                         v-bind="props"
                         :title="item.title"
            >
            </v-list-item>
        </template>

        <template #menu-footer v-if="!mobile">
            <v-list-item>
                <span v-if="!props.multiple">
                    <v-chip size="x-small" class="mr-1 ml-2" label><i class="fas fa-arrow-up"></i></v-chip>
                    <v-chip size="x-small" class="mr-1" label>E</v-chip>
                    <span>{{ $t('Editor') }}</span>
                </span>
                <span v-if="props.create" :class="{'text-disabled': !showCreate || loading }">
                    <v-chip size="x-small" class="mr-1" label><i class="fas fa-level-down-alt fa-rotate-90"></i></v-chip>
                    <span class="mr-4">{{ $t('Create') }}</span>

                    <template v-if="!props.multiple">
                        <v-chip size="x-small" class="mr-1" label><i class="fas fa-arrow-up"></i></v-chip>
                        <v-chip size="x-small" class="mr-1" label><i class="fas fa-level-down-alt fa-rotate-90"></i></v-chip>
                        <span>{{ $t('Create') }} & {{ $t('Edit') }}</span>
                    </template>
                </span>
            </v-list-item>
        </template>

    </v-autocomplete>

    <model-edit-dialog :model="props.model" v-model="editDialog" :item-id="modelValueId" @save="handleModelEditorUpdate" @create="handleModelEditorUpdate"></model-edit-dialog>


</template>

<script setup lang="ts">

import {computed, nextTick, onBeforeMount, onMounted, PropType, ref, watch} from "vue";
import {useDebounceFn} from "@vueuse/core";
import {Density} from "vuetify/lib/composables/density";
import {EditorSupportedModels, EditorSupportedTypes, GenericModel, getGenericModelFromString} from "@/types/Models.ts";
import {ErrorMessageType, PreparedMessage, useMessageStore} from "@/stores/MessageStore.ts";
import {useI18n} from "vue-i18n";
import ModelEditDialog from "@/components/dialogs/ModelEditDialog.vue";
import {useDisplay} from "vuetify";

const {t} = useI18n()
const {mobile} = useDisplay()

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
const hasMoreItems = ref(false)
const lastAddedItem = ref<EditorSupportedTypes>(undefined)

const items = ref([] as EditorSupportedTypes[])

const search = ref<string | undefined>(undefined)

/**
 * determine if the user should be able to create a new item based on create prop and if the item is already present
 */
const showCreate = computed(() => {
    const existingNames = items.value.filter(item => item.id != undefined).map(item => item.name.toLowerCase())
    if (Array.isArray(modelValue.value)) {
        existingNames.concat(modelValue.value.map(item => item.name.toLowerCase()))
    } else if (props.returnObject && modelValue.value != undefined) {
        existingNames.push(modelValue.value.name.toLowerCase())
    }

    return props.create && search.value != undefined && search.value.length > 0 && !existingNames.includes(search.value.toLowerCase())
})

/**
 * modelValue id or undefined if nothing is selected or its props.multiple is set
 */
const modelValueId = computed(() => {
    console.log(modelValue.value)
    if (props.multiple && lastAddedItem.value) {
        return lastAddedItem.value.id
    } else if (modelValue.value) {
        return modelValue.value.id
    }

    return undefined
})

/**
 * default to model class localization key for a label when none is given
 */
const label = computed(() => {
    if (props.label) {
        return props.label
    } else {
        return t(modelClass.value.model.localizationKey)
    }
})

/**
 * listen to search update and call debounced search
 */
watch(search, (newValue, oldValue) => {
    if (hasFocus.value) {
        loading.value = true
        debouncedSearchItems()
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
    console.log('searching items')
    let query = (search.value == undefined) ? '' : search.value
    if (query.startsWith(' ')) {
        console.log('search query starts with space')
        return
    }
    console.log('search query is', query)
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

        if (hasMoreItems.value) {
            items.value.push({name: t('ModelSelectResultsHelp'), id: -1})
        }

    }).catch((err: any) => {
        useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
    }).finally(() => {
        console.log('search items finished')
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
        loading.value = true
        return modelClass.value.create({name: name}).then((createdObj: any) => {
            useMessageStore().addPreparedMessage(PreparedMessage.CREATE_SUCCESS, createdObj)
            emit('create', createdObj)

            items.value.push(createdObj)
            items.value = items.value.filter((item: any) => item.id != undefined)

            if (props.multiple) {
                if (Array.isArray(modelValue.value)) {
                    modelValue.value.push(createdObj)
                } else {
                    modelValue.value = [createdObj]
                }

                search.value = ''
            } else {
                modelValue.value = createdObj
            }

            lastAddedItem.value = createdObj

            if (edit && !props.multiple) {
                editDialog.value = true
            }
            return createdObj
        }).catch((err: any) => {
            useMessageStore().addError(ErrorMessageType.CREATE_ERROR, err)
        }).finally(() => {
            loading.value = false
        })
    }
}

/**
 * handle edit dialog updates depending on the mode the select is in
 * @param event
 */
function handleModelEditorUpdate(event: EditorSupportedTypes) {
    if (props.multiple) {
        console.log('is multiple')
        if (Array.isArray(modelValue.value) && modelValue.value.length > 0) {
            let existingIndex = modelValue.value.findIndex((item: any) => item.id == event.id)
            console.log('splicing at', existingIndex)
            modelValue.value.splice(existingIndex, 1, event)
        } else {
            modelValue.value = [event]
        }
    } else {
        modelValue.value = event
    }
}

</script>

<style scoped>

</style>