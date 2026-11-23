/**
 * UserSpaceCreateUserDialog: an admin creates a user with a username and password, without an invite.
 * The server owns the password rules; the dialog sends what was typed and reports the server's answer.
 */
import {describe, it, expect, vi, beforeEach} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {createPinia, setActivePinia} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'

import {apiMock, resetApiMock} from '@/__tests__/api-mock'

vi.mock('@/openapi', async (imp) => ({...(await imp<any>()), ApiApi: class { constructor() { return apiMock } }}))
vi.mock('@vueuse/core', async (imp) => ({...(await imp<any>()), useStorage: (_key: string, defaultValue: any) => ({value: defaultValue})}))

const {addMessageMock, addErrorMock} = vi.hoisted(() => ({addMessageMock: vi.fn(), addErrorMock: vi.fn()}))
vi.mock('@/stores/MessageStore', async (imp) => ({...(await imp<any>()), useMessageStore: () => ({addMessage: addMessageMock, addError: addErrorMock})}))

import UserSpaceCreateUserDialog from '@/components/dialogs/UserSpaceCreateUserDialog.vue'

function mountDialog() {
    const pinia = createPinia()
    setActivePinia(pinia)
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})
    return mount(UserSpaceCreateUserDialog, {
        attachTo: document.body,
        props: {modelValue: true},
        global: {
            plugins: [pinia, i18n, vuetify],
            stubs: {VClosableCardTitle: {template: '<div class="title-stub" />'}},
        },
    })
}

async function type(selector: string, value: string) {
    const input = document.querySelector(`${selector} input`) as HTMLInputElement
    input.value = value
    input.dispatchEvent(new Event('input'))
    await flushPromises()
}

const submit = () => document.querySelector('[data-test="create-user-submit"]') as HTMLButtonElement

describe('UserSpaceCreateUserDialog', () => {
    beforeEach(() => {
        resetApiMock()
        addMessageMock.mockClear()
        addErrorMock.mockClear()
        document.body.innerHTML = ''
    })

    it('cannot be submitted until a username and a password are entered', async () => {
        mountDialog()
        await flushPromises()
        expect(submit().disabled).toBe(true)

        await type('[data-test="create-user-username"]', 'newcook')
        expect(submit().disabled).toBe(true)

        await type('[data-test="create-user-password"]', 'Tr0ub4dor-and-3-horses')
        expect(submit().disabled).toBe(false)
    })

    it('sends the typed username and password with the default group, and no empty email', async () => {
        apiMock.apiUserSpaceCreateUserCreate.mockResolvedValue({id: 9})
        mountDialog()
        await type('[data-test="create-user-username"]', 'newcook')
        await type('[data-test="create-user-password"]', 'Tr0ub4dor-and-3-horses')

        submit().click()
        await flushPromises()

        expect(apiMock.apiUserSpaceCreateUserCreate).toHaveBeenCalledTimes(1)
        expect(apiMock.apiUserSpaceCreateUserCreate.mock.calls[0][0]).toEqual({
            userSpaceCreateUser: {username: 'newcook', password: 'Tr0ub4dor-and-3-horses', group: 'user'},
        })
    })

    it('tells the list a user was created and closes', async () => {
        apiMock.apiUserSpaceCreateUserCreate.mockResolvedValue({id: 9})
        const wrapper = mountDialog()
        await type('[data-test="create-user-username"]', 'newcook')
        await type('[data-test="create-user-password"]', 'Tr0ub4dor-and-3-horses')

        submit().click()
        await flushPromises()

        expect(wrapper.emitted('created')).toHaveLength(1)
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
        expect(addMessageMock).toHaveBeenCalled()
    })

    it("keeps the dialog open and reports the server's error when the password is refused", async () => {
        const failure = new Error('weak password')
        apiMock.apiUserSpaceCreateUserCreate.mockRejectedValue(failure)
        const wrapper = mountDialog()
        await type('[data-test="create-user-username"]', 'newcook')
        await type('[data-test="create-user-password"]', 'password')

        submit().click()
        await flushPromises()

        expect(addErrorMock).toHaveBeenCalledWith(expect.anything(), failure)
        expect(wrapper.emitted('created')).toBeUndefined()
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
        expect(submit().disabled).toBe(false)
    })
})
