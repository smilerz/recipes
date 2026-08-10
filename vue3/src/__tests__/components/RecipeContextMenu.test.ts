import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia, type PiniaPlugin } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createVuetify } from 'vuetify'
import { createRouter, createMemoryHistory } from 'vue-router'
import { makeRecipeOverview, makeUserPreference, makeSpace } from '../factories'
import { apiMock, resetApiMock } from '../api-mock'

vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/openapi')>()),
    ApiApi: class { constructor() { return apiMock } },
}))

vi.mock('@vueuse/core', async () => {
    const { ref } = await import('vue')
    return {
        useStorage: (_key: string, defaultValue: any) => ref(defaultValue),
        useClipboard: () => ({ copy: vi.fn(), copied: ref(false) }),
        useWakeLock: () => ({ request: vi.fn(), release: vi.fn() }),
        useUrlSearchParams: () => ({}),
    }
})

vi.mock('@vueuse/router', () => ({
    useRouteQuery: () => ({ value: false }),
}))

vi.mock('@/utils/cookie', () => ({
    getCookie: () => 'test-csrf-token',
}))

import RecipeContextMenu from '@/components/inputs/RecipeContextMenu.vue'

const useUpOpenSpy = vi.fn()

function mountMenu(deviceOverrides: Record<string, any> = {}, props: Record<string, any> = {}) {
    const prePopulate: PiniaPlugin = ({ store }) => {
        if (store.$id === 'user_preference_store') {
            store.userSettings = makeUserPreference() as any
            store.activeSpace = makeSpace() as any
            if (Object.keys(deviceOverrides).length > 0) {
                Object.assign(store.deviceSettings, deviceOverrides)
            }
        }
    }
    const pinia = createPinia()
    pinia.use(prePopulate)
    const i18n = createI18n({
        legacy: false, locale: 'en',
        messages: { en: {
            Edit: 'Edit', Add_to_Plan: 'Add to Plan', Add_to_Shopping: 'Add to Shopping',
            Add_to_Book: 'Add to Book', Log_Cooking: 'Log Cooking', Edit_Photo: 'Edit Photo',
            Property_Editor: 'Property Editor', Share: 'Share', Export: 'Export',
            Duplicate: 'Duplicate', Print: 'Print', Delete: 'Delete', Copy: 'Copy',
            DisplaySettings: 'Display Settings', UseUp: 'Use up', PantryForThisRecipe: 'Pantry for this recipe',
        }},
        missingWarn: false, fallbackWarn: false,
    })
    const vuetify = createVuetify()
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/', name: 'StartPage', component: { template: '<div/>' } },
            { path: '/recipe/:id', name: 'RecipeViewPage', component: { template: '<div/>' } },
            { path: '/edit/:model/:id?', name: 'ModelEditPage', component: { template: '<div/>' } },
            { path: '/delete/:model/:id', name: 'ModelDeletePage', component: { template: '<div/>' } },
            { path: '/property-editor', name: 'PropertyEditorPage', component: { template: '<div/>' } },
        ],
    })

    return mount(RecipeContextMenu, {
        props: { recipe: makeRecipeOverview(), ...props },
        global: {
            plugins: [pinia, i18n, vuetify, router],
            stubs: {
                'v-menu': { template: '<div class="stub-v-menu"><slot /></div>' },
                ModelEditDialog: { template: '<div class="stub-model-edit-dialog"/>' },
                RecipeShareDialog: defineComponent({
                    name: 'RecipeShareDialog',
                    // Faithful to the real component: it is v-model controlled (modelValue), NOT
                    // its own internal activator="parent" toggle, which the outer Actions v-menu's
                    // close-on-content-click could not coordinate with (#14: menu never closed).
                    props: { recipe: Object, modelValue: Boolean },
                    emits: ['update:modelValue'],
                    template: '<div class="stub-share-dialog" :data-open="modelValue"/>',
                }),
                AddToShoppingDialog: defineComponent({
                    name: 'AddToShoppingDialog',
                    // Faithful to the real component: it is v-model controlled (modelValue), NOT an
                    // `open` prop. A stub with a phantom `open` prop is what masked D10.
                    props: { recipe: Object, mealPlan: Object, modelValue: Boolean },
                    emits: ['update:modelValue'],
                    template: '<div class="stub-add-shopping" :data-open="modelValue"/>',
                }),
                AddToBookDialog: { template: '<div class="stub-add-book-dialog"/>' },
                LogCookingDialog: { template: '<div class="stub-log-cooking-dialog"/>' },
                DeleteConfirmDialog: { template: '<div class="stub-delete-confirm"/>' },
                UseUpDialog: defineComponent({
                    name: 'UseUpDialog',
                    setup(_, { expose }) {
                        expose({ open: useUpOpenSpy })
                        return () => null
                    },
                }),
            },
        },
    })
}

