import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {DateTime, Settings} from 'luxon'
import {expiryStatus, expiryColor, expiryDateLabel, pantryGroup, EXPIRING_SOON_DAYS, shelfLifeToDays, shelfLifeFromDays, isoDateToApiDate, stockUpRowFromFood, stockUpRowsFromEntries, stockUpItemsFromRows, useUpItemsFromRows, groupInventoryByFoodUnit, distinctRecentRecipes, foodRecipeUsageMap, recipeFoodIds, recipePantryRows, partitionUseUpRows, pantryJarState} from '@/utils/pantry_utils'

const NOW = new Date('2026-07-15T12:00:00')
const day = (iso: string) => new Date(iso)

// DEFECT-01 regression: date-only `expires` is delivered by the API as a UTC-midnight Date
// (new Date('2026-07-16') === 2026-07-16T00:00:00Z). It must be read by its calendar date, not
// shifted to the previous day for a viewer in a timezone behind UTC. Pin luxon's default zone so
// the test is deterministic regardless of the CI runner's system timezone.
describe('expiry is timezone-safe for date-only values (DEFECT-01)', () => {
    let prevZone: any
    beforeEach(() => { prevZone = Settings.defaultZone; Settings.defaultZone = 'America/Chicago' })  // UTC-5/6
    afterEach(() => { Settings.defaultZone = prevZone })

    const utcDate = (iso: string) => new Date(iso + 'T00:00:00Z')
    const nowAt = (iso: string) => new Date(iso + 'T12:00:00Z')  // midday UTC → same calendar day in Chicago

    it('a lot expiring 4 days out is ok, not soon (no -1 shift)', () => {
        expect(expiryStatus(utcDate('2026-07-18'), nowAt('2026-07-14'))).toBe('ok')
    })
    it('a lot expiring exactly 3 days out is soon (boundary intact)', () => {
        expect(expiryStatus(utcDate('2026-07-17'), nowAt('2026-07-14'))).toBe('soon')
    })
    it('a lot expiring today is expired, not counted as tomorrow', () => {
        expect(expiryStatus(utcDate('2026-07-16'), nowAt('2026-07-16'))).toBe('expired')
    })
    it('pantryGroup follows the same calendar-date logic', () => {
        expect(pantryGroup(utcDate('2026-07-18'), nowAt('2026-07-14'))).toBe('instock')
    })
    it('expiryDateLabel shows the stored calendar day, not the day before', () => {
        const label = expiryDateLabel(utcDate('2026-07-16'))
        expect(label).toContain('2026')
        expect(label).toMatch(/\b16\b/)
        expect(label).not.toMatch(/\b15\b/)
    })
})

describe('expiryStatus', () => {
    it('none when no date', () => expect(expiryStatus(null, NOW)).toBe('none'))
    it('expired today', () => expect(expiryStatus(day('2026-07-15T00:00:00'), NOW)).toBe('expired'))
    it('expired in the past', () => expect(expiryStatus(day('2026-07-10'), NOW)).toBe('expired'))
    it('soon within the window', () => expect(expiryStatus(day('2026-07-17'), NOW)).toBe('soon'))
    it(`soon at exactly ${EXPIRING_SOON_DAYS} days`, () => expect(expiryStatus(day('2026-07-18T00:00:00'), NOW)).toBe('soon'))
    it('ok beyond the window', () => expect(expiryStatus(day('2026-07-20'), NOW)).toBe('ok'))
})

describe('expiryColor', () => {
    it('expired -> error', () => expect(expiryColor('expired')).toBe('error'))
    it('soon -> warning', () => expect(expiryColor('soon')).toBe('warning'))
    it('ok -> neutral', () => expect(expiryColor('ok')).toBe(''))
    it('none -> neutral', () => expect(expiryColor('none')).toBe(''))
})

describe('pantryGroup', () => {
    it('expired -> expiring', () => expect(pantryGroup(day('2026-07-10'), NOW)).toBe('expiring'))
    it('soon -> expiring', () => expect(pantryGroup(day('2026-07-17'), NOW)).toBe('expiring'))
    it('ok -> instock', () => expect(pantryGroup(day('2026-07-25'), NOW)).toBe('instock'))
    it('none -> instock', () => expect(pantryGroup(null, NOW)).toBe('instock'))
})

