/**
 * The make now badge setting lives in the device settings of UserPreferenceStore (persisted by useStorage) and the
 * API client reads it from there (utils/makenowBadge.ts). Unlike UserPreferenceStore.test.ts this uses the real
 * useStorage, because the point is that what the store persists is what the API client acts on.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { apiMock, resetApiMock } from '@/__tests__/api-mock'

vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    ApiApi: class { constructor() { return apiMock } },
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('vuetify', async (importOriginal) => ({ ...(await importOriginal<typeof import('vuetify')>()), useTheme: () => ({ change: vi.fn() }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn().mockResolvedValue(undefined) }) }))
vi.mock('@vueuse/router', () => ({ useRouteQuery: () => ({ value: false }) }))

import { useUserPreferenceStore } from '@/stores/UserPreferenceStore'
import { makenowBadgeMiddleware } from '@/utils/makenowBadge'

const ask = () => makenowBadgeMiddleware.pre!({ fetch, url: '/api/recipe/', init: { method: 'GET' } } as any)

describe('make now badge setting of UserPreferenceStore', () => {
    beforeEach(() => {
        localStorage.clear()
        setActivePinia(createPinia())
        resetApiMock()
    })
    afterEach(() => localStorage.clear())

    it('is off by default, so the API client does not ask for make now', async () => {
        const store = useUserPreferenceStore()
        expect(store.deviceSettings.card_showMakeNowBadge).toBe(false)
        expect(await ask()).toBeUndefined()
    })

    it('makes the API client ask for make now once the setting is turned on, and stop when it is turned off', async () => {
        const store = useUserPreferenceStore()
        store.deviceSettings.card_showMakeNowBadge = true
        await nextTick()
        expect((await ask())?.url).toBe('/api/recipe/?makenow_badge=true')
        store.deviceSettings.card_showMakeNowBadge = false
        await nextTick()
        expect(await ask()).toBeUndefined()
    })

    it('still applies in a new session, before any store exists, because it is read from what was persisted', async () => {
        useUserPreferenceStore().deviceSettings.card_showMakeNowBadge = true
        await nextTick()
        setActivePinia(createPinia())
        expect((await ask())?.url).toBe('/api/recipe/?makenow_badge=true')
    })
})
