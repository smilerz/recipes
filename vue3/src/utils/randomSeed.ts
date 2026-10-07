/**
 * Seeds for stable random recipe ordering (the recipe list's `seed` param).
 *
 * A seed is "<epoch seconds, base36>-<random, base36>". The timestamp prefix lets a seed that
 * lives only in a URL expire without any stored state; expiry is checked on entry, never on a
 * timer, so a page is not reshuffled mid-browse.
 */

export const SEED_TTL_MS = 30 * 60 * 1000

const SEED_SHAPE = /^([0-9a-z]+)-[0-9a-z]+$/

export function mintSeed(now: number = Date.now()): string {
    const stamp = Math.floor(now / 1000).toString(36)
    const rand = Math.random().toString(36).slice(2, 8).padEnd(6, '0')
    return `${stamp}-${rand}`
}

/** True when the seed is older than the TTL, or isn't one this app minted (so it should be replaced). */
export function isSeedExpired(seed: string, now: number = Date.now(), ttlMs: number = SEED_TTL_MS): boolean {
    const match = SEED_SHAPE.exec(seed)
    if (!match) return true
    return now - parseInt(match[1], 36) * 1000 > ttlMs
}