describe('shelfLifeToDays', () => {
    it('days', () => expect(shelfLifeToDays(5, 'day')).toBe(5))
    it('weeks', () => expect(shelfLifeToDays(2, 'week')).toBe(14))
    it('months', () => expect(shelfLifeToDays(3, 'month')).toBe(90))
    it('null value -> null', () => expect(shelfLifeToDays(null, 'week')).toBe(null))
})

describe('shelfLifeFromDays', () => {
    it('null -> empty in days', () => expect(shelfLifeFromDays(null)).toEqual({value: null, period: 'day'}))
    it('30 -> 1 month', () => expect(shelfLifeFromDays(30)).toEqual({value: 1, period: 'month'}))
    it('90 -> 3 months', () => expect(shelfLifeFromDays(90)).toEqual({value: 3, period: 'month'}))
    it('14 -> 2 weeks', () => expect(shelfLifeFromDays(14)).toEqual({value: 2, period: 'week'}))
    it('7 -> 1 week', () => expect(shelfLifeFromDays(7)).toEqual({value: 1, period: 'week'}))
    it('5 -> 5 days', () => expect(shelfLifeFromDays(5)).toEqual({value: 5, period: 'day'}))
    it('10 -> 10 days (not weekly)', () => expect(shelfLifeFromDays(10)).toEqual({value: 10, period: 'day'}))
    it('prefers months when both divide (210 -> 7 months)', () => expect(shelfLifeFromDays(210)).toEqual({value: 7, period: 'month'}))
})

// Contract rewritten 2026-07-16 (user-directed requirement change, DEC-1): the pack is the only
// fallback and there is NO default-unit injection — a food without a pack unit stays blank.
describe('stockUpRowFromFood', () => {
    const lb = {id: 1, name: 'lb'} as any

    it('uses the pack amount and preferred shopping unit', () => {
        const row = stockUpRowFromFood({shoppingAmount: 5, preferredShoppingUnit: lb}, NOW)
        expect(row.amount).toBe(5)
        expect(row.unit).toBe(lb)
        expect(row.expires).toBe(null)
    })

    it('falls back to 1 with NO unit when the food has no pack', () => {
        const row = stockUpRowFromFood({}, NOW)
        expect(row.amount).toBe(1)
        expect(row.unit).toBe(null)
    })

    it('computes expiry from shelf life', () => {
        const row = stockUpRowFromFood({shelfLifeDays: 3}, NOW)
        expect(row.expires && DateTime.fromJSDate(row.expires).toISODate()).toBe('2026-07-18')
    })
})

