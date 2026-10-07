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

type SeedStorage = Pick<Storage, 'getItem' | 'setItem'>

function sessionStore(): SeedStorage | null {
    try {
        return typeof sessionStorage === 'undefined' ? null : sessionStorage
    } catch {
        return null
    }
}

/**
 * The seed kept for a scope (e.g. one home-page section) in sessionStorage, minting a new one when
 * none is stored or it has expired. For places with no URL to hold a seed. If storage is blocked the
 * seed is simply not remembered, so that load still works but each reload reshuffles.
 */
export function getOrMintStoredSeed(scope: string, now: number = Date.now(), storage: SeedStorage | null = sessionStore()): string {
    const key = `random_seed:${scope}`
    try {
        const stored = storage?.getItem(key)
        if (stored && !isSeedExpired(stored, now)) return stored
    } catch { /* storage blocked */ }
    const seed = mintSeed(now)
    try {
        storage?.setItem(key, seed)
    } catch { /* storage blocked */ }
    return seed
}

/** True when the seed is older than the TTL, or isn't one this app minted (so it should be replaced). */
export function isSeedExpired(seed: string, now: number = Date.now(), ttlMs: number = SEED_TTL_MS): boolean {
    const match = SEED_SHAPE.exec(seed)
    if (!match) return true
    return now - parseInt(match[1], 36) * 1000 > ttlMs
}
