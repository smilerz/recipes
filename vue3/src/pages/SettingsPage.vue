<template>
    <v-container>
        <v-row>
            <!-- on a phone the menu and a page are two screens: /settings is the menu, a page is shown alone with a way back -->
            <v-col v-if="!mobile || atMenu" cols="12" md="3" offset-md="1" offset-xl="2" xl="2" data-test="settings-menu">
                <v-list class="bg-transparent">
                    <v-list-item :to="{name: 'AccountSettings'}" prepend-icon="fa-solid fa-user">{{ $t('Profile') }}</v-list-item>

                    <v-divider></v-divider>
                    <v-list-subheader>{{ $t('Settings') }}</v-list-subheader>
                    <v-list-item :to="{name: 'CosmeticSettings'}" prepend-icon="fa-solid fa-palette">{{ $t('Appearance') }}</v-list-item>
                    <v-list-item :to="{name: 'StartPageSettingsPage'}" prepend-icon="fa-solid fa-house">{{ $t('Home') }}</v-list-item>
                    <v-list-item :to="{name: 'ShoppingSettings'}" prepend-icon="$shopping">{{ $t('Shopping_list') }}</v-list-item>
                    <v-list-item :to="{name: 'MealPlanSettings'}" prepend-icon="$mealplan">{{ $t('Meal_Plan') }}</v-list-item>
                    <v-list-item :to="{name: 'SearchSettings'}" prepend-icon="$search">{{ $t('Search') }}</v-list-item>
                    <v-divider></v-divider>
                    <v-list-subheader>Space</v-list-subheader>
                    <v-list-item :to="{name: 'SpaceSettings'}" prepend-icon="$settings">{{ $t('SpaceSettings') }}</v-list-item>
                    <v-list-item :to="{name: 'OpenDataImportSettings'}" prepend-icon="fa-solid fa-cloud-arrow-down">{{ $t('Open_Data_Import') }}</v-list-item>
                    <v-list-item :to="{name: 'ExportDataSettings'}" prepend-icon="fa-solid fa-file-export">{{ $t('Export') }}</v-list-item>
                    <v-list-item :to="{name: 'PortableDataImportSettings'}" prepend-icon="fa-solid fa-file-import">{{ $t('PortableDataImport') }}</v-list-item>
                    <v-list-item :to="{name: 'SpaceBackupSettings'}" prepend-icon="fa-solid fa-clock-rotate-left">{{ $t('Backup') }}</v-list-item>

                    <template v-for="p in TANDOOR_PLUGINS" :key="p.name">
                        <component :is="p.settingsComponent" v-if="p.settingsComponent"></component>
                    </template>

                    <v-divider></v-divider>
                    <v-list-subheader>Admin</v-list-subheader>
                    <v-list-item :to="{name: 'ApiSettings'}" prepend-icon="fa-solid fa-code">{{ $t('API') }}</v-list-item>
                    <v-list-item :href="getDjangoUrl('system')" target="_blank" prepend-icon="fa-solid fa-server">{{ $t('System') }}</v-list-item>
                </v-list>

            </v-col>
            <v-col v-if="!mobile || !atMenu" cols="12" md="7" xl="6" data-test="settings-content">
                <v-btn v-if="mobile" variant="text" class="text-none mb-2" prepend-icon="fa-solid fa-chevron-left" :to="{name: 'SettingsPage'}" data-test="settings-back">
                    {{ $t('Settings') }}
                </v-btn>
                <router-view/>

            </v-col>
        </v-row>
    </v-container>
</template>

<script setup lang="ts">

import {computed, watch} from "vue";
import {useRoute, useRouter} from "vue-router";
import {useDisplay} from "vuetify";
import {useDjangoUrls} from "@/composables/useDjangoUrls";
import {TANDOOR_PLUGINS} from "@/plugin_registry.ts";

const {getDjangoUrl} = useDjangoUrls()
const {mobile} = useDisplay()
const route = useRoute()
const router = useRouter()

// no page chosen: the menu itself
const atMenu = computed(() => route.name === 'SettingsPage')

// a desktop shows a page next to the menu, so the bare /settings opens Profile; a phone keeps the menu
watch([atMenu, mobile], ([menu, phone]) => {
    if (menu && !phone) router.replace({name: 'AccountSettings'})
}, {immediate: true})

</script>


<style scoped>

</style>