describe('stockUpRowsFromEntries (DEC-1: entry -> pack -> blank)', () => {
    const l = {id: 5, name: 'l'} as any
    const cup = {id: 6, name: 'cup'} as any
    const bag = {id: 7, name: 'bag'} as any
    const foods: Record<number, any> = {
        1: {id: 1, name: 'Milk'},
        2: {id: 2, name: 'Potatoes', shoppingAmount: 5, preferredShoppingUnit: bag},
        3: {id: 3, name: 'Basil', shelfLifeDays: 3},
    }
    const getFood = (id: number) => foods[id]
    const entry = (foodId: number, over: any = {}) => ({food: {id: foodId}, amount: 0, unit: null, ...over})

    it("uses the entry's own amount and unit", () => {
        const rows = stockUpRowsFromEntries([entry(1, {amount: 2, unit: l})], getFood, NOW)
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({amount: 2, unit: l})
    })

    it('keeps the unit blank when the entry has an amount but no unit', () => {
        const rows = stockUpRowsFromEntries([entry(2, {amount: 3})], getFood, NOW)
        expect(rows[0].amount).toBe(3)
        expect(rows[0].unit).toBe(null)
    })

    it('sums entries sharing the same food and unit', () => {
        const rows = stockUpRowsFromEntries([entry(1, {amount: 1, unit: l}), entry(1, {amount: 2, unit: l})], getFood, NOW)
        expect(rows).toHaveLength(1)
        expect(rows[0].amount).toBe(3)
    })

    it('splits different units of one food into separate rows', () => {
        const rows = stockUpRowsFromEntries([entry(1, {amount: 1, unit: l}), entry(1, {amount: 2, unit: cup})], getFood, NOW)
        expect(rows).toHaveLength(2)
        expect(rows.map(r => r.unit)).toEqual([l, cup])
    })

    it('falls back to the pack only when the entry has neither amount nor unit', () => {
        const rows = stockUpRowsFromEntries([entry(2)], getFood, NOW)
        expect(rows[0]).toMatchObject({amount: 5, unit: bag})
    })

    it('falls back to 1 + blank unit when there is no pack either', () => {
        const rows = stockUpRowsFromEntries([entry(1)], getFood, NOW)
        expect(rows[0].amount).toBe(1)
        expect(rows[0].unit).toBe(null)
    })

    it("computes expiry from the refetched food's shelf life", () => {
        const rows = stockUpRowsFromEntries([entry(3, {amount: 1, unit: cup})], getFood, NOW)
        expect(rows[0].expires && DateTime.fromJSDate(rows[0].expires!).toISODate()).toBe('2026-07-18')
    })

    it('skips entries without a food id', () => {
        expect(stockUpRowsFromEntries([{food: null, amount: 1, unit: l} as any], getFood, NOW)).toHaveLength(0)
    })

    it('skips entries whose food was not refetched', () => {
        expect(stockUpRowsFromEntries([entry(99, {amount: 1, unit: l})], getFood, NOW)).toHaveLength(0)
    })

    it('sums a pack-seeded row with an explicit entry sharing the same unit', () => {
        // info-free entry seeds the pack (5 bag), the explicit 3-bag entry lands on the same
        // (food, unit) key -> one 8-bag row. Locks the mixed-provenance aggregation intent.
        const rows = stockUpRowsFromEntries([entry(2), entry(2, {amount: 3, unit: bag})], getFood, NOW)
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({amount: 8, unit: bag})
    })
})

describe('stockUpRowsFromEntries — shop-date grouping, sort, pantry-aware checked', () => {
    let prevZone: any
    beforeEach(() => { prevZone = Settings.defaultZone; Settings.defaultZone = 'America/Chicago' })
    afterEach(() => { Settings.defaultZone = prevZone })

    const foods: Record<number, any> = {
        1: {id: 1, name: 'Salt', inInventory: 'True'},                                                     // in pantry, fresh
        2: {id: 2, name: 'Apples', inInventory: 'False'},                                                  // not in pantry
        3: {id: 3, name: 'Bread', inInventory: 'True', earliestExpiry: new Date('2026-07-10T00:00:00Z')},  // in pantry, EXPIRED (NOW=07-15)
        4: {id: 4, name: 'Cream', inInventory: 'True', earliestExpiry: new Date('2026-07-16T00:00:00Z')},  // in pantry, expiring SOON
    }
    const getFood = (id: number) => foods[id]
    const at = (iso: string) => new Date(iso + 'T12:00:00Z')  // midday UTC -> unambiguous calendar day in Chicago
    const entry = (foodId: number, completedAt: Date, over: any = {}) =>
        ({food: {id: foodId}, amount: 1, unit: null, completedAt, ...over})

    it('seeds fresh in-pantry unchecked; not-in-pantry or expiring/expired checked', () => {
        const rows = stockUpRowsFromEntries(
            [entry(1, at('2026-07-14')), entry(2, at('2026-07-14')), entry(3, at('2026-07-14')), entry(4, at('2026-07-14'))],
            getFood, NOW)
        expect(rows.find(r => (r.food as any).id === 1)!.checked).toBe(false)  // Salt: in pantry, fresh → unchecked
        expect(rows.find(r => (r.food as any).id === 2)!.checked).toBe(true)   // Apples: not in pantry → checked
        expect(rows.find(r => (r.food as any).id === 3)!.checked).toBe(true)   // Bread: in pantry but EXPIRED → restock
        expect(rows.find(r => (r.food as any).id === 4)!.checked).toBe(true)   // Cream: in pantry but SOON → restock
    })

    it('groups by shop date (most recent first), alphabetical by food within a date', () => {
        const rows = stockUpRowsFromEntries([
            entry(3, at('2026-07-13')),  // Bread — older trip
            entry(1, at('2026-07-14')),  // Salt  — newer trip
            entry(2, at('2026-07-14')),  // Apples— newer trip
        ], getFood, NOW)
        expect(rows.map(r => (r.food as any).name)).toEqual(['Apples', 'Salt', 'Bread'])
    })

    it('carries the shop date on each row', () => {
        const d = at('2026-07-14')
        const rows = stockUpRowsFromEntries([entry(2, d)], getFood, NOW)
        expect(rows[0].completedAt).toEqual(d)
    })

    it('keeps the same food bought on different dates as separate dated rows', () => {
        const rows = stockUpRowsFromEntries([entry(2, at('2026-07-14')), entry(2, at('2026-07-13'))], getFood, NOW)
        expect(rows).toHaveLength(2)
    })
})

