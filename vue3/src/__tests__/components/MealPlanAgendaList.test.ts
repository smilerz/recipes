/**
 * MealPlanAgendaList: the phone's meal plan - a list of days starting today instead of a calendar grid.
 * It starts with 3 days, grows with "Load more" at the bottom and "Load previous" above the first screen,
 * and reports taps (add on a day, edit on an entry) to the view that hosts the dialogs.
 */
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {createPinia, setActivePinia} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'
import {DateTime} from 'luxon'

import {apiMock, resetApiMock} from '@/__tests__/api-mock'
import {makeMealPlan, makeMealType, makeRecipeOverview} from '@/__tests__/factories'

vi.mock('@/openapi', async (imp) => ({...(await imp<any>()), ApiApi: class { constructor() { return apiMock } }}))
vi.mock('@vueuse/core', async (imp) => ({...(await imp<any>()), useStorage: (_key: string, defaultValue: any) => ({value: defaultValue})}))

import MealPlanAgendaList from '@/components/display/MealPlanAgendaList.vue'
import {useMealPlanStore} from '@/stores/MealPlanStore'

const at = (iso: string) => DateTime.fromISO(iso).toJSDate()

function mountList() {
    const pinia = createPinia()
    setActivePinia(pinia)
    const i18n = createI18n({
        legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false,
        messages: {en: {
            Today: 'Today', load_more: 'Load more', LoadPrevious: 'Load previous', JumpToDate: 'Jump to date',
            AgendaAddEntryFor: 'Add entry for {date}', AgendaEntryLabel: '{mealType}, {title}',
        }},
    })
    const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})
    return mount(MealPlanAgendaList, {
        attachTo: document.body,
        global: {
            plugins: [pinia, i18n, vuetify],
            // the picker itself is Vuetify's; here it only has to hand over a chosen date
            // the menu's content is teleported and only rendered while open; render it in place so its Today button can be reached
            stubs: {
                VMenu: {template: '<div class="menu-stub"><slot /></div>'},
                VDatePicker: {props: ['modelValue'], emits: ['update:modelValue'], template: '<div class="date-picker-stub" />'},
            },
        },
    })
}

const days = (w: any) => w.findAll('[data-test="agenda-day"]')
const dayKeys = (w: any) => days(w).map((d: any) => d.attributes('data-date'))

