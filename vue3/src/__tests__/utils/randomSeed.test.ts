import {describe, it, expect} from 'vitest'
import {mintSeed, isSeedExpired, SEED_TTL_MS} from '@/utils/randomSeed'

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
})
