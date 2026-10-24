import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { computed, effectScope, reactive, ref, nextTick, watch, type EffectScope } from 'vue'
import type { FilterDef } from '@/composables/modellist/types'

const mockQuery = ref<Record<string, string | string[]>>({})
const replacedQueries: Record<string, string | string[]>[] = []

const mockRoute = reactive({
    get query() { return mockQuery.value },
})

vi.mock('vue-router', () => ({
    useRoute: () => mockRoute,
    useRouter: () => ({
        isReady: () => Promise.resolve(),
        replace: (opts: { query: Record<string, string | string[]> }) => {
            replacedQueries.push({ ...opts.query })
            mockQuery.value = { ...opts.query }
            return Promise.resolve()
        },
    }),
}))

import { useUrlFilters } from '@/composables/useUrlFilters'

function makeDefs(defs: Partial<FilterDef>[]): FilterDef[] {
    return defs.map((d, i) => ({
        key: d.key ?? `key${i}`,
        labelKey: d.labelKey ?? `Label${i}`,
        type: d.type ?? 'tristate',
        ...d,
    })) as FilterDef[]
}

describe('useUrlFilters (multi-param)', () => {
    beforeEach(() => {
        mockQuery.value = {}
        replacedQueries.length = 0
    })

    describe('reading from route query', () => {
        it('empty query yields empty params', () => {
            const defs = computed(() => makeDefs([]))
            const { filterParams, activeFilterCount } = useUrlFilters(defs)
            expect(filterParams.value).toEqual({})
            expect(activeFilterCount.value).toBe(0)
        })

        it('reads individual query params matching filter keys', () => {
            mockQuery.value = { onHand: '1', hasRecipe: '0' }
            const defs = computed(() => makeDefs([
                { key: 'onHand', type: 'tristate' },
                { key: 'hasRecipe', type: 'tristate' },
            ]))
            const { filterParams, activeFilterCount } = useUrlFilters(defs)
            expect(filterParams.value).toEqual({ onHand: 1, hasRecipe: 0 })
            expect(activeFilterCount.value).toBe(2)
        })

        it('ignores query params that are not in filterDefs', () => {
            mockQuery.value = { onHand: '1', page: '3', query: 'chicken' }
            const defs = computed(() => makeDefs([
                { key: 'onHand', type: 'tristate' },
            ]))
            const { filterParams, activeFilterCount } = useUrlFilters(defs)
            expect(filterParams.value).toEqual({ onHand: 1 })
            expect(activeFilterCount.value).toBe(1)
        })

        it('passes filter keys through to filterParams unchanged', () => {
            mockQuery.value = { foodOnhand: '1' }
            const defs = computed(() => makeDefs([{ key: 'foodOnhand', type: 'tristate' }]))
            const { filterParams } = useUrlFilters(defs)
            expect(filterParams.value).toHaveProperty('foodOnhand', 1)
        })

        it('coerces tristate, model-select, and number types to Number', () => {
            mockQuery.value = { tri: '1', num: '42', ms: '5' }
            const defs = computed(() => makeDefs([
                { key: 'tri', type: 'tristate' },
                { key: 'num', type: 'number' },
                { key: 'ms', type: 'model-select' },
            ]))
            const { filterParams } = useUrlFilters(defs)
            expect(filterParams.value).toEqual({ tri: 1, num: 42, ms: 5 })
        })

        it('excludes NaN values from numeric coercion', () => {
            mockQuery.value = { tri: 'notanumber' }
            const defs = computed(() => makeDefs([{ key: 'tri', type: 'tristate' }]))
            const { filterParams } = useUrlFilters(defs)
            expect(filterParams.value).toEqual({})
        })

        it('handles select type as string array', () => {
            mockQuery.value = { internal: 'true' }
            const defs = computed(() => makeDefs([{ key: 'internal', type: 'select' }]))
            const { filterParams } = useUrlFilters(defs)
            expect(filterParams.value).toEqual({ internal: ['true'] })
        })

        // Before the multi-param refactor (commit b56131264), date/number ranges
        // were shipped to the backend as separate snake_case params
        // (?createdon_gte=X&createdon_lte=Y). Bookmarked URLs in that old shape
        // must still populate the new combined state so user deep-links don't
        // silently drop filters after upgrade.
        it('back-compat: accepts legacy {key}_gte/{key}_lte pair for date-range', () => {
            mockQuery.value = {createdon_gte: '2026-04-16', createdon_lte: '2026-04-20'}
            const defs = computed(() => makeDefs([{key: 'createdon', type: 'date-range'}]))
            const {filterParams, activeFilterCount} = useUrlFilters(defs)
            const gte = (filterParams.value as any).createdonGte as Date
            const lte = (filterParams.value as any).createdonLte as Date
            expect(gte.toISOString().slice(0, 10)).toBe('2026-04-16')
            expect(lte.toISOString().slice(0, 10)).toBe('2026-04-20')
            expect(activeFilterCount.value).toBe(1)
        })

        it('back-compat: accepts legacy {key}_gte alone (open-ended upper)', () => {
            mockQuery.value = {createdon_gte: '2026-04-16'}
            const defs = computed(() => makeDefs([{key: 'createdon', type: 'date-range'}]))
            const {filterParams} = useUrlFilters(defs)
            const gte = (filterParams.value as any).createdonGte as Date
            expect(gte.toISOString().slice(0, 10)).toBe('2026-04-16')
            expect('createdonLte' in (filterParams.value as any)).toBe(false)
        })

        it('back-compat: accepts legacy {key}_lte alone for number-range', () => {
            mockQuery.value = {timescooked_lte: '0'}
            const defs = computed(() => makeDefs([{key: 'timescooked', type: 'number-range'}]))
            const {filterParams} = useUrlFilters(defs)
            expect(filterParams.value).toEqual({timescookedLte: 0})
        })

        it('modern range param wins if both shapes are present', () => {
            mockQuery.value = {createdon: '2026-04-16~2026-04-20', createdon_gte: '1999-01-01'}
            const defs = computed(() => makeDefs([{key: 'createdon', type: 'date-range'}]))
            const {filterParams} = useUrlFilters(defs)
            const gte = (filterParams.value as any).createdonGte as Date
            expect(gte.toISOString().slice(0, 10)).toBe('2026-04-16')
        })

        it('clearing a filter loaded from legacy _gte/_lte params strips them from the URL, so they do not resurrect the filter on the next load', async () => {
            mockQuery.value = {createdon_gte: '2026-04-16', createdon_lte: '2026-04-20'}
            const defs = computed(() => makeDefs([{key: 'createdon', type: 'date-range'}]))
            const {clearFilter} = useUrlFilters(defs)
            clearFilter('createdon')
            await nextTick()
            const last = replacedQueries[replacedQueries.length - 1]
            expect(last).not.toHaveProperty('createdon_gte')
            expect(last).not.toHaveProperty('createdon_lte')
        })

        // The OpenAPI client types date-range params as Date and serializes
        // via .toISOString(). If filterParams emits a plain string the client
        // throws "error while fetching" on apiRecipeList. Coerce to Date so
        // the API call survives.
        it('date-range values are coerced to Date for the API client', () => {
            mockQuery.value = {createdon: '2026-04-16~2026-04-20'}
            const defs = computed(() => makeDefs([{key: 'createdon', type: 'date-range'}]))
            const {filterParams} = useUrlFilters(defs)
            const gte = (filterParams.value as any).createdonGte
            const lte = (filterParams.value as any).createdonLte
            expect(gte).toBeInstanceOf(Date)
            expect(lte).toBeInstanceOf(Date)
            expect((gte as Date).toISOString().slice(0, 10)).toBe('2026-04-16')
            expect((lte as Date).toISOString().slice(0, 10)).toBe('2026-04-20')
        })

        it('open-ended date-range gte-only still returns Date', () => {
            mockQuery.value = {createdon: '2026-04-16~'}
            const defs = computed(() => makeDefs([{key: 'createdon', type: 'date-range'}]))
            const {filterParams} = useUrlFilters(defs)
            const gte = (filterParams.value as any).createdonGte
            expect(gte).toBeInstanceOf(Date)
            expect('createdonLte' in (filterParams.value as any)).toBe(false)
        })

        // ModelListPage loads filterDefs from a computed that depends on
        // `genericModel`, which isn't set until onBeforeMount — so at
        // `useUrlFilters` setup time `filterDefs.value` is still `[]`. Without
        // a re-init trigger, URL params like ?expiringSoon=3 would be dropped.
        it('re-reads route params when filterDefs arrive asynchronously', async () => {
            mockQuery.value = { expiringSoon: '3' }
            const pendingDefs = ref<FilterDef[]>([])
            const defs = computed(() => pendingDefs.value)
            const { filterParams, activeFilterCount } = useUrlFilters(defs)
            expect(filterParams.value).toEqual({})
            expect(activeFilterCount.value).toBe(0)
            pendingDefs.value = makeDefs([{ key: 'expiringSoon', type: 'number' }])
            await nextTick()
            expect(filterParams.value).toEqual({ expiringSoon: 3 })
            expect(activeFilterCount.value).toBe(1)
        })
    })

    describe('setFilter / getFilter', () => {
        it('sets a filter and updates route query', async () => {
            const defs = computed(() => makeDefs([{ key: 'status', type: 'tristate' }]))
            const { setFilter, getFilter } = useUrlFilters(defs)
            setFilter('status', '1')
            await nextTick()
            expect(getFilter('status')).toBe('1')
            expect(replacedQueries.length).toBeGreaterThan(0)
            expect(replacedQueries[replacedQueries.length - 1]).toHaveProperty('status', '1')
        })

        it('overwrites existing filter', async () => {
            mockQuery.value = { status: '1' }
            const defs = computed(() => makeDefs([{ key: 'status', type: 'tristate' }]))
            const { setFilter, getFilter } = useUrlFilters(defs)
            setFilter('status', '0')
            await nextTick()
            expect(getFilter('status')).toBe('0')
        })

        it('removes filter when value is undefined', async () => {
            mockQuery.value = { status: '1' }
            const defs = computed(() => makeDefs([{ key: 'status', type: 'tristate' }]))
            const { setFilter, activeFilterCount } = useUrlFilters(defs)
            setFilter('status', undefined)
            await nextTick()
            expect(activeFilterCount.value).toBe(0)
        })

        it('removes filter when value is empty string', async () => {
            mockQuery.value = { status: '1' }
            const defs = computed(() => makeDefs([{ key: 'status', type: 'tristate' }]))
            const { setFilter, activeFilterCount } = useUrlFilters(defs)
            setFilter('status', '')
            await nextTick()
            expect(activeFilterCount.value).toBe(0)
        })

        it('clearAllFilters removes all filter params', async () => {
            mockQuery.value = { a: '1', b: '2' }
            const defs = computed(() => makeDefs([{ key: 'a' }, { key: 'b' }]))
            const { clearAllFilters, activeFilterCount } = useUrlFilters(defs)
            clearAllFilters()
            await nextTick()
            expect(activeFilterCount.value).toBe(0)
        })

        it('preserves non-filter query params on setFilter', async () => {
            mockQuery.value = { page: '3', query: 'chicken', onHand: '1' }
            const defs = computed(() => makeDefs([{ key: 'onHand', type: 'tristate' }]))
            const { setFilter } = useUrlFilters(defs)
            setFilter('onHand', '0')
            await nextTick()
            const last = replacedQueries[replacedQueries.length - 1]
            expect(last).toHaveProperty('page', '3')
            expect(last).toHaveProperty('query', 'chicken')
            expect(last).toHaveProperty('onHand', '0')
        })

        it('preserves non-filter query params on clearAllFilters', async () => {
            mockQuery.value = { page: '3', onHand: '1' }
            const defs = computed(() => makeDefs([{ key: 'onHand', type: 'tristate' }]))
            const { clearAllFilters } = useUrlFilters(defs)
            clearAllFilters()
            await nextTick()
            const last = replacedQueries[replacedQueries.length - 1]
            expect(last).toHaveProperty('page', '3')
            expect(last).not.toHaveProperty('onHand')
        })
    })

    describe('route changes unrelated to filters', () => {
        // A page change rewrites route.query, which re-runs initFromRoute. Consumers
        // (SearchPage, ModelListPage) watch filterParams and reset to page 1 whenever it
        // changes, so a page change with an active filter must leave filterParams untouched.
        it('does not replace filterParams when only a non-filter query param (page) changes', async () => {
            mockQuery.value = { onHand: '1' }
            const defs = computed(() => makeDefs([{ key: 'onHand', type: 'tristate' }]))
            const { filterParams } = useUrlFilters(defs)
            const before = filterParams.value
            let fired = 0
            watch(filterParams, () => { fired++ })

            mockQuery.value = { onHand: '1', page: '2' }
            await nextTick()
            await nextTick()

            expect(fired).toBe(0)
            expect(filterParams.value).toBe(before)
        })

        it('still updates filterParams when a filter value in the route actually changes', async () => {
            mockQuery.value = { onHand: '1' }
            const defs = computed(() => makeDefs([{ key: 'onHand', type: 'tristate' }]))
            const { filterParams } = useUrlFilters(defs)

            mockQuery.value = { onHand: '0' }
            await nextTick()

            expect(filterParams.value).toEqual({ onHand: 0 })
        })

        it('still clears filterParams when the filter is removed from the route', async () => {
            mockQuery.value = { onHand: '1' }
            const defs = computed(() => makeDefs([{ key: 'onHand', type: 'tristate' }]))
            const { filterParams } = useUrlFilters(defs)

            mockQuery.value = {}
            await nextTick()

            expect(filterParams.value).toEqual({})
        })
    })

    describe('batching', () => {
        it('batches multiple synchronous setFilter calls into one router.replace', async () => {
            const defs = computed(() => makeDefs([
                { key: 'a', type: 'tristate' },
                { key: 'b', type: 'tristate' },
            ]))
            const { setFilter } = useUrlFilters(defs)
            replacedQueries.length = 0
            setFilter('a', '1')
            setFilter('b', '0')
            await nextTick()
            expect(replacedQueries).toHaveLength(1)
            expect(replacedQueries[0]).toMatchObject({ a: '1', b: '0' })
        })
    })

    describe('session persistence (E-4)', () => {
        beforeEach(() => {
            window.sessionStorage.clear()
        })

        it('persists active filters to sessionStorage with a timestamp envelope', async () => {
            mockQuery.value = {}
            ;(mockRoute as any).path = '/search'
            const defs = computed(() => makeDefs([{ key: 'onHand', type: 'tristate' }]))
            const { setFilter } = useUrlFilters(defs)
            const before = Date.now()
            setFilter('onHand', '1')
            await nextTick()
            const stored = window.sessionStorage.getItem('url_filters:/search')
            expect(stored).toBeTruthy()
            const parsed = JSON.parse(stored as string)
            expect(parsed.filters).toEqual({ onHand: '1' })
            expect(parsed.ts).toBeGreaterThanOrEqual(before)
            expect(parsed.ts).toBeLessThanOrEqual(Date.now())
        })

        it('hydrates from sessionStorage when URL has no filter keys', async () => {
            ;(mockRoute as any).path = '/search'
            window.sessionStorage.setItem('url_filters:/search',
                JSON.stringify({ filters: { onHand: '1' }, ts: Date.now() }))
            mockQuery.value = {}
            const defs = computed(() => makeDefs([{ key: 'onHand', type: 'tristate' }]))
            const { activeFilterCount, getFilter } = useUrlFilters(defs)
            expect(activeFilterCount.value).toBe(1)
            expect(getFilter('onHand')).toBe('1')
            await nextTick()
            const last = replacedQueries[replacedQueries.length - 1]
            expect(last).toHaveProperty('onHand', '1')
        })

        it('URL query wins over sessionStorage when both have filters', () => {
            ;(mockRoute as any).path = '/search'
            window.sessionStorage.setItem('url_filters:/search',
                JSON.stringify({ filters: { onHand: '1' }, ts: Date.now() }))
            mockQuery.value = { onHand: '0' }
            const defs = computed(() => makeDefs([{ key: 'onHand', type: 'tristate' }]))
            const { getFilter } = useUrlFilters(defs)
            expect(getFilter('onHand')).toBe('0')
        })

        it('clearAllFilters clears session-persisted filters', async () => {
            ;(mockRoute as any).path = '/search'
            mockQuery.value = { onHand: '1' }
            const defs = computed(() => makeDefs([{ key: 'onHand', type: 'tristate' }]))
            const { clearAllFilters } = useUrlFilters(defs)
            clearAllFilters()
            await nextTick()
            expect(window.sessionStorage.getItem('url_filters:/search')).toBeNull()
        })

        it('discards stored filters older than 2 hours and removes the entry', () => {
            ;(mockRoute as any).path = '/search'
            const TWO_HOURS_MS = 2 * 60 * 60 * 1000
            const stale = Date.now() - TWO_HOURS_MS - 1
            window.sessionStorage.setItem('url_filters:/search',
                JSON.stringify({ filters: { onHand: '1' }, ts: stale }))
            mockQuery.value = {}
            const defs = computed(() => makeDefs([{ key: 'onHand', type: 'tristate' }]))
            const { activeFilterCount } = useUrlFilters(defs)
            expect(activeFilterCount.value).toBe(0)
            expect(window.sessionStorage.getItem('url_filters:/search')).toBeNull()
        })

        it('keeps stored filters younger than 2 hours', () => {
            ;(mockRoute as any).path = '/search'
            const fresh = Date.now() - (60 * 60 * 1000) // 1 hour ago
            window.sessionStorage.setItem('url_filters:/search',
                JSON.stringify({ filters: { onHand: '1' }, ts: fresh }))
            mockQuery.value = {}
            const defs = computed(() => makeDefs([{ key: 'onHand', type: 'tristate' }]))
            const { activeFilterCount, getFilter } = useUrlFilters(defs)
            expect(activeFilterCount.value).toBe(1)
            expect(getFilter('onHand')).toBe('1')
        })

        it('discards legacy bare-object format (back-compat: pre-TTL stored entries)', () => {
            ;(mockRoute as any).path = '/search'
            // Pre-TTL format: just the filters dict, no envelope
            window.sessionStorage.setItem('url_filters:/search',
                JSON.stringify({ onHand: '1' }))
            mockQuery.value = {}
            const defs = computed(() => makeDefs([{ key: 'onHand', type: 'tristate' }]))
            const { activeFilterCount } = useUrlFilters(defs)
            expect(activeFilterCount.value).toBe(0)
            expect(window.sessionStorage.getItem('url_filters:/search')).toBeNull()
        })
    })

    describe('groupedFilterDefs', () => {
        it('partitions defs by group', () => {
            const defs = computed(() => makeDefs([
                { key: 'a', group: 'inventory' },
                { key: 'b', group: 'inventory' },
                { key: 'c', group: 'status' },
                { key: 'd' },
            ]))
            const { groupedFilterDefs } = useUrlFilters(defs)
            expect(groupedFilterDefs.value.get('inventory')).toHaveLength(2)
            expect(groupedFilterDefs.value.get('status')).toHaveLength(1)
            expect(groupedFilterDefs.value.get('')).toHaveLength(1)
        })
    })

    describe('tag-select (multi-value array filters)', () => {
        it('parses comma-joined values into a number array', () => {
            mockQuery.value = { keywords: '7,14,21' }
            const defs = computed(() => makeDefs([{ key: 'keywords', type: 'tag-select' }]))
            const { filterParams } = useUrlFilters(defs)
            expect(filterParams.value).toEqual({ keywords: [7, 14, 21] })
        })

        it('handles a single-element array (no delimiter)', () => {
            mockQuery.value = { keywords: '42' }
            const defs = computed(() => makeDefs([{ key: 'keywords', type: 'tag-select' }]))
            const { filterParams } = useUrlFilters(defs)
            expect(filterParams.value).toEqual({ keywords: [42] })
        })

        it('setFilter accepts an array of numbers and round-trips', () => {
            const defs = computed(() => makeDefs([{ key: 'foods', type: 'tag-select' }]))
            const { setFilter, filterParams } = useUrlFilters(defs)
            setFilter('foods', [3, 5, 9])
            expect(filterParams.value).toEqual({ foods: [3, 5, 9] })
        })

        it('setFilter with empty array removes the filter', () => {
            mockQuery.value = { foods: '1,2' }
            const defs = computed(() => makeDefs([{ key: 'foods', type: 'tag-select' }]))
            const { setFilter, activeFilterCount } = useUrlFilters(defs)
            setFilter('foods', [])
            expect(activeFilterCount.value).toBe(0)
        })

    })

    describe('number-range filters', () => {
        it('parses gte~lte into two API params', () => {
            mockQuery.value = { rating: '3~5' }
            const defs = computed(() => makeDefs([{ key: 'rating', type: 'number-range' }]))
            const { filterParams } = useUrlFilters(defs)
            expect(filterParams.value).toEqual({ ratingGte: 3, ratingLte: 5 })
        })

        it('parses gte-only (no lte) into one param', () => {
            mockQuery.value = { rating: '3~' }
            const defs = computed(() => makeDefs([{ key: 'rating', type: 'number-range' }]))
            const { filterParams } = useUrlFilters(defs)
            expect(filterParams.value).toEqual({ ratingGte: 3 })
        })

        it('parses lte-only (no gte) into one param', () => {
            mockQuery.value = { rating: '~5' }
            const defs = computed(() => makeDefs([{ key: 'rating', type: 'number-range' }]))
            const { filterParams } = useUrlFilters(defs)
            expect(filterParams.value).toEqual({ ratingLte: 5 })
        })

        it('setFilter accepts {gte, lte} object and round-trips', () => {
            const defs = computed(() => makeDefs([{ key: 'rating', type: 'number-range' }]))
            const { setFilter, filterParams } = useUrlFilters(defs)
            setFilter('rating', { gte: 3, lte: 5 })
            expect(filterParams.value).toEqual({ ratingGte: 3, ratingLte: 5 })
        })

        it('setFilter with both null/undefined removes the filter', () => {
            mockQuery.value = { rating: '3~5' }
            const defs = computed(() => makeDefs([{ key: 'rating', type: 'number-range' }]))
            const { setFilter, activeFilterCount } = useUrlFilters(defs)
            setFilter('rating', { gte: null, lte: null })
            expect(activeFilterCount.value).toBe(0)
        })
    })

    describe('date-range filters (Date values for OpenAPI client)', () => {
        it('parses ISO gte~lte into two Date API params', () => {
            mockQuery.value = { cookedon: '2025-01-01~2025-12-31' }
            const defs = computed(() => makeDefs([{ key: 'cookedon', type: 'date-range' }]))
            const { filterParams } = useUrlFilters(defs)
            const gte = (filterParams.value as any).cookedonGte as Date
            const lte = (filterParams.value as any).cookedonLte as Date
            expect(gte).toBeInstanceOf(Date)
            expect(lte).toBeInstanceOf(Date)
            expect(gte.toISOString().slice(0, 10)).toBe('2025-01-01')
            expect(lte.toISOString().slice(0, 10)).toBe('2025-12-31')
        })
    })

    describe('unknown def type', () => {
        it('passes through string value when def type has no special handler', () => {
            mockQuery.value = { custom: 'somevalue' }
            const defs = computed(() => makeDefs([{ key: 'custom', type: 'string' as any }]))
            const { filterParams } = useUrlFilters(defs)
            expect(filterParams.value).toEqual({ custom: 'somevalue' })
        })
    })

    describe('clearFilter', () => {
        it('removes a filter by key', () => {
            mockQuery.value = { a: '1', b: '2' }
            const defs = computed(() => makeDefs([{ key: 'a' }, { key: 'b' }]))
            const { clearFilter, activeFilterCount, getFilter } = useUrlFilters(defs)
            clearFilter('a')
            expect(getFilter('a')).toBeUndefined()
            expect(getFilter('b')).toBe('2')
            expect(activeFilterCount.value).toBe(1)
        })
    })
})

