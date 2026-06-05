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
