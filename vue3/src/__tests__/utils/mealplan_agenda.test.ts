/**
 * buildAgendaDays: turns meal plan entries into the day-by-day list the phone meal plan shows.
 * Every day in the window is present (empty ones too), entries repeat on each day they cover,
 * and a day's entries are ordered by meal type, then by time.
 */
import {describe, it, expect} from 'vitest'
import {DateTime} from 'luxon'
import {makeMealPlan, makeMealType, makeRecipeOverview} from '@/__tests__/factories'
import {buildAgendaDays} from '@/utils/mealplan_agenda'

const at = (iso: string) => DateTime.fromISO(iso).toJSDate()
const TODAY = at('2026-11-23T09:00')

describe('buildAgendaDays', () => {
    it('returns exactly the requested number of days, starting at the start day', () => {
        const days = buildAgendaDays([], TODAY, 3, TODAY)
        expect(days.map(d => d.key)).toEqual(['2026-11-23', '2026-11-24', '2026-11-25'])
    })

    it('keeps days that have no entries', () => {
        const plan = makeMealPlan({id: 1, fromDate: at('2026-11-25T12:00')})
        const days = buildAgendaDays([plan], TODAY, 3, TODAY)
        expect(days.map(d => d.entries.length)).toEqual([0, 0, 1])
    })

    it('marks only the day that is today', () => {
        const days = buildAgendaDays([], TODAY, 3, TODAY)
        expect(days.map(d => d.isToday)).toEqual([true, false, false])
    })

    it('ignores entries outside the window', () => {
        const before = makeMealPlan({id: 1, fromDate: at('2026-11-22T12:00')})
        const after = makeMealPlan({id: 2, fromDate: at('2026-11-26T12:00')})
        const days = buildAgendaDays([before, after], TODAY, 3, TODAY)
        expect(days.flatMap(d => d.entries)).toHaveLength(0)
    })

    it('repeats a multi-day entry on every day it covers, with its full range on each', () => {
        const plan = makeMealPlan({id: 7, fromDate: at('2026-11-23T12:00'), toDate: at('2026-11-25T12:00')})
        const days = buildAgendaDays([plan], TODAY, 4, TODAY)
        expect(days.map(d => d.entries.length)).toEqual([1, 1, 1, 0])
        for (const day of days.slice(0, 3)) {
            expect(day.entries[0].range).toEqual({from: plan.fromDate, to: plan.toDate})
        }
    })

    it('gives a single-day entry no range', () => {
        const plan = makeMealPlan({id: 1, fromDate: at('2026-11-23T12:00'), toDate: at('2026-11-23T12:00')})
        expect(buildAgendaDays([plan], TODAY, 1, TODAY)[0].entries[0].range).toBeNull()
    })

    it("shows a multi-day entry that began before the window on the days that fall inside it", () => {
        const plan = makeMealPlan({id: 7, fromDate: at('2026-11-20T12:00'), toDate: at('2026-11-24T12:00')})
        const days = buildAgendaDays([plan], TODAY, 3, TODAY)
        expect(days.map(d => d.entries.length)).toEqual([1, 1, 0])
    })

    it('orders a day by meal type order, then by time', () => {
        const lunch = makeMealType({id: 1, name: 'Lunch', order: 1})
        const dinner = makeMealType({id: 2, name: 'Dinner', order: 2})
        const plans = [
            makeMealPlan({id: 1, title: 'late dinner', recipe: undefined, mealType: dinner, fromDate: at('2026-11-23T20:00')}),
            makeMealPlan({id: 2, title: 'lunch', recipe: undefined, mealType: lunch, fromDate: at('2026-11-23T12:00')}),
            makeMealPlan({id: 3, title: 'early dinner', recipe: undefined, mealType: dinner, fromDate: at('2026-11-23T18:00')}),
        ]
        const titles = buildAgendaDays(plans, TODAY, 1, TODAY)[0].entries.map(e => e.title)
        expect(titles).toEqual(['lunch', 'early dinner', 'late dinner'])
    })

    it('has an empty title when the entry has neither a recipe nor a title', () => {
        const plan = makeMealPlan({id: 1, recipe: undefined, title: undefined, fromDate: at('2026-11-23T12:00')})
        expect(buildAgendaDays([plan], TODAY, 1, TODAY)[0].entries[0].title).toBe('')
    })

    it.each([[[1, 2]], [[2, 1]]])('orders entries of the same meal type and time by id, whatever order they come in (%j)', (ids) => {
        const plans = ids.map(id => makeMealPlan({id, title: `entry ${id}`, recipe: undefined, fromDate: at('2026-11-23T12:00')}))
        expect(buildAgendaDays(plans, TODAY, 1, TODAY)[0].entries.map(e => e.plan.id)).toEqual([1, 2])
    })

    it('orders by the minute within the same hour', () => {
        // the later minute has the lower id, so only the time can put the earlier one first
        const plans = [
            makeMealPlan({id: 1, recipe: undefined, title: 'half past', fromDate: at('2026-11-23T12:30')}),
            makeMealPlan({id: 2, recipe: undefined, title: 'quarter past', fromDate: at('2026-11-23T12:15')}),
        ]
        expect(buildAgendaDays(plans, TODAY, 1, TODAY)[0].entries.map(e => e.title)).toEqual(['quarter past', 'half past'])
    })

    it('orders by the hour before the minute', () => {
        // 12:59 has the larger minute but the earlier hour
        const plans = [
            makeMealPlan({id: 1, recipe: undefined, title: 'one pm', fromDate: at('2026-11-23T13:00')}),
            makeMealPlan({id: 2, recipe: undefined, title: 'one minute to one', fromDate: at('2026-11-23T12:59')}),
        ]
        expect(buildAgendaDays(plans, TODAY, 1, TODAY)[0].entries.map(e => e.title)).toEqual(['one minute to one', 'one pm'])
    })

    it('puts entries that have no meal type after those that do, without failing', () => {
        const plans = [
            makeMealPlan({id: 1, recipe: undefined, title: 'untyped a', mealType: undefined, fromDate: at('2026-11-23T10:00')}),
            makeMealPlan({id: 2, recipe: undefined, title: 'typed', mealType: makeMealType({order: 3}), fromDate: at('2026-11-23T11:00')}),
            makeMealPlan({id: 3, recipe: undefined, title: 'untyped b', mealType: undefined, fromDate: at('2026-11-23T09:00')}),
        ]
        const entries = buildAgendaDays(plans, TODAY, 1, TODAY)[0].entries
        expect(entries.map(e => e.title)).toEqual(['typed', 'untyped b', 'untyped a'])
        expect(entries[1].mealTypeName).toBe('')
    })

    it('gives an entry with no end date no range', () => {
        const plan = makeMealPlan({id: 1, fromDate: at('2026-11-23T12:00'), toDate: undefined})
        expect(buildAgendaDays([plan], TODAY, 1, TODAY)[0].entries[0].range).toBeNull()
    })

    it("uses the recipe's name, falling back to the entry's own title", () => {
        const withRecipe = makeMealPlan({id: 1, recipe: makeRecipeOverview({name: 'Cider Margarita'}), title: 'ignored', fromDate: at('2026-11-23T12:00')})
        const titleOnly = makeMealPlan({id: 2, recipe: undefined, title: 'Eat out', fromDate: at('2026-11-23T13:00')})
        const entries = buildAgendaDays([withRecipe, titleOnly], TODAY, 1, TODAY)[0].entries
        expect(entries.map(e => e.title).sort()).toEqual(['Cider Margarita', 'Eat out'])
    })

    it("carries the meal type's name and colour, with null for a meal type that has no colour", () => {
        const colored = makeMealPlan({id: 1, mealType: makeMealType({name: 'Bar Menu', color: '#ff0000'}), fromDate: at('2026-11-23T12:00')})
        const plain = makeMealPlan({id: 2, mealType: makeMealType({name: 'Dinner', color: ''}), fromDate: at('2026-11-23T13:00')})
        const entries = buildAgendaDays([colored, plain], TODAY, 1, TODAY)[0].entries
        expect(entries.map(e => [e.mealTypeName, e.color])).toEqual(expect.arrayContaining([['Bar Menu', '#ff0000'], ['Dinner', null]]))
    })
})
