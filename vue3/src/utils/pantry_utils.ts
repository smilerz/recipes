import {DateTime} from "luxon"
import type {Unit} from "@/openapi"
import {parseBooleanAnnotation} from "@/utils/model_utils"

/** A lot expiring within this many days (inclusive) is "expiring soon". */
export const EXPIRING_SOON_DAYS = 3

export type ExpiryStatus = 'expired' | 'soon' | 'ok' | 'none'
export type PantryGroup = 'expiring' | 'instock'

/**
 * Classify an inventory lot's expiry relative to `now` (day-granular):
 * - `none`    — no expiry date
 * - `expired` — expires today or in the past (red)
 * - `soon`    — expires within EXPIRING_SOON_DAYS (amber)
 * - `ok`      — expires later (neutral)
 */
export function expiryStatus(expires: Date | null | undefined, now: Date = new Date()): ExpiryStatus {
    if (!expires) return 'none'
    // `expires` is a date-only value delivered as UTC midnight (new Date('2026-07-16')). Read its
    // calendar date in UTC, then compare against the viewer's local calendar day — both as local
    // midnights so the day diff is an exact integer and never shifts for a behind-UTC viewer.
    const e = DateTime.fromJSDate(expires, {zone: 'utc'})
    const expiryDay = DateTime.local(e.year, e.month, e.day)
    const days = expiryDay.diff(DateTime.fromJSDate(now).startOf('day'), 'days').days
    if (days <= 0) return 'expired'
    if (days <= EXPIRING_SOON_DAYS) return 'soon'
    return 'ok'
}

/** Format a date-only expiry (delivered as UTC midnight) for display without a timezone shift. */
export function expiryDateLabel(expires: Date): string {
    return DateTime.fromJSDate(expires, {zone: 'utc'}).toLocaleString(DateTime.DATE_MED)
}

/** Vuetify color token for an expiry status; '' means neutral/default (no color). */
export function expiryColor(status: ExpiryStatus): string {
    switch (status) {
        case 'expired':
            return 'error'
        case 'soon':
            return 'warning'
        default:
            return ''
    }
}

/** Which pantry group a lot belongs to: expiring-soon (expired or soon) vs in-stock. */
export function pantryGroup(expires: Date | null | undefined, now: Date = new Date()): PantryGroup {
    const status = expiryStatus(expires, now)
    return status === 'expired' || status === 'soon' ? 'expiring' : 'instock'
}

export type ShelfLifePeriod = 'day' | 'week' | 'month'

/** Days per shelf-life period; a month is an approximate 30 days (FR allows approximation). */
export const SHELF_LIFE_PERIOD_DAYS: Record<ShelfLifePeriod, number> = {day: 1, week: 7, month: 30}

/** Convert a shelf-life entered as value + period into stored days (null value -> null). */
export function shelfLifeToDays(value: number | null | undefined, period: ShelfLifePeriod): number | null {
    if (value == null) return null
    return value * SHELF_LIFE_PERIOD_DAYS[period]
}

/**
 * Split stored days back into {value, period} for editing, preferring the largest period that
 * divides evenly (month > week > day). Null/0 -> empty in days.
 */
export function shelfLifeFromDays(days: number | null | undefined): {value: number | null, period: ShelfLifePeriod} {
    if (!days) return {value: null, period: 'day'}
    if (days % SHELF_LIFE_PERIOD_DAYS.month === 0) return {value: days / SHELF_LIFE_PERIOD_DAYS.month, period: 'month'}
    if (days % SHELF_LIFE_PERIOD_DAYS.week === 0) return {value: days / SHELF_LIFE_PERIOD_DAYS.week, period: 'week'}
    return {value: days, period: 'day'}
}

export interface StockUpRowDefaults {
    amount: number
    unit: Unit | null
    expires: Date | null
}

/**
 * Prefill a stock-up row from a food's shopping pack and shelf life (FR-F3, DEC-1):
 * amount = shopping_amount (fallback 1), unit = preferred shopping unit (fallback NONE — a food
 * without a pack unit stays blank, never the user's default unit),
 * expires = today + shelf_life_days (null when the food has no shelf life).
 */
export function stockUpRowFromFood(
    food: {shoppingAmount?: number | null, preferredShoppingUnit?: Unit | null, shelfLifeDays?: number | null},
    now: Date = new Date(),
): StockUpRowDefaults {
    return {
        amount: food.shoppingAmount ?? 1,
        unit: food.preferredShoppingUnit ?? null,
        expires: food.shelfLifeDays ? DateTime.fromJSDate(now).plus({days: food.shelfLifeDays}).toJSDate() : null,
    }
}

export interface StockUpEntrySeed {
    food?: {id?: number | null} | null
    amount?: number | null
    unit?: Unit | null
}

export interface StockUpRowSeed<F = unknown> {
    food: F
    amount: number
    unit: Unit | null
    expires: Date | null
}

/**
 * Seed stock-up rows from checked-off shopping entries (D3, DEC-1: entry -> pack -> blank).
 * An entry's own amount/unit win when either is present (a typed amount with no unit stays
 * unit-less); an information-free entry falls back to the food's pack via stockUpRowFromFood;
 * rows aggregate by (food, unit) — same unit sums, different units stay separate rows.
 */
