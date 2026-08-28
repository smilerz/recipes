import {describe, it, expect, vi, beforeEach} from 'vitest'
import {shallowMount} from '@vue/test-utils'
import {createPinia, setActivePinia, type PiniaPlugin} from 'pinia'
import {useUserPreferenceStore} from '@/stores/UserPreferenceStore'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import {makeUserSpace, makeSpace, makeHousehold} from '@/__tests__/factories'

const {apiUserSpaceUpdateMock, addErrorMock} = vi.hoisted(() => ({
    apiUserSpaceUpdateMock: vi.fn(),
    addErrorMock: vi.fn(),
}))
vi.mock('@/openapi', async (imp) => ({
    ...(await imp<any>()),
    ApiApi: class {
        apiUserSpaceUpdate = apiUserSpaceUpdateMock
    },
}))
vi.mock('@/stores/MessageStore', async (imp) => ({
    ...(await imp<any>()),
    useMessageStore: () => ({addError: addErrorMock, addMessage: vi.fn(), addPreparedMessage: vi.fn()}),
}))
vi.mock('@vueuse/router', () => ({
    useRouteQuery: () => ({value: false}),
}))

import {createRouter, createMemoryHistory} from 'vue-router'
import HouseholdEditor from '@/components/model_editors/HouseholdEditor.vue'

function mountEditor(userSpace = makeUserSpace({id: 7, space: 1})) {
    const space = makeSpace({id: 1})
    const prePopulate: PiniaPlugin = ({store}) => {
        if (store.$id === 'user_preference_store') {
            store.userSpaces = [userSpace]
            store.activeSpace = space
        }
    }
    const pinia = createPinia()
    pinia.use(prePopulate)
    setActivePinia(pinia)
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components, directives})
    const router = createRouter({history: createMemoryHistory(), routes: []})
    const wrapper = shallowMount(HouseholdEditor, {
        global: {plugins: [pinia, i18n, vuetify, router]},
    })
    return {wrapper, store: useUserPreferenceStore()}
}

describe('HouseholdEditor "join after save" updates the store (activeUserSpace is a read-only computed)', () => {
    beforeEach(() => {
        apiUserSpaceUpdateMock.mockReset()
        addErrorMock.mockReset()
    })

    // onAfterSave() used to assign directly to activeUserSpace, a computed derived from
    // userSpaces - a silent no-op at runtime (Vue warns and drops writes to a setterless
    // computed), so the store's data never actually reflected the newly joined household.
    it('replaces the store entry with the server response, not just the pre-mutated local copy', async () => {
        // internalNote is a field the local pre-mutation step (userSpace.household = ...)
        // never touches, so it only ends up in the store if the *server response* actually
        // gets written back - distinguishing "store entry replaced with server response" from
        // "local object merely mutated in place before the request went out".
        const serverUserSpace = makeUserSpace({id: 7, space: 1, internalNote: 'server-set', household: makeHousehold({id: 9, name: 'New House'})})
        apiUserSpaceUpdateMock.mockResolvedValue(serverUserSpace)

        const {wrapper, store} = mountEditor()
        ;(wrapper.vm as any).joinAfterSave = true
        ;(wrapper.vm as any).editingObj = makeHousehold({id: 9, name: 'New House'})

        await (wrapper.vm as any).onAfterSave()
        await Promise.resolve()

        expect(apiUserSpaceUpdateMock).toHaveBeenCalled()
        expect(store.userSpaces[0].internalNote).toBe('server-set')
    })
})
