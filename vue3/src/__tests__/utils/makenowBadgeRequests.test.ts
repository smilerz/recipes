/**
 * The whole chain: the real generated API client with its default configuration, only the network replaced.
 * What goes out on the wire is what the server sees, so this is where "the make now badge is asked for on
 * every recipe list, and only there" is pinned down.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ApiApi } from '@/openapi'
import { DEVICE_SETTINGS_KEY } from '@/utils/deviceSettingsStorage'

const fetchMock = vi.fn()
const requestedUrls = () => fetchMock.mock.calls.map(call => String(call[0]))

const respond = () => new Response(JSON.stringify({ count: 0, next: null, previous: null, results: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })

function turnBadge(on: boolean) {
    localStorage.setItem(DEVICE_SETTINGS_KEY, JSON.stringify({ card_showMakeNowBadge: on }))
}

describe('requests of the API client while the make now badge is on', () => {
    beforeEach(() => {
        localStorage.clear()
        fetchMock.mockReset()
        fetchMock.mockImplementation(async () => respond())
        vi.stubGlobal('fetch', fetchMock)
    })
    afterEach(() => {
        vi.unstubAllGlobals()
        localStorage.clear()
    })

    it('ask for make now on the recipe list', async () => {
        turnBadge(true)
        await new ApiApi().apiRecipeList({ query: 'soup' })
        expect(requestedUrls()).toHaveLength(1)
        expect(requestedUrls()[0]).toMatch(/\/api\/recipe\/\?/)
        expect(requestedUrls()[0]).toContain('query=soup')
        expect(requestedUrls()[0]).toContain('makenow_badge=true')
    })

    it('ask for make now on the list of book entries', async () => {
        turnBadge(true)
        await new ApiApi().apiRecipeBookEntryList({ book: 3 })
        expect(requestedUrls()[0]).toContain('makenow_badge=true')
    })

    it('ask once, however many query parameters there are', async () => {
        turnBadge(true)
        await new ApiApi().apiRecipeList({ query: 'a', page: 2, pageSize: 5 })
        expect(requestedUrls()[0].match(/makenow_badge=/g)).toHaveLength(1)
    })

    it('do not ask when a caller says it has no use for it', async () => {
        turnBadge(true)
        await new ApiApi().apiRecipeList({ query: 'soup', makenowBadge: false })
        await new ApiApi().apiRecipeBookEntryList({ recipe: 1, makenowBadge: false })
        requestedUrls().forEach(url => {
            expect(url).toContain('makenow_badge=false')
            expect(url).not.toContain('makenow_badge=true')
        })
    })

    it('do not ask for anything that is not a list of recipes', async () => {
        turnBadge(true)
        fetchMock.mockImplementation(async () => new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }))
        await new ApiApi().apiRecipeRetrieve({ id: 12 }).catch(() => {})
        await new ApiApi().apiFoodList({}).catch(() => {})
        requestedUrls().forEach(url => expect(url).not.toContain('makenow_badge'))
    })

    it('do not ask while the badge is off or was never set', async () => {
        await new ApiApi().apiRecipeList({})
        turnBadge(false)
        await new ApiApi().apiRecipeList({})
        requestedUrls().forEach(url => expect(url).not.toContain('makenow_badge'))
    })

    it('follow the setting from one request to the next', async () => {
        turnBadge(false)
        await new ApiApi().apiRecipeList({})
        turnBadge(true)
        await new ApiApi().apiRecipeList({})
        expect(requestedUrls()[0]).not.toContain('makenow_badge')
        expect(requestedUrls()[1]).toContain('makenow_badge=true')
    })
})