export function stockUpRowsFromEntries<F extends {shoppingAmount?: number | null, preferredShoppingUnit?: Unit | null, shelfLifeDays?: number | null}>(
    entries: StockUpEntrySeed[],
    getFood: (id: number) => F | undefined,
    now: Date = new Date(),
): StockUpRowSeed<F>[] {
    const byFoodUnit = new Map<string, StockUpRowSeed<F>>()
    for (const entry of entries) {
        const foodId = entry.food?.id
        if (foodId == null) continue
        const food = getFood(foodId)
        if (!food) continue

        const pack = stockUpRowFromFood(food, now)
        const entryAmount = entry.amount != null && Number(entry.amount) > 0 ? Number(entry.amount) : null
        const entryUnit = entry.unit ?? null
        const hasEntryInfo = entryAmount != null || entryUnit != null
        const amount = hasEntryInfo ? (entryAmount ?? 1) : pack.amount
        const unit = hasEntryInfo ? entryUnit : pack.unit

        const key = `${foodId}:${unit?.id ?? 'none'}`
        const existing = byFoodUnit.get(key)
        if (existing) {
            existing.amount += amount
        } else {
            byFoodUnit.set(key, {food, amount, unit, expires: pack.expires})
        }
    }
    return [...byFoodUnit.values()]
}

export interface StockUpRow {
    food: {id?: number | null}
    checked: boolean
    amount: number
    unit: {id?: number | null} | null
    expires: string | null
    location?: {id?: number | null} | null
}

/**
 * Convert a date-only ISO string (YYYY-MM-DD) to the Date the generated client expects.
 * The client serializes date-only fields via `toISOString().substring(0,10)`, so the Date MUST be
 * UTC midnight — `new Date('YYYY-MM-DD')` is spec-defined UTC midnight and round-trips in every
 * timezone. Never build these with `new Date(iso + 'T00:00:00')` (local midnight): a UTC-ahead
 * viewer would post the previous day (DEFECT-01 class, write side).
 */
export function isoDateToApiDate(iso: string): Date {
    return new Date(iso)
}

/** Map the checked stock-up rows to the endpoint payload (food/unit/location ids, expiry as a Date).
 * A null location lets the backend fall back to the household default (FR-B5). */
export function stockUpItemsFromRows(rows: StockUpRow[]) {
    return rows.filter(r => r.checked).map(r => ({
        food: r.food.id!,
        amount: r.amount,
        unit: r.unit?.id ?? null,
        expires: r.expires ? isoDateToApiDate(r.expires) : null,
        inventoryLocation: r.location?.id ?? null,
    }))
}

export interface UseUpRow {
    food: {id?: number | null}
    unit: {id?: number | null} | null
    newUnit?: {id?: number | null} | null
    amount: number
    original: number
}

/**
 * Map the changed use-up rows to the draw-down payload (DEC-2/DEC-3): every item carries its
 * (food, unit) scope — null unit means the unit-less lots — and a unit re-declaration (newUnit)
 * counts as a change even when the amount is untouched.
 */
export function useUpItemsFromRows(rows: UseUpRow[]) {
    return rows
        .filter(r => r.amount !== r.original || r.newUnit != null)
        .map(r => ({
            food: r.food.id!,
            amount: r.amount,
            unit: r.unit?.id ?? null,
            newUnit: r.newUnit?.id ?? null,
        }))
}

/**
 * Group inventory lots into one use-up row per (food, unit) — amounts in different units must
 * never be summed (the "1 gallon + 2 cup = 3 gallon" bug). Zeroed and food-less lots are skipped;
 * `original` mirrors `amount` so an untouched stepper means "no change" (FR-G5).
 */
export function groupInventoryByFoodUnit<F extends {id?: number | null}, U extends {id?: number | null}>(
    entries: Array<{food?: F | null, unit?: U | null, amount?: number | string | null}>,
): Array<{food: F, unit: U | null, amount: number, original: number}> {
    const byKey = new Map<string, {food: F, unit: U | null, amount: number, original: number}>()
    for (const e of entries) {
        const foodId = e.food?.id
        if (foodId == null) continue
        const amount = Number(e.amount ?? 0)
        if (!(amount > 0)) continue  // also rejects NaN, which slips past `<= 0`
        const key = `${foodId}:${e.unit?.id ?? 'none'}`
        const existing = byKey.get(key)
        if (existing) {
            existing.amount += amount
            existing.original += amount
        } else {
            byKey.set(key, {food: e.food!, unit: e.unit ?? null, amount, original: amount})
        }
    }
    return [...byKey.values()]
}

export interface RecentRecipeRef {
    id: number
    name: string
}

/**
 * Distinct recipes from recent cook logs (FR-G1/DEC-7), most-recent-first, capped at `limit`.
 * The caller passes CookLogs already ordered by `-created_at`; this dedupes repeat cooks of the
 * same recipe and bounds how many recipes we then fetch ingredients for.
 */