describe('RecipeContextMenu', () => {
    beforeEach(() => {
        resetApiMock()
    })

    describe('visibility config', () => {
        it('shows default menu items', () => {
            const w = mountMenu()
            const text = w.text()
            expect(text).toContain('Edit')
            expect(text).toContain('Add to Plan')
            expect(text).toContain('Add to Shopping')
            expect(text).toContain('Property Editor')
            expect(text).toContain('Share')
            expect(text).toContain('Duplicate')
            expect(text).toContain('Print')
        })

        it('hides new items by default', () => {
            const w = mountMenu()
            const text = w.text()
            expect(text).not.toContain('Add to Book')
            expect(text).not.toContain('Log Cooking')
            expect(text).not.toContain('Edit Photo')
            expect(text).not.toContain('Export')
            expect(text).not.toContain('Delete')
        })

        it('hides items removed from card_visibleMenuItems', () => {
            const w = mountMenu({
                card_visibleMenuItems: ['edit', 'print'],
            })
            const text = w.text()
            expect(text).toContain('Edit')
            expect(text).toContain('Print')
            expect(text).not.toContain('Add to Plan')
            expect(text).not.toContain('Share')
            expect(text).not.toContain('Duplicate')
        })

        it('shows new items when added to card_visibleMenuItems', () => {
            const w = mountMenu({
                card_visibleMenuItems: ['edit', 'book', 'cooklog', 'photo', 'export', 'delete'],
            })
            const text = w.text()
            expect(text).toContain('Add to Book')
            expect(text).toContain('Log Cooking')
            expect(text).toContain('Edit Photo')
            expect(text).toContain('Export')
            expect(text).toContain('Delete')
        })
    })

    describe('display settings entry', () => {
        it('renders Display Settings on a card route (e.g. SearchPage)', async () => {
            // Default props.context = 'card'; default route is the StartPage stub from
            // mountMenu() above, which is a card-context route, not RecipeViewPage.
            const w = mountMenu()
            expect(w.text()).toContain('Display Settings')
        })

        it('renders Display Settings when on RecipeViewPage', async () => {
            const w = mountMenu({}, { context: 'view' })
            const r = w.vm.$.appContext.config.globalProperties.$router
            await r.push({ name: 'RecipeViewPage', params: { id: '1' } })
            await w.vm.$nextTick()
            expect(w.text()).toContain('Display Settings')
        })
    })

    describe('context gating', () => {
        // photo is intentionally NOT card-only (#10): a quick-edit path already existed for
        // cards, and gating it off the recipe view meant changing a photo required the full
        // edit -> navigate -> save round trip. cooklog stays card-only (unchanged).
        it('hides cooklog (still card-only) but shows photo (#10) when context is view', () => {
            const w = mountMenu({
                card_visibleMenuItems: ['edit', 'book', 'cooklog', 'photo'],
            }, { context: 'view' })
            const text = w.text()
            expect(text).toContain('Edit')
            expect(text).toContain('Add to Book')
            expect(text).not.toContain('Log Cooking')
            expect(text).toContain('Edit Photo')
        })

        it('shows card-only items when context is card', () => {
            const w = mountMenu({
                card_visibleMenuItems: ['edit', 'cooklog', 'photo'],
            }, { context: 'card' })
            const text = w.text()
            expect(text).toContain('Log Cooking')
            expect(text).toContain('Edit Photo')
        })
    })

    // D13: card_visibleMenuItems is a CARD decluttering preference and must not gate the
    // recipe-view menu. The view is the canonical full menu, so an item trimmed from cards
    // still shows on the recipe view (and stays hidden on the card).
    describe('view menu ignores the card visibility list (D13)', () => {
        it('shows items on the recipe view even when the card list excludes them', () => {
            const w = mountMenu({ card_visibleMenuItems: ['edit'] }, { context: 'view' })
            const text = w.text()
            expect(text).toContain('Share')
            expect(text).toContain('Add to Plan')
            expect(text).toContain('Duplicate')
        })

        it('still hides those items on a card when the card list excludes them', () => {
            const w = mountMenu({ card_visibleMenuItems: ['edit'] }, { context: 'card' })
            const text = w.text()
            expect(text).toContain('Edit')
            expect(text).not.toContain('Share')
            expect(text).not.toContain('Add to Plan')
        })
    })
})

