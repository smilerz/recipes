<template>
    <template v-if="form.bookingConfirmEntry.value">
        <v-card v-if="wrapInCard" variant="outlined">
            <v-card-text>
                <p>
                    {{ ingredientToString({food: form.bookingConfirmEntry.value.food, unit: form.bookingConfirmEntry.value.unit, amount: form.bookingConfirmEntry.value.amount} as Ingredient) }}
                </p>

                <p class="text-disabled mt-4">{{ $t('Code') }}</p>
                <p class="text-h3 text-pre">
                    #{{ form.bookingConfirmEntry.value.code }}
                </p>

                <template v-if="form.bookingConfirmEntry.value.expires">
                    <p class="text-disabled mt-4">{{ $t('Expires') }}</p>
                    <p>
                        <v-chip label :color="(form.bookingConfirmEntry.value.expires < DateTime.now() ? 'error' : 'success')">
                            {{ DateTime.fromJSDate(form.bookingConfirmEntry.value.expires).toLocaleString(DateTime.DATE_MED) }}
                        </v-chip>
                    </p>
                </template>
            </v-card-text>
        </v-card>
        <template v-else>
            <p>
                {{ ingredientToString({food: form.bookingConfirmEntry.value.food, unit: form.bookingConfirmEntry.value.unit, amount: form.bookingConfirmEntry.value.amount} as Ingredient) }}
            </p>

            <p class="text-disabled mt-4">{{ $t('Code') }}</p>
            <p class="text-h3 text-pre">
                #{{ form.bookingConfirmEntry.value.code }}
            </p>

            <template v-if="form.bookingConfirmEntry.value.expires">
                <p class="text-disabled mt-4">{{ $t('Expires') }}</p>
                <p>
                    <v-chip label :color="(form.bookingConfirmEntry.value.expires < DateTime.now() ? 'error' : 'success')">
                        {{ DateTime.fromJSDate(form.bookingConfirmEntry.value.expires).toLocaleString(DateTime.DATE_MED) }}
                    </v-chip>
                </p>
            </template>
        </template>

        <v-select
            v-model="form.selectedCopyOptions.value"
            chips
            class="mt-6"
            :label="$t('Copy')"
            :items="form.copyOptions"
            multiple
            hide-details
        >
        </v-select>
        <div class="mt-4 d-flex flex-column ga-2">
            <v-btn block color="create" prepend-icon="$copy" @click="form.copyConfirmEntry">{{ $t('Copy') }}</v-btn>
            <slot name="extra-actions"></slot>
            <v-btn block color="cancel" prepend-icon="$close" @click="emit('close')">{{ $t('Close') }}</v-btn>
        </div>
    </template>
</template>

<script setup lang="ts">
import {DateTime} from "luxon";
import {ingredientToString} from "@/utils/model_utils.ts";
import type {Ingredient} from "@/openapi";
import type {useInventoryEntryForm} from "@/composables/useInventoryEntryForm.ts";

defineProps<{
    form: ReturnType<typeof useInventoryEntryForm>,
    /** Nest the summary in an outlined v-card — for a host that reuses one card across
     * add/edit/confirm modes (PantryBookingDialog) and needs visual separation. A host that already
     * shows the confirm step in its own dedicated dialog (InventoryBookingPage) doesn't need it. */
    wrapInCard?: boolean,
}>()

const emit = defineEmits<{close: []}>()
</script>