// DEFECT-01 class, write side: the generated client serializes date-only fields via
// `toISOString().substring(0,10)`, so the Date handed to it MUST be UTC midnight. A local-midnight
// Date (new Date(iso + 'T00:00:00')) posts the PREVIOUS day for any UTC-ahead viewer.
describe('isoDateToApiDate', () => {
    it('produces exactly UTC midnight so the wire date round-trips in every timezone', () => {
        expect(isoDateToApiDate('2026-12-24').toISOString()).toBe('2026-12-24T00:00:00.000Z')
    })

    it('round-trips through the generated client wire format', () => {
        expect(isoDateToApiDate('2026-12-24').toISOString().substring(0, 10)).toBe('2026-12-24')
    })
})

describe('stockUpItemsFromRows', () => {
    const row = (over: any = {}) => ({food: {id: 10}, checked: true, amount: 2, unit: {id: 3}, expires: null, ...over})

    it('keeps only checked rows and maps to food/amount/unit ids', () => {
        const items = stockUpItemsFromRows([row(), row({food: {id: 11}, checked: false})])
        expect(items).toHaveLength(1)
        expect(items[0]).toMatchObject({food: 10, amount: 2, unit: 3, expires: null})
    })

    it('converts the expiry string to a Date', () => {
        const items = stockUpItemsFromRows([row({expires: '2026-08-01'})])
        expect(items[0].expires).toBeInstanceOf(Date)
    })

    it('uses a null unit when none is selected', () => {
        const items = stockUpItemsFromRows([row({unit: null})])
        expect(items[0].unit).toBe(null)
    })

    it("includes the row's inventory location id (FR-F4)", () => {
        const items = stockUpItemsFromRows([row({location: {id: 4, name: 'Freezer'}})])
        expect(items[0].inventoryLocation).toBe(4)
    })

    it('maps a missing location to null (backend falls back to the household default)', () => {
        const items = stockUpItemsFromRows([row()])
        expect(items[0].inventoryLocation).toBe(null)
    })
})

describe('pantryJarState', () => {
    it('absent when not in inventory (no color, no icon)', () => {
        expect(pantryJarState(false, null, NOW)).toEqual({state: 'absent', color: '', present: false})
    })
    it('in-stock (sage) when on hand and undated', () => {
        expect(pantryJarState(true, null, NOW)).toEqual({state: 'in-stock', color: 'success', present: true})
    })
    it('in-stock when on hand and expiry beyond the window', () => {
        expect(pantryJarState(true, day('2026-07-25'), NOW).state).toBe('in-stock')
    })
    it('expiring (amber) when earliest lot is within the window', () => {
        expect(pantryJarState(true, day('2026-07-17'), NOW)).toEqual({state: 'expiring', color: 'warning', present: true})
    })
    it('expired (red) when earliest lot is today or past', () => {
        expect(pantryJarState(true, day('2026-07-10'), NOW)).toEqual({state: 'expired', color: 'error', present: true})
    })
})