describe('use up (view context only)', () => {
    beforeEach(() => { resetApiMock(); useUpOpenSpy.mockClear() })

    const recipeWithFoods = {
        id: 5, name: 'Pancakes',
        steps: [{ingredients: [{food: {id: 1, name: 'Flour'}}, {food: {id: 2, name: 'Milk'}}]}],
    }

    it('shows Use up on the recipe view', () => {
        const w = mountMenu({}, { context: 'view', recipe: recipeWithFoods })
        expect(w.text()).toContain('Use up')
    })

    it('does not show Use up on a card (avoids card_visibleMenuItems gating entirely)', () => {
        const w = mountMenu({}, { context: 'card', recipe: recipeWithFoods })
        expect(w.text()).not.toContain('Use up')
    })

    it('opens the dialog scoped to the recipe food ids from the visible button', async () => {
        const w = mountMenu({}, { context: 'view', recipe: recipeWithFoods })
        const btn = w.findAll('button').find(el => el.text().includes('Use up'))
        await btn!.trigger('click')
        await w.vm.$nextTick()

        expect(useUpOpenSpy).toHaveBeenCalledTimes(1)
        expect(useUpOpenSpy.mock.calls[0][0].foodIds.sort()).toEqual([1, 2])
    })
})

describe('shopping dialog isolation (E-shopping / D10)', () => {
    it('clicking Add to Shopping opens AddToShoppingDialog via v-model (D10: menu item was a no-op)', async () => {
        const w = mountMenu({}, { context: 'card' })

        // Dialog stub must be mounted (always in DOM, controlled by v-model)
        const stubs = w.findAllComponents({ name: 'AddToShoppingDialog' })
        expect(stubs.length, 'AddToShoppingDialog must be mounted').toBeGreaterThan(0)

        // Before click: closed
        expect(stubs[0].props('modelValue'), 'dialog should be closed before click').toBeFalsy()

        // Click the "Add to Shopping" list item
        const items = w.findAll('.v-list-item, li')
        const shoppingItem = items.find(el => el.text().includes('Add to Shopping'))
        expect(shoppingItem, 'Add to Shopping list item must exist').toBeDefined()
        await shoppingItem!.trigger('click')
        await w.vm.$nextTick()

        // After click the dialog must actually open (v-model = true)
        expect(stubs[0].props('modelValue'), 'AddToShoppingDialog should open (modelValue=true) after click').toBe(true)
    })
})

describe('share dialog isolation (#14)', () => {
    it('clicking Share opens RecipeShareDialog via v-model (menu item was activator="parent" nested inside the closing Actions menu)', async () => {
        const w = mountMenu({}, { context: 'card' })

        const stubs = w.findAllComponents({ name: 'RecipeShareDialog' })
        expect(stubs.length, 'RecipeShareDialog must be mounted').toBeGreaterThan(0)
        expect(stubs[0].props('modelValue'), 'dialog should be closed before click').toBeFalsy()

        const items = w.findAll('.v-list-item, li')
        const shareItem = items.find(el => el.text().includes('Share'))
        expect(shareItem, 'Share list item must exist').toBeDefined()
        await shareItem!.trigger('click')
        await w.vm.$nextTick()

        expect(stubs[0].props('modelValue'), 'RecipeShareDialog should open (modelValue=true) after click').toBe(true)
    })
})
