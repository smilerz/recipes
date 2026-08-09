<template>

    <v-data-table-server
        return-object
        @update:options="loadItems"
        :items="items"
        :items-length="itemCount"
        :loading="tableLoading"
        :headers="tableHeaders"
        :page="page"
        :items-per-page="pageSize"
        :hide-default-footer="itemCount <= pageSize"
        disable-sort
    >

        <!-- mobile: the 4-5 column table doesn't fit narrow viewports without clipping
             (#39) - collapse header + each row into a single stacked cell instead -->
        <template v-if="mobile" #headers>
            <tr><th class="pa-0" :colspan="tableHeaders.length"></th></tr>
        </template>

        <template v-if="mobile" #item="{item}">
            <tr>
                <td :colspan="tableHeaders.length" class="py-2">
                    <div class="d-flex justify-space-between align-center">
                        <div>
                            <v-chip label size="small" color="success" v-if="item.bookingType == 'add'">{{ $t('Added') }}</v-chip>
                            <v-chip label size="small" color="error" v-else-if="item.bookingType == 'remove'">{{ $t('Removed') }}</v-chip>
                            <v-chip label size="small" color="info" v-else>{{ $t('Moved') }}</v-chip>
                            <div class="text-caption text-medium-emphasis mt-1">{{ DateTime.fromJSDate(item.createdAt).toLocaleString(DateTime.DATE_MED) }}</div>
                        </div>
                        <div class="text-end">
                            <div>
                                <template v-if="item.oldAmount != item.newAmount">{{ $n(item.oldAmount) }} <i class="fa-solid fa-arrow-right"></i> {{ $n(item.newAmount) }}</template>
                                <template v-else>{{ $n(item.newAmount) }}</template>
                            </div>
                            <div class="text-caption text-medium-emphasis">
                                <template v-if="item.oldInventoryLocation.id != item.newInventoryLocation.id">{{ item.oldInventoryLocation.name }} <i class="fa-solid fa-arrow-right"></i> {{ item.newInventoryLocation.name }}</template>
                                <template v-else>{{ item.newInventoryLocation.name }}</template>
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        </template>

        <template #item.bookingType="{item}">
            <v-chip label color="success" v-if="item.bookingType == 'add'">{{ $t('Added') }}</v-chip>
            <v-chip label color="error" v-else-if="item.bookingType == 'remove'">{{ $t('Removed') }}</v-chip>
            <v-chip label color="info" v-else>{{ $t('Moved') }}</v-chip>
        </template>

        <template #item.createdAt="{item}">
            {{ DateTime.fromJSDate(item.createdAt).toLocaleString(DateTime.DATETIME_MED) }}
        </template>

        <template #item.amount="{item}">
            <template v-if="item.oldAmount != item.newAmount">
                {{ $n(item.oldAmount) }} <i class="fa-solid fa-arrow-right"></i> {{ $n(item.newAmount) }}
            </template>
            <template v-else>
                {{ $n(item.newAmount) }}
            </template>
        </template>

        <template #item.location="{item}">
            <template v-if="item.oldInventoryLocation.id != item.newInventoryLocation.id">
                {{ item.oldInventoryLocation.name }} <i class="fa-solid fa-arrow-right"></i> {{ item.newInventoryLocation.name }}
            </template>
            <template v-else>
                {{ item.newInventoryLocation.name }}
            </template>
        </template>

    </v-data-table-server>

</template>

<script setup lang="ts">
import VClosableCardTitle from "@/components/dialogs/VClosableCardTitle.vue";
import {computed, PropType, ref, watch} from "vue";
import {ApiApi, ApiInventoryLogListRequest, Ingredient, InventoryEntry, InventoryLog} from "@/openapi";
import {DateTime} from "luxon";
import {ingredientToString} from "@/utils/model_utils.ts";
import {VDataTableUpdateOptions} from "@/vuetify.ts";
import {ErrorMessageType, useMessageStore} from "@/stores/MessageStore.ts";
import {useI18n} from "vue-i18n";
import {useDisplay} from "vuetify";

const {t} = useI18n()
const {mobile} = useDisplay()

const props = defineProps({
    inventoryEntry: {type: {} as PropType<InventoryEntry>, required: false},
    updateTrigger: {type: Boolean, required: false},
})

const tableLoading = ref(false)

const items = ref([] as InventoryLog[])
const itemCount = ref(0)
const page = ref(1)
const pageSize = ref(10)


const tableHeaders = computed(() => {
    let headers = [
        {title: t('BookingType'), key: 'bookingType'},
        {title: t('Date'), key: 'createdAt'},

    ]

    if (!props.inventoryEntry) {
        headers.push({title: t('Food'), key: 'entry.food.name'})
    }

    headers.push({title: t('Amount'), key: 'amount'})
    headers.push({title: t('InventoryLocation'), key: 'location'})

    return headers
})

watch(() => props.updateTrigger, () => {
    loadItems({page: 1, itemsPerPage: pageSize.value})
})

/**
 * load logs for selected inventory entry
 */
function loadItems(options: VDataTableUpdateOptions) {
    let api = new ApiApi()

    tableLoading.value = true

    page.value = options.page
    pageSize.value = options.itemsPerPage

    let parameters = {page: page.value, pageSize: pageSize.value} as ApiInventoryLogListRequest
    if (props.inventoryEntry) {
        parameters.entryId = props.inventoryEntry.id!
    }

    api.apiInventoryLogList(parameters).then((r: any) => {
        items.value = r.results
        itemCount.value = r.count
    }).catch((err: any) => {
        useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
    }).finally(() => {
        tableLoading.value = false
    })

}

</script>

<style scoped>

</style>