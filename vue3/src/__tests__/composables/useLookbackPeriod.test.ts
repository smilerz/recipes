import {beforeEach, describe, expect, it, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {useUserPreferenceStore} from '@/stores/UserPreferenceStore'
import {useLookbackPeriod} from '@/composables/useLookbackPeriod'

// Creating the real preference store touches the router, the theme and i18n; the store's own tests mock them the same way.
vi.mock('vue-i18n', () => ({useI18n: () => ({t: (key: string) => key})}))
vi.mock('vue-router', () => ({useRouter: () => ({push: vi.fn().mockResolvedValue(undefined)})}))
vi.mock('@vueuse/router', () => ({useRouteQuery: () => ({value: false})}))
vi.mock('vuetify', async (importOriginal) => ({...(await importOriginal<typeof import('vuetify')>()), useTheme: () => ({change: vi.fn()})}))

describe('useLookbackPeriod', () => {
    beforeEach(() => {
        localStorage.clear()
        setActivePinia(createPinia())
    })

    it('offers 7, 30 and 90 days and starts Use up on 7', () => {
        const {days, options} = useLookbackPeriod('useUp')
        expect(days.value).toBe(7)
        expect(options.value).toEqual([7, 30, 90])
    })

    it('starts Stock up on the shopping list\'s recent-days setting and offers it beside the standard periods', () => {
        useUserPreferenceStore().userSettings.shoppingRecentDays = 14
        const {days, options} = useLookbackPeriod('stockUp')
        expect(days.value).toBe(14)
        expect(options.value).toEqual([7, 14, 30, 90])
    })

    it('starts Stock up on 7 days when the shopping list has no recent-days setting', () => {
        useUserPreferenceStore().userSettings.shoppingRecentDays = 0
        expect(useLookbackPeriod('stockUp').days.value).toBe(7)
    })

    it('remembers a choice on the device, separately for each dialog', () => {
        const stockUp = useLookbackPeriod('stockUp')
        const useUp = useLookbackPeriod('useUp')
        stockUp.days.value = 90

        expect(useUserPreferenceStore().deviceSettings.pantry_stockUpLookbackDays).toBe(90)
        expect(useLookbackPeriod('stockUp').days.value).toBe(90)
        expect(useUp.days.value).toBe(7)
        expect(useUserPreferenceStore().deviceSettings.pantry_useUpLookbackDays).toBe(7)
    })

    it('prefers the remembered choice over the shopping list setting and stops offering that setting', () => {
        useUserPreferenceStore().userSettings.shoppingRecentDays = 14
        const {days, options} = useLookbackPeriod('stockUp')
        days.value = 30
        expect(days.value).toBe(30)
        expect(options.value).toEqual([7, 30, 90])
    })

    it('ignores a remembered value that is not a positive number', () => {
        useUserPreferenceStore().deviceSettings.pantry_useUpLookbackDays = -5
        expect(useLookbackPeriod('useUp').days.value).toBe(7)
    })

    it('gives the start of the window as that many whole days before now', () => {
        const {days, since} = useLookbackPeriod('useUp')
        days.value = 30
        const now = new Date('2026-10-17T12:00:00Z')
        expect(since(now)).toEqual(new Date('2026-09-17T12:00:00Z'))
    })
})
