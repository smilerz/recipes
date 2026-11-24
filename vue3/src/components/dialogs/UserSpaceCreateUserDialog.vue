<template>
    <v-dialog max-width="600px" v-model="dialog">
        <v-card :loading="loading">
            <v-closable-card-title :title="$t('CreateUser')" :icon="TUserSpace.icon" v-model="dialog"></v-closable-card-title>
            <v-divider></v-divider>

            <v-card-text>
                <v-form @submit.prevent="createUser">
                    <v-text-field v-model="username" :label="$t('Username')" autocomplete="off" data-test="create-user-username"></v-text-field>
                    <v-text-field v-model="password" :label="$t('Password')" autocomplete="new-password" data-test="create-user-password"
                                  :type="showPassword ? 'text' : 'password'"
                                  :append-inner-icon="showPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'"
                                  @click:append-inner="showPassword = !showPassword"></v-text-field>
                    <v-text-field v-model="email" :label="$t('Email')" type="email" autocomplete="off" data-test="create-user-email"></v-text-field>
                    <v-select v-model="group" :label="$t('Group')" :items="groups" data-test="create-user-group"></v-select>
                </v-form>
            </v-card-text>

            <v-card-actions>
                <v-btn :disabled="loading" @click="dialog = false">{{ $t('Cancel') }}</v-btn>
                <v-btn color="create" :loading="loading" :disabled="!canSubmit" data-test="create-user-submit" @click="createUser">{{ $t('Create') }}</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
import {computed, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {ApiApi, GroupEnum, UserSpaceCreateUser} from "@/openapi";
import {TUserSpace} from "@/types/Models.ts";
import {ErrorMessageType, MessageType, useMessageStore} from "@/stores/MessageStore.ts";
import VClosableCardTitle from "@/components/dialogs/VClosableCardTitle.vue";

const emit = defineEmits(['created'])

const {t} = useI18n()

const dialog = defineModel<boolean>({default: false})

const username = ref('')
const password = ref('')
const email = ref('')
const group = ref<GroupEnum>(GroupEnum.User)
const showPassword = ref(false)
const loading = ref(false)

const groups = [
    {title: t('Guest'), value: GroupEnum.Guest},
    {title: t('User'), value: GroupEnum.User},
    {title: t('Admin'), value: GroupEnum.Admin},
]

const canSubmit = computed(() => username.value.trim() !== '' && password.value !== '' && !loading.value)

// a closed dialog must not keep the last password around
watch(dialog, (open) => {
    if (!open) {
        username.value = ''
        password.value = ''
        email.value = ''
        group.value = GroupEnum.User
        showPassword.value = false
    }
})

/**
 * create the user; the server validates the password and reports why it refuses one
 */
function createUser() {
    if (!canSubmit.value) return

    const request: UserSpaceCreateUser = {username: username.value.trim(), password: password.value, group: group.value}
    if (email.value.trim() !== '') request.email = email.value.trim()

    loading.value = true
    new ApiApi().apiUserSpaceCreateUserCreate({userSpaceCreateUser: request}).then(() => {
        useMessageStore().addMessage(MessageType.SUCCESS, t('UserCreated'), 5000)
        emit('created')
        dialog.value = false
    }).catch(err => {
        useMessageStore().addError(ErrorMessageType.CREATE_ERROR, err)
    }).finally(() => {
        loading.value = false
    })
}
</script>
