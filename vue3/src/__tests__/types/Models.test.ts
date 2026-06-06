import { describe, it, expect, vi } from 'vitest'
import { getGenericModelFromString } from '@/types/Models'

const t = (k: string) => k

describe('GenericModel delete-relationship dispatch', () => {
    it('returns an empty result (no throw) when the generated client lacks the endpoint', async () => {
        // Space has no apiSpaceProtectingList on the generated client; the old
        // code threw "this.api[...] is not a function" on this path.
        const gm = getGenericModelFromString('Space', t)
        const r = await gm.getDeleteProtecting({ id: 1, page: 1, pageSize: 10, cache: true })
        expect(r).toEqual({ count: 0, results: [] })
    })

    it('invokes the generated endpoint when it exists', async () => {
        const gm = getGenericModelFromString('Food', t)
        const spy = vi.fn().mockResolvedValue({ count: 2, results: [{ id: 7 }] })
        ;(gm as any).api = { apiFoodProtectingList: spy }

        const params = { id: 1, page: 1, pageSize: 10, cache: true }
        const r = await gm.getDeleteProtecting(params)

        expect(spy).toHaveBeenCalledWith(params)
        expect(r.count).toBe(2)
    })
})

describe('GenericModel.list normalizes paginated vs non-paginated responses', () => {
    it('wraps a bare-array (isPaginated:false) response into {count, results, next}', async () => {
        const gm = getGenericModelFromString('User', t)
        ;(gm as any).api = { apiUserList: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]) }
        const r = await gm.list({ page: 1, pageSize: 10 } as any)
        expect(r).toEqual({ count: 2, results: [{ id: 1 }, { id: 2 }], next: null })
    })

    it('passes a paginated response through unchanged (preserving next)', async () => {
        const gm = getGenericModelFromString('Food', t)
        const paginated = { count: 5, results: [{ id: 7 }], next: 'http://x/?page=2' }
        ;(gm as any).api = { apiFoodList: vi.fn().mockResolvedValue(paginated) }
        const r = await gm.list({ page: 1, pageSize: 10 } as any)
        expect(r).toEqual(paginated)
    })

    it('wraps an empty bare array as count 0 (the former NaN source)', async () => {
        const gm = getGenericModelFromString('Group', t)
        ;(gm as any).api = { apiGroupList: vi.fn().mockResolvedValue([]) }
        const r = await gm.list({} as any)
        expect(r).toEqual({ count: 0, results: [], next: null })
    })
})
