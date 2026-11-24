import {DateTime} from "luxon";
import type {MealPlan} from "@/openapi";

/**
 * one meal plan entry as the phone's day list shows it
 * range is set only for an entry that spans several days, so every day it covers can show how long it runs
 */
export type AgendaEntry = {
    plan: MealPlan,
    title: string,
    mealTypeName: string,
    color: string | null,
    range: { from: Date, to: Date } | null,
}

export type AgendaDay = {
    date: Date,
    key: string,
    isToday: boolean,
    entries: AgendaEntry[],
}

function entryTitle(plan: MealPlan): string {
    if (plan.recipe != undefined) return plan.recipe.name
    return plan.title ?? ''
}

function minutesIntoDay(date: Date): number {
    const dt = DateTime.fromJSDate(date)
    return dt.hour * 60 + dt.minute
}

/**
 * Build the day-by-day list for a window of days: every day is present, even without entries, and an entry
 * appears on each day it covers. A day's entries are ordered by meal type order, then by time of day.
 * @param plans meal plan entries (any that fall outside the window are ignored)
 * @param start first day of the window
 * @param dayCount how many days the window has
 * @param today the day to mark as today (injectable for tests)
 */
export function buildAgendaDays(plans: MealPlan[], start: Date, dayCount: number, today: Date = new Date()): AgendaDay[] {
    const first = DateTime.fromJSDate(start).startOf('day')
    const todayStart = DateTime.fromJSDate(today).startOf('day')

    const days: AgendaDay[] = []
    for (let i = 0; i < dayCount; i++) {
        const day = first.plus({days: i})

        const entries = plans
            .filter(plan => {
                const from = DateTime.fromJSDate(plan.fromDate).startOf('day')
                const to = DateTime.fromJSDate(plan.toDate ?? plan.fromDate).startOf('day')
                return day >= from && day <= to
            })
            .sort((a, b) => (a.mealType?.order ?? Infinity) - (b.mealType?.order ?? Infinity)
                || minutesIntoDay(a.fromDate) - minutesIntoDay(b.fromDate)
                || (a.id ?? 0) - (b.id ?? 0))
            .map(plan => {
                const lastDate = plan.toDate ?? plan.fromDate
                const spansDays = DateTime.fromJSDate(lastDate).startOf('day') > DateTime.fromJSDate(plan.fromDate).startOf('day')
                return {
                    plan,
                    title: entryTitle(plan),
                    mealTypeName: plan.mealType?.name ?? '',
                    color: plan.mealType?.color || null,
                    range: spansDays ? {from: plan.fromDate, to: lastDate} : null,
                } as AgendaEntry
            })

        days.push({date: day.toJSDate(), key: day.toISODate() as string, isToday: day.equals(todayStart), entries})
    }
    return days
}
