import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { makeUserPreference, makeServerSettings, makeSpace, makeUserSpace } from '@/__tests__/factories'
import { apiMock, resetApiMock } from '@/__tests__/api-mock'

vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    ApiApi: class { constructor() { return apiMock } },
    ResponseError: class extends Error { response: any; constructor(r: any) { super(); this.response = r } },
}))

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('vuetify', async (importOriginal) => ({
    ...(await importOriginal<typeof import('vuetify')>()),
    useTheme: () => ({ change: vi.fn() }),
}))

vi.mock('vue-router', () => ({
    useRouter: () => ({ push: vi.fn().mockResolvedValue(undefined) }),
}))

// Shared mutable ref so updateTheme's print-mode branch can be toggled per test.
const { printModeRef } = vi.hoisted(() => ({ printModeRef: { value: false } }))
vi.mock('@vueuse/router', () => ({
    useRouteQuery: () => printModeRef,
}))

vi.mock('@vueuse/core', async () => {
    const { ref } = await import('vue')
    return {
        useStorage: (_key: string, defaultValue: any) => ref(defaultValue),
    }
})

import { useUserPreferenceStore } from '@/stores/UserPreferenceStore'
import vuetify from '@/vuetify'

describe('UserPreferenceStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        resetApiMock()
    })

    describe('initial state', () => {
        it('starts unauthenticated', () => {
            const store = useUserPreferenceStore()
            expect(store.isAuthenticated).toBe(false)
        })

        it('starts with initCompleted false', () => {
            const store = useUserPreferenceStore()
            expect(store.initCompleted).toBe(false)
        })

        it('has default device settings', () => {
            const store = useUserPreferenceStore()
            expect(store.deviceSettings.shopping_show_checked_entries).toBe(false)
            expect(store.deviceSettings.mealplan_displayPeriod).toBe('week')
            expect(store.deviceSettings.search_itemsPerPage).toBe(50)
        })
    })

    describe('resetDeviceSettings', () => {
        it('resets device settings to defaults', () => {
            const store = useUserPreferenceStore()
            store.deviceSettings.search_itemsPerPage = 100
            store.deviceSettings.shopping_show_checked_entries = true

            store.resetDeviceSettings()

            expect(store.deviceSettings.search_itemsPerPage).toBe(50)
            expect(store.deviceSettings.shopping_show_checked_entries).toBe(false)
        })
    })

    describe('migrateStaleDeviceSettings', () => {
        // HighlightWhen no longer offers 'substitute' — tri-state onhand
        // covers that signal. Existing users with stale localStorage values
        // must be coerced so the dropdown shows a valid option.
        it("coerces recipe_contextMenuColor 'substitute' to 'onhand'", async () => {
            const {migrateStaleDeviceSettings} = await import('@/stores/UserPreferenceStore')
            const s: any = {recipe_contextMenuColor: 'substitute'}
            migrateStaleDeviceSettings(s)
            expect(s.recipe_contextMenuColor).toBe('onhand')
        })

        it('leaves other values untouched (idempotency)', async () => {
            const {migrateStaleDeviceSettings} = await import('@/stores/UserPreferenceStore')
            for (const v of ['onhand', 'shopping', 'never']) {
                const s: any = {recipe_contextMenuColor: v}
                migrateStaleDeviceSettings(s)
                expect(s.recipe_contextMenuColor).toBe(v)
            }
        })
    })

    describe('loadUserSettings', () => {
        it('sets userSettings and isAuthenticated on success', async () => {
            const store = useUserPreferenceStore()
            const prefs = makeUserPreference()
            apiMock.apiUserPreferenceList.mockResolvedValue([prefs])
            apiMock.apiUnitList.mockResolvedValue({ results: [] })

            await store.loadUserSettings()

            expect(store.userSettings).toEqual(prefs)
            expect(store.isAuthenticated).toBe(true)
        })

        it('does not set isAuthenticated when response is empty', async () => {
            const store = useUserPreferenceStore()
            apiMock.apiUserPreferenceList.mockResolvedValue([])
            apiMock.apiUnitList.mockResolvedValue({ results: [] })

            await store.loadUserSettings()

            expect(store.isAuthenticated).toBe(false)
        })
    })

    describe('activeUserSpace', () => {
        it('returns matching userSpace or null', () => {
            const store = useUserPreferenceStore()
            const us = makeUserSpace({ id: 10, space: 5 })

            store.activeSpace = makeSpace({ id: 5, name: 'Space 5' })
            store.userSpaces = [makeUserSpace({ space: 1 }), us]
            expect(store.activeUserSpace).toEqual(us)

            store.activeSpace = makeSpace({ id: 999 })
            expect(store.activeUserSpace).toBeNull()
        })
    })

    describe('navBarColor', () => {
        it('falls back to the theme tandoor token when no explicit colour is set', () => {
            const store = useUserPreferenceStore()
            store.activeSpace = makeSpace({ navBgColor: '' })
            store.userSettings = makeUserPreference({ navBgColor: '' })
            expect(store.navBarColor).toBe('tandoor')
        })

        it('uses the user colour when set and no space colour', () => {
            const store = useUserPreferenceStore()
            store.activeSpace = makeSpace({ navBgColor: '' })
            store.userSettings = makeUserPreference({ navBgColor: '#123456' })
            expect(store.navBarColor).toBe('#123456')
        })

        it('lets an explicit space colour override the user colour', () => {
            const store = useUserPreferenceStore()
            store.activeSpace = makeSpace({ navBgColor: '#abcdef' })
            store.userSettings = makeUserPreference({ navBgColor: '#123456' })
            expect(store.navBarColor).toBe('#abcdef')
        })
    })

    describe('updateTheme', () => {
        let changeSpy: ReturnType<typeof vi.spyOn>
        beforeEach(() => {
            changeSpy = vi.spyOn(vuetify.theme, 'change').mockImplementation(() => {})
            printModeRef.value = false
        })
        afterEach(() => {
            changeSpy.mockRestore()
            printModeRef.value = false
        })

        it.each([
            ['TANDOOR', 'light'],
            ['TANDOOR_DARK', 'dark'],
            ['CERULEAN', 'cerulean'],
            ['FLATLY', 'flat'],
            ['DARKLY', 'midnight'],
            ['SLATE', 'slate'],
        ])('maps theme %s to the %s Vuetify theme', (theme, expected) => {
            const store = useUserPreferenceStore()
            store.userSettings = makeUserPreference({ theme: theme as any })
            store.updateTheme()
            expect(changeSpy).toHaveBeenCalledWith(expected)
        })

        it('falls back to light for an unknown/legacy theme value', () => {
            const store = useUserPreferenceStore()
            store.userSettings = makeUserPreference({ theme: 'SUPERHERO' as any })
            store.updateTheme()
            expect(changeSpy).toHaveBeenCalledWith('light')
        })

        it('forces the light theme in print mode regardless of the stored theme', () => {
            printModeRef.value = true
            const store = useUserPreferenceStore()
            store.userSettings = makeUserPreference({ theme: 'DARKLY' as any })
            store.updateTheme()
            expect(changeSpy).toHaveBeenCalledWith('light')
            expect(changeSpy).not.toHaveBeenCalledWith('midnight')
        })
    })

    describe('init', () => {
        it('calls all load functions and sets initCompleted', async () => {
            const store = useUserPreferenceStore()
            apiMock.apiUserPreferenceList.mockResolvedValue([makeUserPreference()])
            apiMock.apiServerSettingsCurrentRetrieve.mockResolvedValue(makeServerSettings())
            apiMock.apiSpaceCurrentRetrieve.mockResolvedValue(makeSpace())
            apiMock.apiUserSpaceAllPersonalList.mockResolvedValue([makeUserSpace()])
            apiMock.apiSpaceList.mockResolvedValue({ results: [makeSpace()] })
            apiMock.apiUnitList.mockResolvedValue({ results: [] })

            await store.init()

            expect(store.initCompleted).toBe(true)
            expect(apiMock.apiUserPreferenceList).toHaveBeenCalled()
            expect(apiMock.apiServerSettingsCurrentRetrieve).toHaveBeenCalled()
            expect(apiMock.apiSpaceCurrentRetrieve).toHaveBeenCalled()
        })
    })
})