describe('useUrlFilters persistKeys (sort order survives with the filters)', () => {
    const KEY = 'url_filters:/search'
    const defs = () => computed(() => makeDefs([{ key: 'onHand', type: 'tristate' }]))
    // the hydrate flush goes through isReady().then(...) and then nextTick, one nextTick is not enough
    const settle = () => new Promise(resolve => setTimeout(resolve, 0))
    const stored = () => JSON.parse(window.sessionStorage.getItem(KEY) as string)

    let scope: EffectScope
    // stopped after each test so the watchers of one test cannot write to storage in the next
    const use = (options?: Parameters<typeof useUrlFilters>[1]) => scope.run(() => useUrlFilters(defs(), options))!

    beforeEach(() => {
        window.sessionStorage.clear()
        mockQuery.value = {}
        replacedQueries.length = 0
        ;(mockRoute as any).path = '/search'
        scope = effectScope()
    })

    afterEach(() => scope.stop())

    it('stores the listed keys next to the filters', async () => {
        mockQuery.value = { ordering: '-rating' }
        const { setFilter } = use({ persistKeys: ['ordering'] })
        setFilter('onHand', '1')
        await settle()
        expect(stored().filters).toEqual({ onHand: '1' })
        expect(stored().extras).toEqual({ ordering: '-rating' })
    })

    it('saves a sort change on its own, without any filter', async () => {
        use({ persistKeys: ['ordering'] })
        mockQuery.value = { ordering: 'name' }
        await settle()
        expect(stored().extras).toEqual({ ordering: 'name' })
    })

    it('restores the stored sort into the URL when the URL has no filter', async () => {
        window.sessionStorage.setItem(KEY, JSON.stringify({ filters: { onHand: '1' }, extras: { ordering: '-rating' }, ts: Date.now() }))
        use({ persistKeys: ['ordering'] })
        await settle()
        expect(replacedQueries[replacedQueries.length - 1]).toEqual({ onHand: '1', ordering: '-rating' })
    })

    it('restores a stored sort when no filters were stored', async () => {
        window.sessionStorage.setItem(KEY, JSON.stringify({ filters: {}, extras: { ordering: '-rating' }, ts: Date.now() }))
        use({ persistKeys: ['ordering'] })
        await settle()
        expect(replacedQueries[replacedQueries.length - 1]).toEqual({ ordering: '-rating' })
    })

    it('does not override a sort that is already in the URL', async () => {
        window.sessionStorage.setItem(KEY, JSON.stringify({ filters: { onHand: '1' }, extras: { ordering: '-rating' }, ts: Date.now() }))
        mockQuery.value = { ordering: 'name' }
        use({ persistKeys: ['ordering'] })
        await settle()
        expect(replacedQueries[replacedQueries.length - 1]).toEqual({ onHand: '1', ordering: 'name' })
    })

    it('lets a URL that carries a filter win over the stored sort', async () => {
        window.sessionStorage.setItem(KEY, JSON.stringify({ filters: { onHand: '1' }, extras: { ordering: '-rating' }, ts: Date.now() }))
        mockQuery.value = { onHand: '0' }
        use({ persistKeys: ['ordering'] })
        await settle()
        expect(replacedQueries.some(q => q.ordering === '-rating')).toBe(false)
    })

    it('restores again when the same page is opened bare a second time (side menu link while on the page)', async () => {
        window.sessionStorage.setItem(KEY, JSON.stringify({ filters: {}, extras: { ordering: 'name' }, ts: Date.now() }))
        use({ persistKeys: ['ordering'] })
        await settle()
        replacedQueries.length = 0

        mockQuery.value = {}
        await settle()

        expect(replacedQueries[replacedQueries.length - 1]).toEqual({ ordering: 'name' })
    })

    it('a navigation that drops the keys does not erase what is remembered', async () => {
        mockQuery.value = { ordering: 'name' }
        use({ persistKeys: ['ordering'], restoreValue: () => undefined })
        mockQuery.value = { ordering: '-rating' }
        await settle()
        expect(stored().extras).toEqual({ ordering: '-rating' })

        mockQuery.value = {}
        await settle()

        expect(stored().extras).toEqual({ ordering: '-rating' })
    })

    it('forgetExtras forgets the remembered keys, keeps the filters, and nothing comes back on a bare URL', async () => {
        window.sessionStorage.setItem(KEY, JSON.stringify({ filters: { onHand: '1' }, extras: { ordering: 'name' }, ts: Date.now() }))
        const { forgetExtras } = use({ persistKeys: ['ordering'] })
        await settle()

        forgetExtras()
        expect(stored().filters).toEqual({ onHand: '1' })
        expect(stored().extras).toBeUndefined()
        replacedQueries.length = 0
        mockQuery.value = {}
        await settle()

        expect(replacedQueries.some(q => 'ordering' in q)).toBe(false)
    })

    it('stores and restores several keys together, so a random sort keeps its seed', async () => {
        mockQuery.value = { ordering: 'random', seed: 'abc-123' }
        use({ persistKeys: ['ordering', 'seed'] })
        mockQuery.value = { ordering: 'random', seed: 'abc-124' }
        await settle()
        expect(stored().extras).toEqual({ ordering: 'random', seed: 'abc-124' })
        scope.stop()
        scope = effectScope()
        mockQuery.value = {}
        const { restoredExtras } = use({ persistKeys: ['ordering', 'seed'] })
        await settle()
        expect(restoredExtras).toEqual({ ordering: 'random', seed: 'abc-124' })
        expect(replacedQueries[replacedQueries.length - 1]).toEqual({ ordering: 'random', seed: 'abc-124' })
    })

    it('hands back the restored sort right away, before the URL has been updated', () => {
        window.sessionStorage.setItem(KEY, JSON.stringify({ filters: {}, extras: { ordering: '-rating' }, ts: Date.now() }))
        const { restoredExtras } = use({ persistKeys: ['ordering'] })
        expect(restoredExtras).toEqual({ ordering: '-rating' })
    })

    it('hands back nothing for a key the URL already has, or when the URL carries a filter', () => {
        window.sessionStorage.setItem(KEY, JSON.stringify({ filters: { onHand: '1' }, extras: { ordering: '-rating' }, ts: Date.now() }))
        mockQuery.value = { ordering: 'name' }
        expect(use({ persistKeys: ['ordering'] }).restoredExtras).toEqual({})
        scope.stop()
        scope = effectScope()
        mockQuery.value = { onHand: '0' }
        expect(use({ persistKeys: ['ordering'] }).restoredExtras).toEqual({})
    })

    it('does not bring back a key the user removed after the first load', async () => {
        window.sessionStorage.setItem(KEY, JSON.stringify({ filters: {}, extras: { ordering: '-rating', seed: 'abc-123' }, ts: Date.now() }))
        use({ persistKeys: ['ordering', 'seed'] })
        await settle()
        expect(replacedQueries[replacedQueries.length - 1]).toEqual({ ordering: '-rating', seed: 'abc-123' })
        replacedQueries.length = 0

        mockQuery.value = { ordering: 'name' }
        await settle()

        expect(replacedQueries.some(q => 'seed' in q)).toBe(false)
        expect(stored().extras).toEqual({ ordering: 'name' })
    })

    it('lets restoreValue leave a remembered value out, or swap it, and tells it the key, the stored value and the URL query', async () => {
        window.sessionStorage.setItem(KEY, JSON.stringify({ filters: {}, extras: { ordering: 'random', seed: 'abc-123', other: 'x' }, ts: Date.now() }))
        mockQuery.value = { query: 'pasta' }
        const restoreValue = vi.fn((key: string, value: string) => key === 'seed' ? 'fresh-456' : key === 'other' ? undefined : value)
        const { restoredExtras } = use({ persistKeys: ['ordering', 'seed', 'other'], restoreValue })
        await settle()
        expect(restoredExtras).toEqual({ ordering: 'random', seed: 'fresh-456' })
        expect(replacedQueries[replacedQueries.length - 1]).toEqual({ query: 'pasta', ordering: 'random', seed: 'fresh-456' })
        expect(restoreValue).toHaveBeenCalledWith('seed', 'abc-123', { query: 'pasta' })
    })

    it('stores nothing extra when no keys are asked for', async () => {
        mockQuery.value = { ordering: '-rating' }
        const { setFilter } = use()
        setFilter('onHand', '1')
        await settle()
        expect(stored().extras).toBeUndefined()
    })

    it('does not write the sort of another page under this page\'s key', async () => {
        mockQuery.value = { ordering: 'name' }
        use({ persistKeys: ['ordering'] })
        ;(mockRoute as any).path = '/books'
        mockQuery.value = { ordering: '-created_at' }
        await settle()
        expect(window.sessionStorage.getItem('url_filters:/books')).toBeNull()
        expect(stored().extras).toEqual({ ordering: 'name' })
    })
})
