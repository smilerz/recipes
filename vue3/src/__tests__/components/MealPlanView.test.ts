/**
 * MealPlanView chooses between the calendar and the phone's day list, per the device setting mealplan_view:
 * 'auto' (the default) shows the list on a phone and the calendar elsewhere, 'list' / 'calendar' force one.
 * It also hosts the dialogs the list asks for (add on a day, edit an entry).
 */
import {describe, it, expect, vi, beforeEach} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {createPinia, setActivePinia} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'

import {apiMock, resetApiMock} from '@/__tests__/api-mock'

const display = vi.hoisted(() => ({mobile: true}))

vi.mock('@/openapi', async (imp) => ({...(await imp<any>()), ApiApi: class { constructor() { return apiMock } }}))
vi.mock('@vueuse/core', async (imp) => {
    const {ref} = await import('vue')
    return {...(await imp<any>()), useStorage: (_key: string, defaultValue: any) => ref(defaultValue)}
})
vi.mock('@vueuse/router', () => ({useRouteQuery: () => ({value: false})}))
vi.mock('vue-router', () => ({useRouter: () => ({push: vi.fn(), replace: vi.fn()}), useRoute: () => ({query: {}})}))
vi.mock('vue-simple-calendar', () => ({
    CalendarView: {template: '<div class="stub-calendar"><slot name="header" :headerProps="{}" /></div>'},
    CalendarViewHeader: {template: '<div />'},
}))

import MealPlanView from '@/components/display/MealPlanView.vue'
import {useUserPreferenceStore} from '@/stores/UserPreferenceStore'

function mountView(view?: 'auto' | 'list' | 'calendar') {
    const pinia = createPinia()
    setActivePinia(pinia)
    if (view) (useUserPreferenceStore().deviceSettings as any).mealplan_view = view
    // Vuetify reads the window width when it is created: 500 is a phone (md breakpoint), 1400 a desktop
    window.innerWidth = display.mobile ? 500 : 1400
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {List: 'List', Calendar: 'Calendar', Settings: 'Settings'}}, missingWarn: false, fallbackWarn: false})
    return mount(MealPlanView, {
        attachTo: document.body,
        global: {
            plugins: [pinia, i18n, createVuetify({display: {mobileBreakpoint: 'md'}})],
            stubs: {
                MealPlanCalendarHeader: {template: '<div class="stub-calendar-header"><div class="slot-start"><slot name="actions" /></div><div class="slot-end"><slot name="end-actions" /></div></div>'},
                MealPlanSettingsDrawer: {
                    props: ['modelValue', 'showingCalendar'],
                    template: '<div class="stub-settings-drawer" :data-open="String(modelValue)" :data-calendar="String(showingCalendar)" />',
                },
                MealPlanAgendaList: {
                    emits: ['add', 'edit'],
                    template: `<div class="stub-agenda"><div class="slot-start"><slot name="toolbar-start" /></div><div class="slot-end"><slot name="toolbar-end" /></div>
                        <button class="stub-add" @click="$emit('add', new Date(2026, 10, 24))" />
                        <button class="stub-edit" @click="$emit('edit', {id: 5})" /></div>`,
                },
                ModelEditDialog: {
                    props: ['modelValue', 'item', 'itemDefaults'],
                    template: '<div class="stub-model-edit-dialog" :data-open="String(modelValue)" :data-item-id="item?.id" :data-from="itemDefaults?.fromDate?.getDate()" />',
                },
            },
        },
    })
}

