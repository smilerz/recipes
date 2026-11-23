/**
 * Undo for the shopping list: a labelled button that undoes the last action, plus a history menu (like undo in
 * Office) that lists the recent actions and undoes back through the one you pick. Notes that cannot be undone
 * (foods added to the pantry) are listed greyed out.
 */
import {describe, it, expect, beforeEach, vi} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {createPinia, setActivePinia} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'
import {resetApiMock} from '@/__tests__/api-mock'
import {useShoppingStore} from '@/stores/ShoppingStore'
import {useMessageStore} from '@/stores/MessageStore'

vi.mock('@vueuse/core', async (importOriginal) => {
    const {ref} = await import('vue')
    return {
        ...(await importOriginal<typeof import('@vueuse/core')>()),
        useStorage: (_key: string, defaultValue: any) => ref(defaultValue),
    }
})

vi.mock('vue-i18n', async (importOriginal) => ({
    ...(await importOriginal<typeof import('vue-i18n')>()),
    useI18n: () => ({t: (key: string) => key}),
}))

vi.mock('vue-router', () => ({
    useRouter: () => ({push: vi.fn().mockResolvedValue(undefined)}),
}))

vi.mock('@vueuse/router', () => ({
    useRouteQuery: () => ({value: false}),
}))

import ShoppingUndoButton from '@/components/display/ShoppingUndoButton.vue'

function mountButton() {
    const pinia = createPinia()
    setActivePinia(pinia)
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {Undo: 'Undo'}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})
    return mount(ShoppingUndoButton, {global: {plugins: [pinia, i18n, vuetify]}})
}

const entry = (id: number, name: string) => ({id, food: {id, name}}) as any

describe('ShoppingUndoButton', () => {
    beforeEach(() => {
        resetApiMock()
    })

    it('is a text button labelled Undo, disabled until there is something to undo', async () => {
        const w = mountButton()
        const undo = () => w.find('[data-test="shopping-undo"]')

        expect(undo().text()).toContain('Undo')
        expect(undo().attributes('disabled')).toBeDefined()

        useShoppingStore().undoStack.push({type: 'DELAY', entries: [entry(1, 'apple')]} as any)
        await flushPromises()
        expect(undo().attributes('disabled')).toBeUndefined()
        w.unmount()
    })

    it('stays disabled while the history only holds notes', async () => {
        const w = mountButton()
        useShoppingStore().registerNote('PANTRY_ADD', 2)
        await flushPromises()

        expect(w.find('[data-test="shopping-undo"]').attributes('disabled')).toBeDefined()
        w.unmount()
    })

    it('the button undoes the last action', async () => {
        const w = mountButton()
        const spy = vi.spyOn(useShoppingStore(), 'undoChange').mockImplementation(() => {})
        useShoppingStore().undoStack.push({type: 'DELAY', entries: [entry(1, 'apple')]} as any)
        await flushPromises()

        await w.find('[data-test="shopping-undo"]').trigger('click')

        expect(spy).toHaveBeenCalledTimes(1)
        w.unmount()
    })

    it('lists the history newest first, naming the food or counting the items, with notes marked', async () => {
        const w = mountButton()
        const store = useShoppingStore()
        store.undoStack.push({type: 'DELAY', entries: [entry(1, 'apple')]} as any)
        store.undoStack.push({type: 'CHECKED', entries: [entry(2, 'milk'), entry(3, 'eggs')]} as any)
        store.registerNote('PANTRY_ADD', 2)
        await flushPromises()

        const items = (w.vm as any).historyItems
        expect(items.map((i: any) => i.type)).toEqual(['PANTRY_ADD', 'CHECKED', 'DELAY'])
        expect(items.map((i: any) => i.undoable)).toEqual([false, true, true])
        expect(items.map((i: any) => i.index)).toEqual([2, 1, 0])
        expect(items[2].label).toContain('HistoryDelay')
        w.unmount()
    })

    it('choosing an action undoes back through it; choosing the pantry note only explains with a toast', async () => {
        const w = mountButton()
        const store = useShoppingStore()
        const undoUntil = vi.spyOn(store, 'undoUntil').mockImplementation(() => {})
        const toast = vi.spyOn(useMessageStore(), 'addMessage')
        store.undoStack.push({type: 'DELAY', entries: [entry(1, 'apple')]} as any)
        store.registerNote('PANTRY_ADD', 2)
        await flushPromises()
        const [note, delay] = (w.vm as any).historyItems

        ;(w.vm as any).onHistoryClick(note)
        expect(undoUntil).not.toHaveBeenCalled()
        expect(toast).toHaveBeenCalledTimes(1)

        ;(w.vm as any).onHistoryClick(delay)
        expect(undoUntil).toHaveBeenCalledWith(0)
        w.unmount()
    })

    it('the history menu button is disabled while there is no history', async () => {
        const w = mountButton()
        expect(w.find('[data-test="shopping-history"]').attributes('disabled')).toBeDefined()

        useShoppingStore().undoStack.push({type: 'DELAY', entries: [entry(1, 'apple')]} as any)
        await flushPromises()
        expect(w.find('[data-test="shopping-history"]').attributes('disabled')).toBeUndefined()
        w.unmount()
    })
})
