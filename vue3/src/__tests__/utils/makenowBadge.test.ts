import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createMakenowBadgeMiddleware, makenowBadgeMiddleware } from '@/utils/makenowBadge'
import { DEVICE_SETTINGS_KEY, readStoredDeviceSetting } from '@/utils/deviceSettingsStorage'
import { DefaultConfig } from '@/openapi/runtime'

const ask = async (middleware: ReturnType<typeof createMakenowBadgeMiddleware>, url: string, method?: string) =>
    middleware.pre!({ fetch: fetch, url, init: { method } } as any)

describe('createMakenowBadgeMiddleware', () => {
    const on = createMakenowBadgeMiddleware(() => true)

    it.each([
        ['/api/recipe/', '/api/recipe/?makenow_badge=true'],
        ['/api/recipe/?page=2&query=soup', '/api/recipe/?page=2&query=soup&makenow_badge=true'],
        ['/api/recipe-book-entry/?book=3', '/api/recipe-book-entry/?book=3&makenow_badge=true'],
        ['/sub/path/api/recipe/?filter=1', '/sub/path/api/recipe/?filter=1&makenow_badge=true'],
        ['http://127.0.0.1:8000/api/recipe/', 'http://127.0.0.1:8000/api/recipe/?makenow_badge=true'],
    ])('asks for make now on the list request %s', async (url, expected) => {
        expect((await ask(on, url, 'GET'))?.url).toBe(expected)
    })

    it('treats a request without a method as a GET', async () => {
        expect((await ask(on, '/api/recipe/'))?.url).toBe('/api/recipe/?makenow_badge=true')
    })

    it('keeps the rest of the request as it was', async () => {
        const init = { method: 'GET', headers: { a: 'b' } }
        const result = await on.pre!({ fetch, url: '/api/recipe/', init } as any)
        expect(result?.init).toBe(init)
    })

    it.each([
        '/api/recipe/12/',
        '/api/recipe/12/?share=abc',
        '/api/recipe/flat/',
        '/api/recipe/stats/',
        '/api/recipe-image/',
        '/api/food/',
        '/api/meal-plan/?from_date=2026-01-01',
    ])('leaves %s alone', async (url) => {
        expect(await ask(on, url, 'GET')).toBeUndefined()
    })

    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('leaves a %s of the list url alone', async (method) => {
        expect(await ask(on, '/api/recipe/', method)).toBeUndefined()
    })

    it('does not ask twice when the caller already did', async () => {
        expect(await ask(on, '/api/recipe/?makenow_badge=true', 'GET')).toBeUndefined()
        expect(await ask(on, '/api/recipe/?makenow_badge=false', 'GET')).toBeUndefined()
    })

    it('asks for nothing while the make now badge is off', async () => {
        expect(await ask(createMakenowBadgeMiddleware(() => false), '/api/recipe/', 'GET')).toBeUndefined()
    })

    it('asks the given function every time, so it follows the setting from request to request', async () => {
        let badge = false
        const middleware = createMakenowBadgeMiddleware(() => badge)
        expect(await ask(middleware, '/api/recipe/', 'GET')).toBeUndefined()
        badge = true
        expect((await ask(middleware, '/api/recipe/', 'GET'))?.url).toBe('/api/recipe/?makenow_badge=true')
    })
})

describe('the default makenowBadgeMiddleware', () => {
    beforeEach(() => localStorage.clear())
    afterEach(() => localStorage.clear())

    it('is part of the default configuration, so every API client has it and no caller can opt out', () => {
        expect(DefaultConfig.middleware).toContain(makenowBadgeMiddleware)
    })

    it('follows the persisted device setting, without any registration', async () => {
        expect(await ask(makenowBadgeMiddleware, '/api/recipe/', 'GET')).toBeUndefined()
        localStorage.setItem(DEVICE_SETTINGS_KEY, JSON.stringify({ card_showMakeNowBadge: true }))
        expect((await ask(makenowBadgeMiddleware, '/api/recipe/', 'GET'))?.url).toBe('/api/recipe/?makenow_badge=true')
        localStorage.setItem(DEVICE_SETTINGS_KEY, JSON.stringify({ card_showMakeNowBadge: false }))
        expect(await ask(makenowBadgeMiddleware, '/api/recipe/', 'GET')).toBeUndefined()
    })

    it.each(['not json', '[]', 'null', '"x"', '{"card_showMakeNowBadge": "yes"}'])('is off when the stored settings are %s', async (stored) => {
        localStorage.setItem(DEVICE_SETTINGS_KEY, stored)
        expect(await ask(makenowBadgeMiddleware, '/api/recipe/', 'GET')).toBeUndefined()
    })
})

describe('readStoredDeviceSetting', () => {
    beforeEach(() => localStorage.clear())
    afterEach(() => localStorage.clear())

    it('reads one setting from the persisted device settings', () => {
        localStorage.setItem(DEVICE_SETTINGS_KEY, JSON.stringify({ a: 1, b: 'x' }))
        expect(readStoredDeviceSetting('a')).toBe(1)
        expect(readStoredDeviceSetting('b')).toBe('x')
    })

    it('gives undefined for a setting that is not stored, nothing stored, or unreadable storage', () => {
        expect(readStoredDeviceSetting('a')).toBeUndefined()
        localStorage.setItem(DEVICE_SETTINGS_KEY, JSON.stringify({ b: 1 }))
        expect(readStoredDeviceSetting('a')).toBeUndefined()
        localStorage.setItem(DEVICE_SETTINGS_KEY, 'not json')
        expect(readStoredDeviceSetting('a')).toBeUndefined()
    })
})
