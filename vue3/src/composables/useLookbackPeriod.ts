import {computed} from 'vue'
import {useUserPreferenceStore} from '@/stores/UserPreferenceStore'

export const LOOKBACK_PERIODS = [7, 30, 90]
export type LookbackScope = 'stockUp' | 'useUp'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DEFAULT_DAYS = 7

const isPeriod = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0

/**
 * How far back a Stock up / Use up dialog looks, remembered on this device per dialog. Stock up starts on the shopping
 * list's recent-days setting (7 when that is unset), Use up on 7 days. `options` is 7, 30 and 90 plus the current value
 * when it is something else, and `since` is the start of the window.
 */
export function useLookbackPeriod(scope: LookbackScope) {
    const store = useUserPreferenceStore()
    const key = scope === 'stockUp' ? 'pantry_stockUpLookbackDays' : 'pantry_useUpLookbackDays'

    const days = computed<number>({
        get() {
            const chosen = store.deviceSettings[key]
            if (isPeriod(chosen)) return chosen
            const shopping = store.userSettings.shoppingRecentDays
            return scope === 'stockUp' && isPeriod(shopping) ? shopping : DEFAULT_DAYS
        },
        set(value) {
            store.deviceSettings[key] = value
        },
    })

    const options = computed(() => Array.from(new Set([...LOOKBACK_PERIODS, days.value])).sort((a, b) => a - b))

    function since(now: Date = new Date()): Date {
        return new Date(now.getTime() - days.value * MS_PER_DAY)
    }

    return {days, options, since}
}
