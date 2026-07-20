<template>
    <div>
    <v-input :hint="props.hint" persistent-hint :hide-details="props.hideDetails" :disabled="props.disabled">
        <template #prepend v-if="$slots.prepend">
            <slot name="prepend"></slot>
        </template>

        <!-- Persistent floating notch label. Rendered as a ::before on the multiselect root (which
             @vueform already sets position:relative), NOT a positioned wrapper — a wrapper would
             become the multiselect's offsetParent and shift @vueform's append-to-body popper on
             first open. Suppressed for the inline variant, which shows the label as the placeholder. -->
        <!-- TODO resolve-on-load false for now, race condition with model class, make prop once better solution is found -->
        <Multiselect
            :ref="`ref_${props.id}`"
            :key="`${props.id}-hydration-${hydrationVersion}`"
            class="material-multiselect "
            :data-label="showFloatingLabel ? props.label : undefined"
            :class="{'model-select--density-compact': props.density == 'compact', 'model-select--density-comfortable': props.density == 'comfortable', 'model-select--density-default': props.density == '', 'model-select--inline': props.inline, 'model-select--outlined': props.variant === 'outlined', 'model-select--underline': props.variant === 'underline'}"
            :resolve-on-load="props.searchOnLoad"
            v-model="multiselectModel"
            :options="search"
            :on-create="createObject"
            :createOption="props.allowCreate"
            :delay="300"
            :object="effectiveObject"
            :valueProp="itemValue"
            :label="itemLabel"
            :searchable="true"
            :strict="false"
            :disabled="props.disabled"
            :mode="props.mode"
            :can-clear="props.canClear"
            :can-deselect="props.canClear"
            :limit="props.limit"
            :placeholder="effectivePlaceholder"
            :aria="props.label ? {'aria-label': props.label} : undefined"
            :noOptionsText="$t('No_Results')"
            :noResultsText="$t('No_Results')"
            :loading="loading"
            @open="onOpen"
            :append-to-body="props.appendToBody"
            :classes="{
                dropdown: 'multiselect-dropdown z-3000',
                containerActive: '',
                containerDisabled: 'text-disabled'
            }"
        >
            <template #option="{ option }" v-if="props.allowCreate">
                <div class="d-flex align-center justify-space-between w-100">
                    <span>{{ option[itemLabel] }}</span>
                    <v-chip size="x-small" variant="flat" color="create" class="ml-2" v-if="option.__CREATE__">
                        <v-icon icon="$create"></v-icon>
                        <template class="d-none d-lg-block"> {{ $t('Create') }}</template>
                    </v-chip>
                </div>
            </template>

            <template #clear="{ clear }" v-if="props.canClear">
                <span @click="clear" aria-hidden="true" tabindex="-1" role="button" data-clear="" aria-roledescription="❎" class="multiselect-clear">
                  <span class="multiselect-clear-icon"></span>
                </span>
            </template>

            <template v-if="hasMoreItems && !loading" #afterlist>
                <span class="text-disabled font-italic text-caption ms-3">{{ $t('ModelSelectResultsHelp') }}</span>
            </template>
        </Multiselect>

        <template #append v-if="$slots.append">
            <slot name="append">

            </slot>
        </template>
    </v-input>
    </div>
</template>

<script lang="ts" setup>
import {computed, onBeforeMount, ref, useTemplateRef} from "vue"
import {EditorSupportedModels, GenericModel, getGenericModelFromString} from "@/types/Models"
import Multiselect from '@vueform/multiselect'
import {ErrorMessageType, PreparedMessage, useMessageStore} from "@/stores/MessageStore";
import {useI18n} from "vue-i18n";
import {useMultiselectHydration} from "@/composables/useMultiselectHydration";

const {t} = useI18n()

const emit = defineEmits(['update:modelValue', 'create'])

const props = withDefaults(defineProps<{
    model: EditorSupportedModels
    id?: string
    limit?: number
    disabled?: boolean
    canClear?: boolean
    mode?: 'single' | 'multiple' | 'tags'
    appendToBody?: boolean
    object?: boolean
    allowCreate?: boolean
    placeholder?: string
    noOptionsText?: string
    noResultsText?: string
    label?: string
    hint?: string
    hideDetails?: boolean
    density?: '' | 'compact' | 'comfortable'
    searchOnLoad?: boolean
    inline?: boolean
    variant?: 'underline' | 'outlined'
}>(), {
    id: () => Math.floor(Math.random() * 10000).toString(),
    limit: 25,
    disabled: false,
    canClear: true,
    mode: 'single',
    appendToBody: false,
    object: true,
    allowCreate: false,
    placeholder: undefined,
    noOptionsText: undefined,
    noResultsText: undefined,
    label: '',
    hint: '',
    hideDetails: false,
    density: '',
    searchOnLoad: false,
    inline: false,
    variant: 'underline',
})

/**
 * check if model has a non-standard value attribute defined, if not use "id" as the value attribute
 */