// Contract extended 2026-07-17 (DEC-2/DEC-3, approved plan): rows are per (food, unit), every item
// carries its unit scope, and a unit re-declaration (newUnit) counts as a change on its own.
describe('useUpItemsFromRows', () => {
    const gal = {id: 7, name: 'gallon'} as any
    const cup = {id: 8, name: 'cup'} as any

    it('keeps only changed rows and maps food + new total + unit scope', () => {
        const items = useUpItemsFromRows([
            {food: {id: 1}, unit: gal, amount: 2, original: 5},   // reduced
            {food: {id: 2}, unit: cup, amount: 3, original: 3},   // unchanged -> skipped
            {food: {id: 3}, unit: null, amount: 0, original: 4},  // used up, unit-less lot
        ])
        expect(items).toEqual([
            {food: 1, amount: 2, unit: 7, newUnit: null},
            {food: 3, amount: 0, unit: null, newUnit: null},
        ])
    })

    it('includes a row whose only change is the unit re-declaration', () => {
        const items = useUpItemsFromRows([
            {food: {id: 1}, unit: gal, newUnit: cup, amount: 1, original: 1},
        ])
        expect(items).toEqual([{food: 1, amount: 1, unit: 7, newUnit: 8}])
    })

    it('skips rows with neither amount nor unit change', () => {
        expect(useUpItemsFromRows([{food: {id: 1}, unit: gal, newUnit: null, amount: 1, original: 1}])).toEqual([])
    })
})

describe('groupInventoryByFoodUnit', () => {
    const gal = {id: 7, name: 'gallon'}
    const cup = {id: 8, name: 'cup'}
    const milk = {id: 1, name: 'Milk'}
    const butter = {id: 2, name: 'Butter'}
    const lot = (food: any, unit: any, amount: number) => ({food, unit, amount} as any)

    it('one row per (food, unit), summing lots that share both', () => {
        const rows = groupInventoryByFoodUnit([lot(milk, gal, 1), lot(milk, gal, 2), lot(butter, null, 1)])
        expect(rows).toHaveLength(2)
        expect(rows[0]).toMatchObject({amount: 3, original: 3, unit: gal})
        expect(rows[1]).toMatchObject({amount: 1, unit: null})
    })

    it('does NOT merge different units of one food (regression: gallon + cup is not "3 gallon")', () => {
        const rows = groupInventoryByFoodUnit([lot(milk, gal, 1), lot(milk, cup, 2)])
        expect(rows).toHaveLength(2)
        expect(rows.map(r => [r.amount, r.unit])).toEqual([[1, gal], [2, cup]])
    })

    it('skips zeroed and food-less lots', () => {
        const rows = groupInventoryByFoodUnit([lot(milk, gal, 0), lot(null, gal, 2)])
        expect(rows).toHaveLength(0)
    })

    it('skips lots whose amount does not parse (NaN never seeds a row)', () => {
        expect(groupInventoryByFoodUnit([lot(milk, gal, 'not-a-number' as any)])).toHaveLength(0)
    })
})

describe('distinctRecentRecipes', () => {
    const log = (recipe: number | null, recipeName = `r${recipe}`) => ({recipe, recipeName})

    it('dedupes by recipe id, keeping most-recent-first order', () => {
        const out = distinctRecentRecipes([log(3), log(1), log(3), log(2)], 5)
        expect(out).toEqual([{id: 3, name: 'r3'}, {id: 1, name: 'r1'}, {id: 2, name: 'r2'}])
    })

    it('caps at the limit', () => {
        expect(distinctRecentRecipes([log(1), log(2), log(3)], 2)).toHaveLength(2)
    })

    it('skips logs without a recipe id', () => {
        expect(distinctRecentRecipes([log(null), log(1)], 5)).toEqual([{id: 1, name: 'r1'}])
    })
})

