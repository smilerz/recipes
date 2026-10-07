import {describe, it, expect} from 'vitest'
import {mintSeed, isSeedExpired, getOrMintStoredSeed, SEED_TTL_MS} from '@/utils/randomSeed'

function fakeStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial))
    return {
        data,
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => { data.set(k, v) },
    }
}

// The backend accepts 1-64 letters, digits, "_" or "-" (recipe_search._SEED_RE).
const BACKEND_SEED_RE = /^[A-Za-z0-9_-]{1,64}$/

describe('randomSeed', () => {
    describe('mintSeed', () => {
        it('produces a seed the backend accepts', () => {
            expect(mintSeed()).toMatch(BACKEND_SEED_RE)
        })

        it('is "<epoch seconds base36>-<random base36>" so its age can be read back', () => {
            const now = Date.UTC(2026, 9, 7, 12, 0, 0)
            const [stamp, rand] = mintSeed(now).split('-')
            expect(parseInt(stamp, 36)).toBe(Math.floor(now / 1000))
            expect(rand.length).toBeGreaterThan(0)
        })

        it('differs between calls made in the same second', () => {
            const now = Date.UTC(2026, 9, 7, 12, 0, 0)
            expect(mintSeed(now)).not.toBe(mintSeed(now))
        })
    })

    describe('isSeedExpired', () => {
        const now = Date.UTC(2026, 9, 7, 12, 0, 0)

        it('a seed minted just now is not expired', () => {
            expect(isSeedExpired(mintSeed(now), now)).toBe(false)
        })

        it('is not expired just inside the TTL', () => {
            expect(isSeedExpired(mintSeed(now - (SEED_TTL_MS - 5000)), now)).toBe(false)
        })

        it('is expired once older than the TTL', () => {
            expect(isSeedExpired(mintSeed(now - (SEED_TTL_MS + 5000)), now)).toBe(true)
        })

        it('honours an explicit ttl', () => {
            const seed = mintSeed(now - 60_000)
            expect(isSeedExpired(seed, now, 120_000)).toBe(false)
            expect(isSeedExpired(seed, now, 30_000)).toBe(true)
        })

        it.each(['', 'nodash', '-abc', 'zz!-abc', 'user-chosen-seed'])('treats %j as expired (not one of ours, so replace it)', (bad) => {
            expect(isSeedExpired(bad, now)).toBe(true)
        })

        it('treats a seed minted in the future (clock skew) as not expired', () => {
            expect(isSeedExpired(mintSeed(now + 60_000), now)).toBe(false)
        })
    })

    // Home sections have no URL to hold a seed, so they keep one in sessionStorage per scope
    // until it expires: refreshing the page keeps the same shuffle until the TTL passes.
    describe('getOrMintStoredSeed', () => {
        const now = Date.UTC(2026, 9, 7, 12, 0, 0)

        it('mints and stores a seed when none is stored', () => {
            const storage = fakeStorage()
            const seed = getOrMintStoredSeed('home:3', now, storage)
            expect(seed).toMatch(/^[0-9a-z]+-[0-9a-z]+$/)
            expect(storage.data.get('random_seed:home:3')).toBe(seed)
        })

        it('returns the same seed on later calls while it is fresh', () => {
            const storage = fakeStorage()
            const first = getOrMintStoredSeed('home:3', now, storage)
            expect(getOrMintStoredSeed('home:3', now + 60_000, storage)).toBe(first)
        })

        it('replaces and re-stores a seed once it is older than the TTL', () => {
            const stale = mintSeed(now - (SEED_TTL_MS + 60_000))
            const storage = fakeStorage({'random_seed:home:3': stale})
            const seed = getOrMintStoredSeed('home:3', now, storage)
            expect(seed).not.toBe(stale)
            expect(isSeedExpired(seed, now)).toBe(false)
            expect(storage.data.get('random_seed:home:3')).toBe(seed)
        })

        it('keeps scopes independent (two Random sections must not show the same recipes)', () => {
            const storage = fakeStorage()
            const a = getOrMintStoredSeed('home:4', now, storage)
            const b = getOrMintStoredSeed('home:8', now, storage)
            expect(a).not.toBe(b)
            expect(getOrMintStoredSeed('home:4', now, storage)).toBe(a)
        })

        it('still returns a valid seed when storage is unavailable', () => {
            const broken = {
                getItem: () => { throw new Error('blocked') },
                setItem: () => { throw new Error('blocked') },
            }
            expect(getOrMintStoredSeed('home:3', now, broken)).toMatch(/^[0-9a-z]+-[0-9a-z]+$/)
            expect(getOrMintStoredSeed('home:3', now, null)).toMatch(/^[0-9a-z]+-[0-9a-z]+$/)
        })
    })
})
