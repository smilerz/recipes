/**
 * The device settings live in local storage (UserPreferenceStore keeps them there with useStorage). This is
 * where they are stored and a way to read one without the store, for code that must not depend on it
 * (the API client, which the store itself uses).
 */
export const DEVICE_SETTINGS_KEY = 'TANDOOR_DEVICE_SETTINGS'

/**
 * one device setting as it was persisted, undefined if it is not stored or the storage cannot be read
 */
export function readStoredDeviceSetting(key: string): unknown {
    try {
        return JSON.parse(localStorage.getItem(DEVICE_SETTINGS_KEY) ?? '{}')?.[key]
    } catch {
        return undefined
    }
}