const itemValue = computed(() => {
    if (modelClass.value.model.itemValue) {
        return modelClass.value.model.itemValue
    }
    return 'id'
})

/**
 * check if model has a non-standard label attribute defined, if not use "name" as the value attribute
 */
const itemLabel = computed(() => {
    if (modelClass.value.model.itemLabel) {
        return modelClass.value.model.itemLabel
    }
    return 'name'
})

// Persistent floating label (native-field parity); the inline variant shows the label as the
// placeholder instead, for dense rows.
const showFloatingLabel = computed(() => !!props.label && !props.inline)

const model = defineModel()
const modelClass = ref({} as GenericModel)
const loading = ref(false)
const hasMoreItems = ref(false)

// Native filled-field behavior: when a labelled (non-inline) field is empty AND unfocused, the
// floating label doubles as the placeholder (CSS drops the ::before into the value slot), so
// @vueform must NOT render its own placeholder too (that produced a duplicate label). Inline and
// unlabelled fields keep a real placeholder. An explicit placeholder prop always wins.
const effectivePlaceholder = computed(() => {
    if (props.placeholder) return props.placeholder
    if (showFloatingLabel.value) return ''
    if (props.inline && props.label) return props.label
    return t(modelClass.value.model?.localizationKey ?? '')
})

const multiselect = useTemplateRef(`ref_${props.id}`)

/**
 * On open, refresh options and deterministically correct @vueform's append-to-body first-open
 * offset. That popper is created with a centered placement + a sameWidth modifier, and @vueform
 * positions it (nextTick) before the dropdown has painted its width, so the first open centers
 * using width 0 and lands at the field's midpoint (self-corrects only on reopen). Rather than
 * guess a frame delay, watch the dropdown's size: the instant it reports a real width, re-run
 * @vueform's own updatePopper() (now width-aware → correct) and stop observing. No-op in-tree
 * (non-append) where there is no popper.
 */
function onOpen() {
    const ms = multiselect.value as any
    ms?.refreshOptions?.()
    const dropdown = ms?.dropdown as HTMLElement | undefined
    if (!dropdown || typeof ResizeObserver === 'undefined') {
        return
    }
    const ro = new ResizeObserver(() => {
        if (dropdown.offsetWidth > 0) {
            ms?.updatePopper?.()
            ro.disconnect()
        }
    })
    ro.observe(dropdown)
}

const {multiselectModel, effectiveObject, version: hydrationVersion, hydrate, mergeIntoResults} =
    useMultiselectHydration(model, modelClass, () => props.mode, () => props.object, itemValue, itemLabel, multiselect)

onBeforeMount(() => {
    modelClass.value = getGenericModelFromString(props.model, t)
    void hydrate()
})

function search(query: string) {
    loading.value = true
    return modelClass.value.list({query: query, page: 1, pageSize: props.limit}).then((r: any) => {
        // list() now always resolves a {count, results, next} envelope (non-paginated models
        // are normalized in GenericModel.list), so no per-shape branch is needed here.
        hasMoreItems.value = !!r.next
        return mergeIntoResults(r.results)
    }).catch((err: any) => {
        useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
    }).finally(() => {
        loading.value = false
    })
}

/**
 * handle new object being created
 *
 * @param object object with two keys (itemValue/itemLabel) both having the string of the newly created item (query) as a value {<itemValue>: query, <itemLabel>: query}
 * @param select$ reference to multiselect instance
 */
async function createObject(object: any, select$: Multiselect) {
    return await modelClass.value.create({name: object[itemLabel.value]}).then((createdObj: any) => {
        useMessageStore().addPreparedMessage(PreparedMessage.CREATE_SUCCESS, createdObj)
        emit('create', object)
        return createdObj
    }).catch((err: any) => {
        useMessageStore().addError(ErrorMessageType.CREATE_ERROR, err)
    })
}


</script>

<style src="@vueform/multiselect/themes/default.css"></style>
<!-- style can't be scoped (for whatever reason) -->
<style>
.material-multiselect {
    /* theme-derived fill matching the native filled-field overlay (on-surface @ 0.04) */
    --ms-bg: rgba(var(--v-theme-on-surface), 0.04);
    --ms-border-color: 0;
    --ms-border-color-active: 0;
    /* Height is density-driven (native Vuetify: default 56 / comfortable 48 / compact 40) and
       applied to EVERY select — labelled or not — so they line up in a shared form. */
    min-height: 56px;
}

/* Border variants. underline = filled field with a bottom rule (default), outlined = full border
   — the two native Vuetify field looks. Colors are theme-derived (on-surface), matching the native
   filled underline (on-surface @ ~0.38) rather than hardcoded greys. */
.material-multiselect.model-select--underline {
    border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.38);
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
}

.material-multiselect.model-select--outlined {
    border: thin solid rgba(var(--v-theme-on-surface), 0.38);
    border-radius: 4px;
    --ms-bg: transparent; /* outlined fields have no fill */
}