describe('MealPlanAgendaList', () => {
    beforeEach(() => {
        vi.useFakeTimers({toFake: ['Date']})
        vi.setSystemTime(new Date(2026, 10, 23, 9, 0))
        resetApiMock()
        apiMock.apiMealPlanList.mockResolvedValue({results: [], next: null})
        Element.prototype.scrollIntoView = vi.fn()
        document.body.innerHTML = ''
    })
    afterEach(() => vi.useRealTimers())

    it('starts with 3 days beginning today and no earlier day', async () => {
        const w = mountList()
        await flushPromises()
        expect(dayKeys(w)).toEqual(['2026-11-23', '2026-11-24', '2026-11-25'])
    })

    it('loads exactly the days it shows', async () => {
        mountList()
        await flushPromises()
        expect(apiMock.apiMealPlanList).toHaveBeenCalledTimes(1)
        expect(apiMock.apiMealPlanList.mock.calls[0][0]).toMatchObject({fromDate: '2026-11-23', toDate: '2026-11-25'})
    })

    it("marks today's header (styled, and announced as the current date) without writing the word Today", async () => {
        const w = mountList()
        await flushPromises()
        expect(days(w).map((d: any) => d.attributes('data-today'))).toEqual(['true', 'false', 'false'])
        expect(days(w)[0].find('header').attributes('aria-current')).toBe('date')
        expect(days(w)[1].find('header').attributes('aria-current')).toBeUndefined()
        expect(days(w)[0].find('header').text()).not.toContain('Today')
    })

    it('scrolls today to the top of the screen, which leaves the Load previous button above it', async () => {
        const w = mountList()
        await flushPromises()
        const calls = (Element.prototype.scrollIntoView as any).mock.instances
        expect(calls.at(-1)).toBe(days(w)[0].element)
    })

    it('puts Load previous before the first day and Load more after the last', async () => {
        const w = mountList()
        await flushPromises()
        const html = w.html()
        expect(html.indexOf('agenda-load-previous')).toBeLessThan(html.indexOf('agenda-day'))
        expect(html.lastIndexOf('agenda-load-more')).toBeGreaterThan(html.lastIndexOf('agenda-day'))
    })

    it('Load more adds 7 days after the last and loads just those', async () => {
        const w = mountList()
        await flushPromises()
        apiMock.apiMealPlanList.mockClear()

        await w.find('[data-test="agenda-load-more"]').trigger('click')
        await flushPromises()

        expect(dayKeys(w)).toHaveLength(10)
        expect(dayKeys(w).slice(2)).toEqual(['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02'])
        expect(apiMock.apiMealPlanList.mock.calls[0][0]).toMatchObject({fromDate: '2026-11-26', toDate: '2026-12-02'})
    })

    it('Load previous adds 7 earlier days before the first and loads just those', async () => {
        const w = mountList()
        await flushPromises()
        apiMock.apiMealPlanList.mockClear()

        await w.find('[data-test="agenda-load-previous"]').trigger('click')
        await flushPromises()

        expect(dayKeys(w)[0]).toBe('2026-11-16')
        expect(dayKeys(w)).toHaveLength(10)
        expect(apiMock.apiMealPlanList.mock.calls[0][0]).toMatchObject({fromDate: '2026-11-16', toDate: '2026-11-22'})
    })

    it('keeps the reader in place when earlier days are added above', async () => {
        const w = mountList()
        await flushPromises()
        const container = w.find('[data-test="agenda-list"]').element as HTMLElement
        let scrollTop = 0
        Object.defineProperty(container, 'scrollTop', {get: () => scrollTop, set: (v: number) => { scrollTop = v }, configurable: true})
        Object.defineProperty(container, 'scrollHeight', {get: () => days(w).length * 100, configurable: true})

        await w.find('[data-test="agenda-load-previous"]').trigger('click')
        await flushPromises()

        // 7 days of 100px were added above, so the same content stays under the finger
        expect(scrollTop).toBe(700)
    })

    it('shows an entry on its day, labelled with its meal type for screen readers', async () => {
        const w = mountList()
        const store = useMealPlanStore()
        await flushPromises()
        store.plans.set(1, makeMealPlan({id: 1, recipe: makeRecipeOverview({name: 'Cider Margarita'}), mealType: makeMealType({name: 'Bar Menu', color: '#ff0000'}), fromDate: at('2026-11-24T12:00')}))
        await flushPromises()

        const entries = days(w)[1].findAll('[data-test="agenda-entry"]')
        expect(entries).toHaveLength(1)
        expect(entries[0].text()).toContain('Cider Margarita')
        expect(entries[0].attributes('aria-label')).toBe('Bar Menu, Cider Margarita')
    })

    it('does not write the meal type out as visible text, only as a coloured bar', async () => {
        const w = mountList()
        const store = useMealPlanStore()
        await flushPromises()
        store.plans.set(1, makeMealPlan({id: 1, recipe: makeRecipeOverview({name: 'Cider Margarita'}), mealType: makeMealType({name: 'Bar Menu', color: '#ff0000'}), fromDate: at('2026-11-24T12:00')}))
        await flushPromises()

        const entry = days(w)[1].find('[data-test="agenda-entry"]')
        expect(entry.text()).not.toContain('Bar Menu')
        const bar = entry.find('[data-test="agenda-entry-bar"]')
        expect(bar.attributes('data-colored')).toBe('true')
        expect(bar.attributes('style')).toContain('rgb(255, 0, 0)')
    })

    it('draws a differently styled bar when the meal type has no colour', async () => {
        const w = mountList()
        const store = useMealPlanStore()
        await flushPromises()
        store.plans.set(1, makeMealPlan({id: 1, mealType: makeMealType({color: ''}), fromDate: at('2026-11-24T12:00')}))
        await flushPromises()

        expect(days(w)[1].find('[data-test="agenda-entry-bar"]').attributes('data-colored')).toBe('false')
    })

    it('repeats a multi-day entry with its full range on every day it covers', async () => {
        const w = mountList()
        const store = useMealPlanStore()
        await flushPromises()
        store.plans.set(1, makeMealPlan({id: 1, fromDate: at('2026-11-24T12:00'), toDate: at('2026-11-25T12:00')}))
        await flushPromises()

        for (const day of [days(w)[1], days(w)[2]]) {
            const range = day.find('[data-test="agenda-entry-range"]')
            expect(range.exists()).toBe(true)
            expect(range.text()).toContain('11/24')
            expect(range.text()).toContain('11/25')
        }
        expect(days(w)[0].find('[data-test="agenda-entry-range"]').exists()).toBe(false)
    })

    it('shows no range on an entry that covers a single day', async () => {
        const w = mountList()
        const store = useMealPlanStore()
        await flushPromises()
        store.plans.set(1, makeMealPlan({id: 1, fromDate: at('2026-11-24T12:00')}))
        await flushPromises()
        expect(w.find('[data-test="agenda-entry-range"]').exists()).toBe(false)
    })

    it('shows an empty day as just its header, with no placeholder text', async () => {
        const w = mountList()
        await flushPromises()
        const day = days(w)[0]
        expect(day.findAll('[data-test="agenda-entry"]')).toHaveLength(0)
        expect(day.text()).not.toMatch(/nothing|empty|no entries|planned/i)
    })

    it('reports the date when the add button of a day is tapped', async () => {
        const w = mountList()
        await flushPromises()
        const add = days(w)[1].find('[data-test="agenda-add"]')
        expect(add.attributes('aria-label')).toContain('Add entry for')

        await add.trigger('click')

        const emitted = w.emitted('add') as any[][]
        expect(emitted).toHaveLength(1)
        expect(DateTime.fromJSDate(emitted[0][0]).toISODate()).toBe('2026-11-24')
    })

    it('reports the entry when it is tapped', async () => {
        const w = mountList()
        const store = useMealPlanStore()
        await flushPromises()
        const plan = makeMealPlan({id: 1, fromDate: at('2026-11-24T12:00')})
        store.plans.set(1, plan)
        await flushPromises()

        await days(w)[1].find('[data-test="agenda-entry"]').trigger('click')

        expect((w.emitted('edit') as any[][])[0][0]).toMatchObject({id: 1})
    })

    it('jumps to a chosen date, showing 3 days from it', async () => {
        const w = mountList()
        await flushPromises()
        apiMock.apiMealPlanList.mockClear()

        ;(w.vm as any).jumpTo(at('2026-12-10T08:00'))
        await flushPromises()

        expect(dayKeys(w)).toEqual(['2026-12-10', '2026-12-11', '2026-12-12'])
        expect(apiMock.apiMealPlanList.mock.calls[0][0]).toMatchObject({fromDate: '2026-12-10', toDate: '2026-12-12'})
    })

    it('has a Today button inside the date picker that returns to today', async () => {
        const w = mountList()
        await flushPromises()
        ;(w.vm as any).jumpTo(at('2026-12-10T08:00'))
        await flushPromises()
        apiMock.apiMealPlanList.mockClear()

        await w.find('[data-test="agenda-picker-today"]').trigger('click')
        await flushPromises()

        expect(dayKeys(w)[0]).toBe('2026-11-23')
        expect(apiMock.apiMealPlanList.mock.calls[0][0]).toMatchObject({fromDate: '2026-11-23'})
    })

    it('goes back to today from a jump', async () => {
        const w = mountList()
        await flushPromises()
        ;(w.vm as any).jumpTo(at('2026-12-10T08:00'))
        await flushPromises()

        await w.find('[data-test="agenda-go-today"]').trigger('click')
        await flushPromises()

        expect(dayKeys(w)[0]).toBe('2026-11-23')
    })
})
