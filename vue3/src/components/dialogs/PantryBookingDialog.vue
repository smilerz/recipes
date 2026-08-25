<template>
    <v-dialog max-width="900" v-model="dialog" activator="model">
        <v-card>

            <v-closable-card-title v-model="dialog" icon="fas fa-jar" :title="dialogTitle"></v-closable-card-title>

            <v-card-text>

                <v-row v-if="['add','edit'].includes(bookingMode)">
                    <v-col>
                        <v-form>
                            <inventory-entry-form-fields :form="form" :booking-mode="bookingMode"></inventory-entry-form-fields>

                            <v-btn block @click="save" prepend-icon="$save" color="save">{{ $t('Save') }}</v-btn>
                        </v-form>
                    </v-col>
                </v-row>
                <v-row v-if="['confirm'].includes(bookingMode) && bookingConfirmEntry != null">
                    <v-col>

                        <v-card variant="outlined">
                            <v-card-text>
                                <p>
                                    {{ ingredientToString({food: bookingConfirmEntry.food, unit: bookingConfirmEntry.unit, amount: bookingConfirmEntry.amount} as Ingredient) }}
                                </p>

                                <p class="text-disabled mt-4">{{ $t('Code') }}</p>
                                <p class="text-h3 text-pre">
                                    #{{ bookingConfirmEntry.code }}
                                </p>

                                <template v-if="bookingConfirmEntry.expires">
                                    <p class="text-disabled mt-4">{{ $t('Expires') }}</p>
                                    <p>
                                        <v-chip label :color="(bookingConfirmEntry.expires < DateTime.now() ? 'error' : 'success')">
                                            {{ DateTime.fromJSDate(bookingConfirmEntry.expires).toLocaleString(DateTime.DATE_MED) }}
                                        </v-chip>
                                    </p>
                                </template>

                            </v-card-text>
                        </v-card>

                        <p class="mt-10">

                            <v-select
                                v-model="selectedCopyOptions"
                                chips
                                :label="$t('Copy')"
                                :items="copyOptions"
                                multiple
                                hide-details
                            >
                            </v-select>
                            <v-btn class="" block color="success" prepend-icon="$copy" @click="copyConfirmEntry">{{ $t('Copy') }}</v-btn>
                            <v-btn class="mt-4" block color="info" prepend-icon="$close" @click="dialog = false; resetForm();">{{ $t('Close') }}</v-btn>

                        </p>

                    </v-col>
                </v-row>
            </v-card-text>

        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">

import VClosableCardTitle from "@/components/dialogs/VClosableCardTitle.vue";
import {DateTime} from "luxon";
import {ingredientToString} from "@/utils/model_utils.ts";
import {ApiApi, Ingredient} from "@/openapi";
import InventoryEntryFormFields from "@/components/inputs/InventoryEntryFormFields.vue";
import {useI18n} from "vue-i18n";
import {computed, onMounted, ref, watch} from "vue";
import {useInventoryEntryForm} from "@/composables/useInventoryEntryForm.ts";

const emits = defineEmits(['update'])

const dialog = defineModel<boolean>()
const props = defineProps<{
    bookingMode: string,
    inventoryEntryId?: number,
}>()

const {t} = useI18n()

const bookingMode = ref('add')

const form = useInventoryEntryForm(t, {
    onAdded: () => {
        bookingMode.value = 'confirm'
    },
    onEdited: () => {
        dialog.value = false
    },
    onNoChange: () => {
        dialog.value = false
    },
    onSettled: () => {
        emits('update')
    },
    onCopied: () => {
        bookingMode.value = 'add'
    },
})

const {
    formLoading, editTab, food, inventoryEntry, inventoryLocation, subLocation, code, amount, unit, expires,
    entryOriginalAmount, entryOriginalUnit, amountChanged, commonUnits,
    bookingConfirmEntry, copyOptions, selectedCopyOptions,
    loadCommonUnits, addInventory, editInventory, inventoryEntrySelected, resetForm, copyConfirmEntry,
} = form

const dialogTitle = computed(() => {
    if (bookingMode.value == 'add') {
        return t('Add')
    } else if (bookingMode.value == 'edit') {
        return t('Edit')
    } else if (bookingMode.value == 'confirm') {
        return t('Confirm')
    } else {
        return t('Error')
    }
})

watch(dialog, (newValue, oldValue) => {
    if (!newValue) {
        resetForm()
    } else {
        bookingMode.value = props.bookingMode

        if (props.inventoryEntryId) {
            let api = new ApiApi()
            api.apiInventoryEntryRetrieve({id: props.inventoryEntryId}).then(r => {
                inventoryEntry.value = r
                inventoryEntrySelected()
            })
        }
    }
})

onMounted(() => {
    bookingMode.value = props.bookingMode

    if (props.inventoryEntryId) {
        const api = new ApiApi()
        api.apiInventoryEntryRetrieve({id: props.inventoryEntryId}).then(r => {
            inventoryEntry.value = r
            inventoryEntrySelected()
        })
    }

    loadCommonUnits()
})

/**
 * save form depending on selected booking mode
 */
function save() {
    if (bookingMode.value == 'add') {
        addInventory()
    } else if (bookingMode.value == 'edit') {
        editInventory()
    }
}


</script>

<style scoped>

</style>