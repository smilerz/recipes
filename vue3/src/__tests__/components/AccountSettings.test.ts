import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia, type PiniaPlugin } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createVuetify } from 'vuetify'
import { apiMock, resetApiMock } from '@/__tests__/api-mock'

vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    ApiApi: class { constructor() { return apiMock } },
}))
vi.mock('@vueuse/core', async () => {
    const { ref } = await import('vue')
    return { useStorage: (_k: string, d: any) => ref(d) }
})
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn().mockResolvedValue(undefined) }) }))
vi.mock('@vueuse/router', () => ({ useRouteQuery: () => ({ value: false }) }))
vi.mock('vue-i18n', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    useI18n: () => ({ t: (k: string) => k }),
}))

import AccountSettings from '@/components/settings/AccountSettings.vue'
import { useMessageStore } from '@/stores/MessageStore'

function mountSettings() {
    const prePopulate: PiniaPlugin = ({ store }) => {
        if (store.$id === 'user_preference_store') {
            store.userSettings = {
                user: { id: 1, displayName: 'Test User' },
                image: null,
            } as any
        }
    }
    const pinia = createPinia()
    pinia.use(prePopulate)
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false })
    const vuetify = createVuetify()
    return mount(AccountSettings, {
        global: {
            plugins: [pinia, i18n, vuetify],
            stubs: {
                ThankYouNote: { template: '<div/>' },
                UserFileField: { template: '<div/>' },
                MessageListDialog: { template: '<div/>' },
            },
        },
    })
}

describe('AccountSettings', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        resetApiMock()
        ;(apiMock as any).apiUserRetrieve = vi.fn().mockResolvedValue({ id: 1, username: 'test', firstName: '', lastName: '' })
        ;(apiMock as any).apiUserPartialUpdate = vi.fn().mockResolvedValue({ id: 1, username: 'test', firstName: 'New', lastName: '' })
        apiMock.apiUserPreferencePartialUpdate.mockResolvedValue({ user: { id: 1 } })
    })

    // save() fires its own PreparedMessage.UPDATE_SUCCESS AND calls updateUserSettings() with
    // its default (non-silent) argument, which fires the SAME message a second time - a
    // duplicate success toast on every save.
    it('shows only one success toast per save (no duplicate from updateUserSettings)', async () => {
        const wrapper = mountSettings()
        await flushPromises()

        const spy = vi.spyOn(useMessageStore(), 'addPreparedMessage')

        ;(wrapper.vm as any).save()
        await flushPromises()

        expect(spy).toHaveBeenCalledTimes(1)

        wrapper.unmount()
    })
})
