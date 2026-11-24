<template>
    <!-- the meal plan's settings and actions, in the page's own drawer like the shopping list's: pinnable beside the page on a
         desktop, a bottom sheet on a phone (where it is also the only way to the Auto Planner and the calendar export) -->
    <tabbed-drawer v-model="open" v-model:pinned="settings.isPinned.value" :tabs="TABS">
        <template #settings>
            <v-list>
                <template v-if="showingCalendar">
                    <v-list-subheader>{{ $t('Calendar') }}</v-list-subheader>
                    <v-list-item>
                        <meal-plan-device-settings></meal-plan-device-settings>
                    </v-list-item>
                </template>

                <v-list-subheader>{{ $t('Meal_Type') }}</v-list-subheader>
                <v-list-item>
                    <meal-plan-meal-type-legend></meal-plan-meal-type-legend>
                </v-list-item>

                <v-divider></v-divider>
                <v-list-item prepend-icon="fa-solid fa-calendar-plus" link>
                    {{ $t('Auto_Planner') }}
                    <auto-plan-dialog></auto-plan-dialog>
                </v-list-item>
                <meal-plan-ical-dialog></meal-plan-ical-dialog>
            </v-list>
        </template>
    </tabbed-drawer>
</template>

<script setup lang="ts">
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import TabbedDrawer from "@/components/common/TabbedDrawer.vue";
import MealPlanDeviceSettings from "@/components/settings/MealPlanDeviceSettings.vue";
import MealPlanMealTypeLegend from "@/components/display/MealPlanMealTypeLegend.vue";
import AutoPlanDialog from "@/components/dialogs/AutoPlanDialog.vue";
import MealPlanIcalDialog from "@/components/dialogs/MealPlanIcalDialog.vue";
import {useModelListSettings} from "@/composables/modellist/useModelListSettings";

const {t} = useI18n()

defineProps({
    // the calendar settings only affect the calendar, so they are offered only while it is showing
    showingCalendar: {type: Boolean, required: true},
})

const open = defineModel<boolean>({default: false})

const settings = useModelListSettings(computed(() => 'mealplan'))

// a single tab: no tab bar, the label only titles the phone's sheet
const TABS = [{key: 'settings', label: t('Meal_Plan'), icon: 'fa-solid fa-sliders'}]
</script>
