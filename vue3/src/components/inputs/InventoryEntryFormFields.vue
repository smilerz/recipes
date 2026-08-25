<template>
    <model-select model="InventoryEntry" :label="$t('InventoryEntry')" v-model="form.inventoryEntry.value" v-if="bookingMode === 'edit'"
                  @update:modelValue="form.inventoryEntrySelected()">
    </model-select>

    <model-select model="Food" :label="$t('Food')" allow-create v-model="form.food.value" v-if="bookingMode === 'add'"></model-select>

    <slot name="after-identity"></slot>

    <v-tabs v-if="bookingMode === 'edit'" v-model="form.editTab.value" class="mb-4" density="compact">
        <v-tab value="amount">{{ $t('Amount') }}</v-tab>
        <v-tab value="location">{{ $t('InventoryLocation') }}</v-tab>
    </v-tabs>

    <model-select model="InventoryLocation" :label="$t('InventoryLocation')" v-model="form.inventoryLocation.value"
                  v-if="bookingMode === 'add' || (bookingMode === 'edit' && form.editTab.value === 'location')">
        <template #append>
            <v-btn icon>
                <v-icon icon="$create"></v-icon>
                <model-edit-dialog model="InventoryLocation" @create="(args: InventoryLocation) => form.inventoryLocation.value = args"></model-edit-dialog>
            </v-btn>
        </template>
    </model-select>
    <v-text-field :label="$t('SubLocation')" :hint="$t('SubLocationHelp')" v-model="form.subLocation.value"
                  v-if="bookingMode === 'add' || (bookingMode === 'edit' && form.editTab.value === 'location')"></v-text-field>

    <closable-help-alert :text="$t('CodeHelp')" class="mb-2" v-if="bookingMode === 'add'"></closable-help-alert>
    <v-text-field :label="$t('Code')" v-model="form.code.value" v-if="bookingMode === 'add'"></v-text-field>

    <div v-if="bookingMode === 'edit' && form.editTab.value === 'amount'" class="text-caption text-medium-emphasis mb-2 d-flex align-center justify-space-between">
        <span>
            {{ $t('InStock') }}: {{ form.entryOriginalAmount.value }} {{ form.entryOriginalUnit.value?.name || '' }}
            <span v-if="form.amountChanged.value" class="text-warning">→ {{ form.amount.value }} {{ form.unit.value?.name || '' }}</span>
        </span>
        <v-btn size="small" variant="text" prepend-icon="fa-solid fa-minus" data-test="consume-lot-btn"
               @click="form.amount.value = 0">{{ $t('UseUp') }}</v-btn>
    </div>

    <v-number-input :label="$t('Amount')" :precision="2" v-model="form.amount.value"
                    v-if="bookingMode === 'add' || (bookingMode === 'edit' && form.editTab.value === 'amount')"></v-number-input>
    <model-select model="Unit" :label="$t('Unit')" allow-create v-model="form.unit.value" hide-details
                  v-if="bookingMode === 'add' || (bookingMode === 'edit' && form.editTab.value === 'amount')">
        <template #append-inner>
            <v-chip v-for="u in form.commonUnits.value" :key="u.id" @click="form.unit.value = u" size="small" class="mr-1">
                {{ u.name }}
            </v-chip>
        </template>
    </model-select>

    <v-date-input :label="$t('Expires')" v-model="form.expires.value" v-if="bookingMode === 'add'">
        <template #append-inner v-if="form.inventoryLocation.value?.isFreezer">
            <v-btn variant="text" data-test="freezer-expiry-btn" @click.stop="freezerExpiryDialog = true">
                <v-icon icon="fa-solid fa-snowflake"></v-icon>
                <expiry-preset-dialog v-model:date="form.expires.value" v-model="freezerExpiryDialog"></expiry-preset-dialog>
            </v-btn>
        </template>
    </v-date-input>
</template>

<script setup lang="ts">
import {ref} from "vue";
import ModelSelect from "@/components/inputs/ModelSelect.vue";
import ModelEditDialog from "@/components/dialogs/ModelEditDialog.vue";
import ClosableHelpAlert from "@/components/display/ClosableHelpAlert.vue";
import ExpiryPresetDialog from "@/components/dialogs/ExpiryPresetDialog.vue";
import {VDateInput} from "vuetify/components";
import type {useInventoryEntryForm} from "@/composables/useInventoryEntryForm.ts";
import type {InventoryLocation} from "@/openapi";

defineProps<{
    form: ReturnType<typeof useInventoryEntryForm>,
    bookingMode: string,
}>()

const freezerExpiryDialog = ref(false)
</script>
