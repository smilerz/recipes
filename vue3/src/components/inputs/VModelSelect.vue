<template>

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
        :multiple="props.multiple"
        :placeholder="props.placeholder"
        :loading="loading"
        closable-chips

        @keydown.enter.exact="createItem(false)"
        @keydown.shift.enter="createItem(true)"
        @blur="hasFocus = false"
        @focus="hasFocus = true"
    >
        <template #menu-header>
            <v-list-item>
                {{search}}
            </v-list-item>
        </template>
        <template #menu-footer>
            <!-- TODO condition items or select does not include search -->
            <v-list-item v-if="search != undefined && search != '' && props.create">
                <v-chip label size="small">Erstellen
                    <span class="fa-stack">
                        <i class="fa-regular fa-square fa-stack-2x"></i>
                        <i class="fa-solid fa-arrow-turn-down fa-stack-1x fa-rotate-90"></i>
                    </span>
                </v-chip>
                <v-chip label size="small" >Erstellen & Bearbeiten

                    <span class="fa-stack">
                        <i class="fa-regular fa-square fa-stack-2x"></i>
                        <i class="fa-solid fa-arrow-up fa-stack-1x"></i>
                    </span>
                    +
                    <span class="fa-stack">
                        <i class="fa-regular fa-square fa-stack-2x"></i>
                        <i class="fa-solid fa-arrow-turn-down fa-stack-1x fa-rotate-90"></i>
                    </span>

                </v-chip>
            </v-list-item>
        </template>


    </v-autocomplete>
</template>

<script setup lang="ts">

import {onBeforeMount, onMounted, PropType, ref, watch} from "vue";
import {ApiApi, Food} from "@/openapi";
import {useDebounceFn} from "@vueuse/core";
import {Density} from "vuetify/lib/composables/density";
import {EditorSupportedModels, EditorSupportedTypes, GenericModel, getGenericModelFromString} from "@/types/Models.ts";
import {ErrorMessageType, PreparedMessage, useMessageStore} from "@/stores/MessageStore.ts";
import {useI18n} from "vue-i18n";

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
    returnObject: {type: Boolean, default: false},
    chips: {type: Boolean, default: false},
    multiple: {type: Boolean, default: false},
    placeholder: {type: String, default: undefined},
})

const modelValue = defineModel<EditorSupportedTypes|EditorSupportedTypes[]>()
const modelClass = ref({} as GenericModel)
const loading = ref(false)
const hasFocus = ref(false)
const hasLoadedOnce = ref(false)
const hasMoreItems = ref(false) // TODO implement

const items = ref([] as EditorSupportedTypes[])

const search = ref<string|undefined>(undefined)

watch(search, (newValue, oldValue) => {
    console.log('search changed', `"${oldValue}"`, `--> "${newValue}"`)
    if (hasFocus.value) {
        debouncedSearchItems()
    }
})

/**
 * create instance of model class when mounted
 */
onBeforeMount(() => {
    modelClass.value = getGenericModelFromString(props.model, t)
})

onMounted(() => {
    if (props.searchOnLoad) {
        searchItems()
    }
})

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
    console.log('searching', `"${query}"`)

    loading.value = true
    return modelClass.value.list({query: query, page: 1, pageSize: props.limit}).then((r: any) => {
        if (modelClass.value.model.isPaginated) {
            hasMoreItems.value = !!r.next
            items.value = r.results
            return items.value
        } else {
            hasMoreItems.value = false
            items.value = r
            return items.value
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
 *
 */
async function createItem(edit: boolean) {
    if (props.create) {
        return modelClass.value.create({name: search.value}).then((createdObj: any) => {
            useMessageStore().addPreparedMessage(PreparedMessage.CREATE_SUCCESS, createdObj)
            emit('create', createdObj)

            items.value.push(createdObj)
            if (props.multiple) {
                modelValue.value.push(createdObj)
                search.value = ''
            } else {
                modelValue.value = createdObj
            }

        }).catch((err: any) => {
            useMessageStore().addError(ErrorMessageType.CREATE_ERROR, err)
        })
    }

}

</script>

<style scoped>

</style>