/* Filled-field parity: a labelled ModelSelect reads like a native Vuetify field. Field HEIGHT is
   density-driven (see base + density rules) and applies whether or not there's a label, so labelled
   and unlabelled selects line up. The label is the multiselect root's ::before (root is already
   position:relative), so no positioned wrapper is needed — a wrapper would become the multiselect's
   offsetParent and shift @vueform's append-to-body popper on first open. */
.material-multiselect[data-label]::before {
    content: attr(data-label);
    position: absolute;
    top: 7px;
    left: 16px;
    z-index: 1;
    max-width: calc(100% - 32px);
    font-size: 0.75rem;
    line-height: 18px;
    letter-spacing: 0.0094em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    /* Match the native filled-field floated label exactly: on-surface color at high-emphasis
       alpha, dimmed by a medium-emphasis element opacity (Vuetify layers the two → grey, not
       black). Both theme-derived, no hardcoded colors. */
    color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity, 0.87));
    opacity: var(--v-medium-emphasis-opacity, 0.6);
    background: transparent;
    pointer-events: none;
}

/* compact: notch sits higher in the shorter (40px) field */
.material-multiselect.model-select--density-compact[data-label]::before {
    top: 3px;
}

/* outlined: the label rides the top border — cut it with a surface swatch; the value stays
   centered (no push-down), as in a native outlined field. */
.material-multiselect.model-select--outlined[data-label]::before {
    top: -8px;
    padding: 0 4px;
    background: rgb(var(--v-theme-surface));
}

/* Empty AND closed → the label doubles as the placeholder: centered, at value size. As soon as the
   field is opened (@vueform toggles .is-open / .is-open-top) or holds a value / tags, the notch
   rules above take over. Transparent + no padding so an outlined field's centered placeholder does
   not cut the border. */
.material-multiselect[data-label]:not(.is-open):not(.is-open-top):not(:has(.multiselect-single-label)):not(:has(.multiselect-tag))::before {
    top: 50%;
    transform: translateY(-50%);
    font-size: 1rem;
    line-height: 24px;
    letter-spacing: normal;
    padding: 0;
    background: transparent;
}

/* @vueform hardcodes the tags-mode search input white; make it transparent so the field fill
   (--ms-bg) shows through instead of a white band. */
.material-multiselect .multiselect-tags-search {
    background: transparent;
}

/* Seat the value / placeholder / search text exactly where a native filled input seats it:
   line-height 24px, pushed down with padding-top 24px (native uses padding-top:24; padding-bottom:4;
   line-height:24 inside a 56px field). Overrides @vueform's tall --ms-line-height so the value
   doesn't ride ~7px high. */
.material-multiselect.model-select--underline[data-label] .multiselect-single-label,
.material-multiselect.model-select--underline[data-label] .multiselect-placeholder,
.material-multiselect.model-select--underline[data-label] .multiselect-multiple-label {
    align-items: flex-start;
    padding-top: 24px;
    padding-bottom: 4px;
    line-height: 24px;
    left: 16px;
}

.material-multiselect.model-select--underline[data-label] .multiselect-tags {
    padding-top: 22px;
    padding-left: 12px;
}

.material-multiselect.model-select--underline[data-label] .multiselect-search {
    padding-top: 24px;
    padding-left: 16px;
    line-height: 24px;
}

/* compact filled (40px): value/search seat higher so they fit below the compact notch */
.material-multiselect.model-select--underline.model-select--density-compact[data-label] .multiselect-single-label,
.material-multiselect.model-select--underline.model-select--density-compact[data-label] .multiselect-placeholder,
.material-multiselect.model-select--underline.model-select--density-compact[data-label] .multiselect-multiple-label,
.material-multiselect.model-select--underline.model-select--density-compact[data-label] .multiselect-search {
    padding-top: 16px;
    line-height: 20px;
}

.material-multiselect.model-select--density-compact {
    --ms-line-height: 1.3;
    min-height: 40px;
}

.material-multiselect.model-select--density-comfortable {
    --ms-line-height: 1.8;
    min-height: 48px;
}

.model-select--density-default {
    --ms-line-height: 2.3;
}

/* inline: no external label; sized to sit beside Vuetify compact fields in a row.
   Double class beats the density classes by specificity, not source order. */
.material-multiselect.model-select--inline {
    --ms-line-height: 1.3;
    /* Tighter horizontal padding for dense inline rows: @vueform reserves 1.25rem + 3×--ms-px on
       the right for the clear+caret chrome (62px at the default --ms-px), which starves the value
       text in narrow columns and truncates unit names. Halving --ms-px keeps clear+caret clear of
       the text while giving the value far more room. */
    --ms-px: 0.5rem;
    min-height: 40px;
}


.multiselect-tag {
    background-color: #b98766 !important;
}

.z-3000 {
    z-index: 3000;
}
</style>