describe('MealPlanView', () => {
    beforeEach(() => {
        resetApiMock()
        apiMock.apiMealPlanList.mockResolvedValue({results: [], next: null})
        display.mobile = true
        document.body.innerHTML = ''
    })

    it('shows the day list on a phone by default', async () => {
        const w = mountView()
        await flushPromises()
        expect(w.find('.stub-agenda').exists()).toBe(true)
        expect(w.find('.stub-calendar').exists()).toBe(false)
    })

    it('shows the calendar on a larger screen by default', async () => {
        display.mobile = false
        const w = mountView()
        await flushPromises()
        expect(w.find('.stub-calendar').exists()).toBe(true)
        expect(w.find('.stub-agenda').exists()).toBe(false)
    })

    it('shows the day list on a larger screen when the setting says list', async () => {
        display.mobile = false
        const w = mountView('list')
        await flushPromises()
        expect(w.find('.stub-agenda').exists()).toBe(true)
        expect(w.find('.stub-calendar').exists()).toBe(false)
    })

    it('shows the calendar on a phone when the setting says calendar', async () => {
        const w = mountView('calendar')
        await flushPromises()
        expect(w.find('.stub-calendar').exists()).toBe(true)
        expect(w.find('.stub-agenda').exists()).toBe(false)
    })

    it('leaves loading to the day list, which loads the days it shows', async () => {
        mountView()
        await flushPromises()
        expect(apiMock.apiMealPlanList).not.toHaveBeenCalled()
    })

    it('switches from the list to the calendar with the toggle, and remembers it', async () => {
        const w = mountView()
        await flushPromises()

        await w.find('[data-test="mealplan-view-calendar"]').trigger('click')
        await flushPromises()

        expect((useUserPreferenceStore().deviceSettings as any).mealplan_view).toBe('calendar')
        expect(w.find('.stub-calendar').exists()).toBe(true)
    })

    it('switches from the calendar to the list with the toggle, and remembers it', async () => {
        display.mobile = false
        const w = mountView()
        await flushPromises()

        await w.find('[data-test="mealplan-view-list"]').trigger('click')
        await flushPromises()

        expect((useUserPreferenceStore().deviceSettings as any).mealplan_view).toBe('list')
        expect(w.find('.stub-agenda').exists()).toBe(true)
    })

    it.each([
        ['the day list', true, 'false'],
        ['the calendar', false, 'true'],
    ])('opens the settings drawer from the gear in %s, telling it whether the calendar is showing', async (_name, mobile, calendarShowing) => {
        display.mobile = mobile
        const w = mountView()
        await flushPromises()
        expect(w.find('.stub-settings-drawer').attributes('data-open')).toBe('false')

        await w.find('[data-test="mealplan-settings"]').trigger('click')
        await flushPromises()

        expect(w.find('.stub-settings-drawer').attributes('data-open')).toBe('true')
        expect(w.find('.stub-settings-drawer').attributes('data-calendar')).toBe(calendarShowing)
    })

    it.each([
        ['the day list', true],
        ['the calendar', false],
    ])('puts the view toggle at the start and the settings gear at the far end of %s', async (_name, mobile) => {
        display.mobile = mobile
        const w = mountView()
        await flushPromises()

        expect(w.find('.slot-start [data-test="mealplan-view-list"]').exists()).toBe(true)
        expect(w.find('.slot-start [data-test="mealplan-settings"]').exists()).toBe(false)
        expect(w.find('.slot-end [data-test="mealplan-settings"]').exists()).toBe(true)
    })

    it('opens the new entry dialog for the day whose add button was tapped', async () => {
        const w = mountView()
        await flushPromises()

        await w.find('.stub-add').trigger('click')
        await flushPromises()

        const dialogs = w.findAll('.stub-model-edit-dialog')
        const opened = dialogs.filter(d => d.attributes('data-open') === 'true')
        expect(opened).toHaveLength(1)
        expect(opened[0].attributes('data-from')).toBe('24')
    })

    it('opens the entry that was tapped for editing', async () => {
        const w = mountView()
        await flushPromises()

        await w.find('.stub-edit').trigger('click')
        await flushPromises()

        const opened = w.findAll('.stub-model-edit-dialog').filter(d => d.attributes('data-open') === 'true')
        expect(opened).toHaveLength(1)
        expect(opened[0].attributes('data-item-id')).toBe('5')
    })
})
