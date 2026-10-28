/**
 * Makes every request for a list of recipes ask the server which of them can be made now, as long as the
 * make now badge is turned on. It sits in the default configuration of the API client, so it is not up to
 * the page or component that asks for recipes (and a new one cannot forget it).
 */
import type {Middleware} from "@/openapi/runtime";
import {readStoredDeviceSetting} from "@/utils/deviceSettingsStorage";

// the list urls (not a single recipe, /flat/, /stats/ or other endpoints that merely start the same)
const LIST_URL = /\/api\/(recipe|recipe-book-entry)\/(\?|$)/

/**
 * @param isBadgeOn asked for every request
 */
export function createMakenowBadgeMiddleware(isBadgeOn: () => boolean): Middleware {
    return {
        async pre(context) {
            if (!isBadgeOn() || (context.init.method ?? 'GET') !== 'GET' || !LIST_URL.test(context.url) || context.url.includes('makenow_badge=')) return
            return {url: context.url + (context.url.includes('?') ? '&' : '?') + 'makenow_badge=true', init: context.init}
        },
    }
}

/**
 * the middleware of the default API configuration, it reads the persisted device setting, so it needs no
 * registration and does not depend on the store having been created
 */
export const makenowBadgeMiddleware = createMakenowBadgeMiddleware(() => readStoredDeviceSetting('card_showMakeNowBadge') === true)