export function distinctRecentRecipes(
    cookLogs: Array<{recipe?: number | null, recipeName?: string | null}>,
    limit: number,
): RecentRecipeRef[] {
    const seen = new Set<number>()
    const out: RecentRecipeRef[] = []
    for (const log of cookLogs) {
        const id = log.recipe
        if (id == null || seen.has(id)) continue
        seen.add(id)
        out.push({id, name: log.recipeName ?? ''})
        if (out.length >= limit) break
    }
    return out
}

/** Reverse recipes→foods into a food-id → recipe-names map (which recent recipes used each food). */
export function foodRecipeUsageMap(recipes: Array<{name: string, foodIds: number[]}>): Map<number, string[]> {
    const map = new Map<number, string[]>()
    for (const recipe of recipes) {
        if (!recipe.name) continue  // a nameless recipe would render "used in " with a blank
        for (const foodId of new Set(recipe.foodIds)) {
            const names = map.get(foodId) ?? []
            names.push(recipe.name)
            map.set(foodId, names)
        }
    }
    return map
}

/** Distinct food ids across a recipe's steps/ingredients; safe on a RecipeOverview with no steps. */
export function recipeFoodIds(recipe: {steps?: Array<{ingredients?: Array<{food?: {id?: number | null} | null}>}> | null}): number[] {
    const ids = new Set<number>()
    for (const step of recipe.steps ?? []) {
        for (const ingredient of step.ingredients ?? []) {
            const id = ingredient.food?.id
            if (id != null) ids.add(id)
        }
    }
    return [...ids]
}

/**
 * Partition use-up rows into recently-cooked (attaching the recipe names that used each food) and
 * the rest (DEC-7). An empty usage map — no recent cooks — puts everything in `other`, which the
 * dialog renders as the plain whole-pantry list (the graceful floor).
 */
export function partitionUseUpRows<R extends {food: {id?: number | null}}>(
    rows: R[],
    usedInByFood: Map<number, string[]>,
): {recent: Array<R & {usedIn: string[]}>, other: R[]} {
    const recent: Array<R & {usedIn: string[]}> = []
    const other: R[] = []
    for (const row of rows) {
        const usedIn = row.food.id != null ? usedInByFood.get(row.food.id) : undefined
        if (usedIn && usedIn.length) recent.push({...row, usedIn})
        else other.push(row)
    }
    return {recent, other}
}

export interface RecipePantryRow<F = unknown> {
    food: F
    amount: number
    unit: {name?: string | null} | null
    inPantry: boolean
    earliestExpiry: Date | string | null
}

/**
 * One row per recipe ingredient that has a food (FR-I4, "Pantry for this recipe"): the recipe's
 * requirement plus whether the food is on hand. Reads the nested food's `inInventory` string
 * annotation and `earliestExpiry` — both already on the recipe payload — so no inventory fetch is
 * needed. Ingredients without a food (section headers) are skipped; safe on a stepless recipe.
 */
export function recipePantryRows<F extends {inInventory?: string | boolean | null, earliestExpiry?: Date | string | null}>(
    recipe: {steps?: Array<{ingredients?: Array<{amount?: number | null, unit?: {name?: string | null} | null, food?: F | null}>}> | null},
): RecipePantryRow<F>[] {
    const rows: RecipePantryRow<F>[] = []
    for (const step of recipe.steps ?? []) {
        for (const ingredient of step.ingredients ?? []) {
            const food = ingredient.food
            if (!food) continue
            rows.push({
                food,
                amount: Number(ingredient.amount ?? 0),
                unit: ingredient.unit ?? null,
                // inInventory is a Django string annotation ("True"/"False") — parse via the
                // shared helper the shopping/recipe jars already use, not a bare === compare.
                inPantry: parseBooleanAnnotation(food.inInventory),
                earliestExpiry: food.earliestExpiry ?? null,
            })
        }
    }
    return rows
}

export type JarState = 'absent' | 'in-stock' | 'expiring' | 'expired'

export interface JarStateResult {
    state: JarState
    color: string // Vuetify color token; '' = no icon (absent)
    present: boolean
}

/**
 * Resolve the read-only pantry jar state (FR-E2) from a food's in-inventory flag and earliest lot
 * expiry: absent (not on hand) / expired (today or past) / expiring (within the window) / in-stock.
 * One shared resolver for the shopping, recipe, and food surfaces (FR-E5).
 */
export function pantryJarState(inInventory: boolean, earliestExpiry: Date | null | undefined, now: Date = new Date()): JarStateResult {
    if (!inInventory) return {state: 'absent', color: '', present: false}
    const status = expiryStatus(earliestExpiry, now)
    // Tinted states reuse expiryColor so the amber/red tokens live in one place; in-stock diverges
    // deliberately (expiryColor returns '' for 'ok', but an on-hand jar is always sage/success).
    if (status === 'expired') return {state: 'expired', color: expiryColor(status), present: true}
    if (status === 'soon') return {state: 'expiring', color: expiryColor(status), present: true}
    return {state: 'in-stock', color: 'success', present: true}
}