describe('foodRecipeUsageMap', () => {
    it('reverses recipes→foods into food→recipe names', () => {
        const map = foodRecipeUsageMap([
            {name: 'Pancakes', foodIds: [1, 2]},
            {name: 'Omelette', foodIds: [2, 3]},
        ])
        expect(map.get(1)).toEqual(['Pancakes'])
        expect(map.get(2)).toEqual(['Pancakes', 'Omelette'])
        expect(map.get(3)).toEqual(['Omelette'])
    })

    it('does not duplicate a recipe name for a food it uses twice', () => {
        const map = foodRecipeUsageMap([{name: 'Pancakes', foodIds: [1, 1]}])
        expect(map.get(1)).toEqual(['Pancakes'])
    })

    it('skips a nameless recipe so no food gets a blank "used in"', () => {
        const map = foodRecipeUsageMap([{name: '', foodIds: [1]}, {name: 'Omelette', foodIds: [1]}])
        expect(map.get(1)).toEqual(['Omelette'])
    })
})

describe('recipeFoodIds', () => {
    it('collects distinct food ids across steps and ingredients', () => {
        const recipe = {steps: [
            {ingredients: [{food: {id: 1}}, {food: {id: 2}}]},
            {ingredients: [{food: {id: 2}}, {food: {id: 3}}, {food: null}]},
        ]}
        expect(recipeFoodIds(recipe).sort()).toEqual([1, 2, 3])
    })

    it('is safe on a recipe with no steps (RecipeOverview)', () => {
        expect(recipeFoodIds({} as any)).toEqual([])
    })
})

describe('recipePantryRows', () => {
    const recipe = {steps: [
        {ingredients: [
            {amount: 2, unit: {name: 'cup'}, food: {id: 1, name: 'Flour', inInventory: 'true'}},
            {amount: 1, unit: null, food: {id: 2, name: 'Egg', inInventory: 'false'}},
        ]},
        {ingredients: [
            {amount: 0.5, unit: {name: 'tsp'}, food: {id: 3, name: 'Salt', inInventory: 'true'}},
            {amount: 1, unit: {name: 'pinch'}, food: null},  // no-food ingredient (header) skipped
        ]},
    ]}

    it('builds one row per ingredient that has a food, with need + in-pantry flag', () => {
        const rows = recipePantryRows(recipe)
        expect(rows).toHaveLength(3)
        expect(rows[0]).toMatchObject({amount: 2, inPantry: true})
        expect(rows[0].food.name).toBe('Flour')
        expect(rows[1]).toMatchObject({amount: 1, inPantry: false})
    })

    it('parses the string inInventory annotation into a boolean', () => {
        const rows = recipePantryRows(recipe)
        expect(rows.map(r => r.inPantry)).toEqual([true, false, true])
    })

    it("accepts Django's capitalized 'True'/'False' annotation", () => {
        const r = recipePantryRows({steps: [{ingredients: [
            {amount: 1, unit: null, food: {id: 1, name: 'A', inInventory: 'True'}},
            {amount: 1, unit: null, food: {id: 2, name: 'B', inInventory: 'False'}},
        ]}]})
        expect(r.map(x => x.inPantry)).toEqual([true, false])
    })

    it('is safe on a recipe with no steps', () => {
        expect(recipePantryRows({} as any)).toEqual([])
    })
})

describe('partitionUseUpRows', () => {
    const row = (foodId: number) => ({food: {id: foodId}, amount: 1, original: 1} as any)

    it('splits rows whose food was recently cooked from the rest, attaching usedIn', () => {
        const usage = new Map<number, string[]>([[1, ['Pancakes']], [2, ['Omelette']]])
        const {recent, other} = partitionUseUpRows([row(1), row(3), row(2)], usage)
        expect(recent.map(r => [r.food.id, r.usedIn])).toEqual([[1, ['Pancakes']], [2, ['Omelette']]])
        expect(other.map(r => r.food.id)).toEqual([3])
    })

    it('puts everything in other when nothing was recently cooked (empty CookLog floor)', () => {
        const {recent, other} = partitionUseUpRows([row(1), row(2)], new Map())
        expect(recent).toHaveLength(0)
        expect(other).toHaveLength(2)
    })
})
