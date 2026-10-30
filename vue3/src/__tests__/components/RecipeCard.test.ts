import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, type PiniaPlugin } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createVuetify } from 'vuetify'
import { createRouter, createMemoryHistory } from 'vue-router'
import { makeRecipeOverview, makeUser, makeUserPreference, makeSpace } from '../factories'

vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/openapi')>()),
    ApiApi: class {},
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

import RecipeCard from '@/components/display/RecipeCard.vue'

function mountRecipeCard(props: Record<string, any> = {}, deviceOverrides: Record<string, any> = {}) {
    const prePopulate: PiniaPlugin = ({ store }) => {
        if (store.$id === 'user_preference_store') {
            store.userSettings = makeUserPreference() as any
            store.activeSpace = makeSpace() as any
            // Apply device settings overrides via the plugin
            if (Object.keys(deviceOverrides).length > 0) {
                Object.assign(store.deviceSettings, deviceOverrides)
            }
        }
    }
    const pinia = createPinia()
    pinia.use(prePopulate)
    const i18n = createI18n({
        legacy: false, locale: 'en',
        messages: { en: { by: 'by', New: 'New' } },
        missingWarn: false, fallbackWarn: false,
    })
    const vuetify = createVuetify()
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/', name: 'StartPage', component: { template: '<div/>' } },
            { path: '/recipe/:id', name: 'RecipeViewPage', component: { template: '<div/>' } },
            { path: '/search', name: 'SearchPage', component: { template: '<div/>' } },
            { path: '/edit/:model/:id?', name: 'ModelEditPage', component: { template: '<div/>' } },
        ],
    })

    return mount(RecipeCard, {
        props: { recipe: makeRecipeOverview(), ...props },
        global: {
            plugins: [pinia, i18n, vuetify, router],
            stubs: {
                RecipeContextMenu: { name: 'RecipeContextMenu', emits: ['preview', 'update:recipe'], template: '<div class="stub-context-menu"/>' },
                RecipePreviewDialog: { name: 'RecipePreviewDialog', props: ['recipe', 'modelValue'], template: '<div class="stub-preview-dialog"/>' },
                RecipeImage: { template: '<div class="stub-recipe-image"><slot name="overlay"/></div>' },
                PrivateRecipeBadge: { template: '<div class="stub-private-badge"/>' },
                KeywordsBar: { template: '<div class="stub-keywords-bar"/>' },
            },
        },
    })
}

describe('RecipeCard preview', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    // jsdom builds pointer events as read-only mouse events, so fire plain events carrying the pointer fields
    const press = async (el: any, pointerType = 'touch') => {
        el.element.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true }), { pointerType, clientX: 10, clientY: 10, button: 0 }))
        await nextTick()
    }
    const hold = async (el: any, pointerType = 'touch') => {
        await press(el, pointerType)
        vi.advanceTimersByTime(600)
        await nextTick()
    }

    it('opens the preview of the recipe when the image is pressed and held', async () => {
        const w = mountRecipeCard({ recipe: makeRecipeOverview({ id: 7 }) })
        expect(w.find('.stub-preview-dialog').exists()).toBe(false)
        await hold(w.find('a'))
        const dialog = w.findComponent({ name: 'RecipePreviewDialog' })
        expect(dialog.exists()).toBe(true)
        expect(dialog.props('recipe')).toMatchObject({ id: 7 })
        expect(dialog.props('modelValue')).toBe(true)
    })

    it('opens the preview when the title is pressed and held', async () => {
        const w = mountRecipeCard()
        await hold(w.find('.flex-grow-1'))
        expect(w.find('.stub-preview-dialog').exists()).toBe(true)
    })

    it('opens the preview for a held mouse button too', async () => {
        const w = mountRecipeCard()
        await hold(w.find('a'), 'mouse')
        expect(w.find('.stub-preview-dialog').exists()).toBe(true)
    })

    it('does not open the preview for a quick press', async () => {
        const w = mountRecipeCard()
        await press(w.find('a'))
        vi.advanceTimersByTime(200)
        await w.find('a').trigger('pointerup')
        vi.advanceTimersByTime(1000)
        await nextTick()
        expect(w.find('.stub-preview-dialog').exists()).toBe(false)
    })

    it('opens the recipe on an ordinary click', async () => {
        const w = mountRecipeCard({ recipe: makeRecipeOverview({ id: 7 }) })
        vi.useRealTimers()
        await w.find('a').trigger('click')
        await flushPromises()
        expect((w.vm as any).$route.name).toBe('RecipeViewPage')
    })

    it('keeps the click that ends a long press from opening the recipe', async () => {
        const w = mountRecipeCard({ recipe: makeRecipeOverview({ id: 7 }) })
        await hold(w.find('a'))
        vi.useRealTimers()
        await w.find('a').trigger('click')
        await flushPromises()
        expect((w.vm as any).$route.name).not.toBe('RecipeViewPage')
        expect(w.find('.stub-preview-dialog').exists()).toBe(true)
    })

    it('opens the recipe on an ordinary click of the title', async () => {
        const w = mountRecipeCard({ recipe: makeRecipeOverview({ id: 7 }) })
        vi.useRealTimers()
        await w.find('.flex-grow-1').trigger('click')
        await flushPromises()
        expect((w.vm as any).$route.name).toBe('RecipeViewPage')
    })

    it('keeps the click that ends a long press of the title from opening the recipe', async () => {
        const w = mountRecipeCard({ recipe: makeRecipeOverview({ id: 7 }) })
        await hold(w.find('.flex-grow-1'))
        vi.useRealTimers()
        await w.find('.flex-grow-1').trigger('click')
        await flushPromises()
        expect((w.vm as any).$route.name).not.toBe('RecipeViewPage')
        expect(w.find('.stub-preview-dialog').exists()).toBe(true)
    })

    it('opens the preview when the context menu asks for it', async () => {
        const w = mountRecipeCard()
        w.findComponent({ name: 'RecipeContextMenu' }).vm.$emit('preview')
        await nextTick()
        expect(w.find('.stub-preview-dialog').exists()).toBe(true)
    })

    it('has no press and hold when the card does not link to the recipe, like the card inside a book', async () => {
        const w = mountRecipeCard({ disableLink: true, showMenu: false })
        await hold(w.find('.flex-grow-1'))
        const image = w.find('.stub-recipe-image').element.parentElement!
        image.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true }), { pointerType: 'touch', clientX: 10, clientY: 10, button: 0 }))
        vi.advanceTimersByTime(600)
        await nextTick()
        expect(w.find('.stub-preview-dialog').exists()).toBe(false)
    })
})

describe('RecipeCard display settings', () => {
    describe('rating display', () => {
        it('shows rating when card_showRating is true and recipe has rating', () => {
            const recipe = makeRecipeOverview({ rating: 3.5 })
            const w = mountRecipeCard({ recipe }, { card_showRating: true })
            expect(w.find('.recipe-card-rating').exists()).toBe(true)
        })

        it('hides rating when card_showRating is false', () => {
            const recipe = makeRecipeOverview({ rating: 3.5 })
            const w = mountRecipeCard({ recipe }, { card_showRating: false })
            expect(w.find('.recipe-card-rating').exists()).toBe(false)
        })

        it('hides rating when recipe has no rating even if setting is on', () => {
            const recipe = makeRecipeOverview({ rating: null })
            const w = mountRecipeCard({ recipe }, { card_showRating: true })
            expect(w.find('.recipe-card-rating').exists()).toBe(false)
        })
    })

    describe('author display', () => {
        it('shows author when card_showAuthor is true', () => {
            const recipe = makeRecipeOverview({ createdBy: makeUser({ displayName: 'Chef Test' }) })
            const w = mountRecipeCard({ recipe }, { card_showAuthor: true })
            expect(w.find('.recipe-card-author').exists()).toBe(true)
            expect(w.text()).toContain('Chef Test')
        })

        it('hides author when card_showAuthor is false', () => {
            const recipe = makeRecipeOverview({ createdBy: makeUser({ displayName: 'Chef Test' }) })
            const w = mountRecipeCard({ recipe }, { card_showAuthor: false })
            expect(w.find('.recipe-card-author').exists()).toBe(false)
        })
    })

    describe('last cooked display', () => {
        it('shows last cooked when card_showLastCooked is true and recipe has lastCooked', () => {
            const recipe = makeRecipeOverview({ lastCooked: new Date('2026-04-10') })
            const w = mountRecipeCard({ recipe }, { card_showLastCooked: true })
            expect(w.find('.recipe-card-last-cooked').exists()).toBe(true)
        })

        it('hides last cooked when card_showLastCooked is false', () => {
            const recipe = makeRecipeOverview({ lastCooked: new Date('2026-04-10') })
            const w = mountRecipeCard({ recipe }, { card_showLastCooked: false })
            expect(w.find('.recipe-card-last-cooked').exists()).toBe(false)
        })

        it('hides last cooked when recipe has no lastCooked even if setting is on', () => {
            const recipe = makeRecipeOverview({ lastCooked: null })
            const w = mountRecipeCard({ recipe }, { card_showLastCooked: true })
            expect(w.find('.recipe-card-last-cooked').exists()).toBe(false)
        })
    })

    describe('new badge display', () => {
        it('shows new badge when card_showNewBadge is true and recipe is new', () => {
            const recipe = makeRecipeOverview({ _new: true })
            const w = mountRecipeCard({ recipe }, { card_showNewBadge: true })
            expect(w.find('.recipe-card-new-badge').exists()).toBe(true)
        })

        it('hides new badge when card_showNewBadge is false', () => {
            const recipe = makeRecipeOverview({ _new: true })
            const w = mountRecipeCard({ recipe }, { card_showNewBadge: false })
            expect(w.find('.recipe-card-new-badge').exists()).toBe(false)
        })
    })

    describe('make now badge', () => {
        it('shows the badge when card_showMakeNowBadge is true and the recipe can be made now', () => {
            const w = mountRecipeCard({ recipe: makeRecipeOverview({ makenow: true } as any) }, { card_showMakeNowBadge: true })
            expect(w.find('.recipe-card-makenow-badge').exists()).toBe(true)
        })

        it('hides the badge when card_showMakeNowBadge is false', () => {
            const w = mountRecipeCard({ recipe: makeRecipeOverview({ makenow: true } as any) }, { card_showMakeNowBadge: false })
            expect(w.find('.recipe-card-makenow-badge').exists()).toBe(false)
        })

        it.each([false, null])('hides the badge for a recipe that cannot be made now (makenow %s) even if the setting is on', (makenow) => {
            const w = mountRecipeCard({ recipe: makeRecipeOverview({ makenow } as any) }, { card_showMakeNowBadge: true })
            expect(w.find('.recipe-card-makenow-badge').exists()).toBe(false)
        })

        describe('as an icon', () => {
            const on = () => mountRecipeCard({ recipe: makeRecipeOverview({ makenow: true } as any) }, { card_showMakeNowBadge: true })

            it('is the fork and knife icon of the ready to cook stat, with no text on the card', () => {
                const chip = on().find('.recipe-card-makenow-badge')
                expect(chip.find('.fa-utensils').exists()).toBe(true)
                expect(chip.text()).toBe('')
            })

            it('says what it is to screen readers and on hover', () => {
                const chip = on().find('.recipe-card-makenow-badge')
                expect(chip.attributes('role')).toBe('img')
                expect(chip.attributes('aria-label')).toBe('MakeNow')
                expect(chip.attributes('title')).toBe('MakeNow')
            })
        })

        describe('where it sits', () => {
            // the selection checkbox of the search page is at the top left of a card and the rating at the top right,
            // so the chip is at the bottom right
            const card = (deviceOverrides: Record<string, any>, makenow = true) =>
                mountRecipeCard({ recipe: makeRecipeOverview({ makenow, rating: 4.5, createdBy: makeUser({ displayName: 'Chef Test' }) } as any) },
                    { card_showMakeNowBadge: true, card_showRating: true, card_showAuthor: true, ...deviceOverrides })

            it('is in the bottom right corner, away from the selection checkbox and the rating', () => {
                const chip = card({}).find('.recipe-card-makenow-badge')
                expect(chip.classes()).toContain('card-overlay-bottom-right')
                expect(chip.classes()).not.toContain('card-overlay-top-right')
                expect(chip.classes()).not.toContain('card-overlay-top-left')
            })

            it('leaves the rating where it is', () => {
                expect(card({}).find('.recipe-card-rating').classes()).not.toContain('recipe-card-rating-shifted')
            })

            const authorPill = (w: ReturnType<typeof mountRecipeCard>) => w.find('.recipe-card-author').element.parentElement!

            it('moves the author and last cooked pill over to make room for it', () => {
                expect(authorPill(card({})).classList.contains('recipe-card-meta-shifted')).toBe(true)
            })

            it('leaves the author and last cooked pill where it is when there is no chip', () => {
                expect(authorPill(card({}, false)).classList.contains('recipe-card-meta-shifted')).toBe(false)
                expect(authorPill(card({ card_showMakeNowBadge: false })).classList.contains('recipe-card-meta-shifted')).toBe(false)
            })
        })

        describe('ring around the picture', () => {
            const ring = (w: ReturnType<typeof mountRecipeCard>) => w.find('.stub-recipe-image').classes().includes('recipe-card-makenow-ring')

            it('frames the picture of a recipe that can be made now', () => {
                expect(ring(mountRecipeCard({ recipe: makeRecipeOverview({ makenow: true } as any) }, { card_showMakeNowBadge: true }))).toBe(true)
            })

            it('is off when the setting is off', () => {
                expect(ring(mountRecipeCard({ recipe: makeRecipeOverview({ makenow: true } as any) }, { card_showMakeNowBadge: false }))).toBe(false)
            })

            it.each([false, null])('is off for a recipe that cannot be made now (makenow %s)', (makenow) => {
                expect(ring(mountRecipeCard({ recipe: makeRecipeOverview({ makenow } as any) }, { card_showMakeNowBadge: true }))).toBe(false)
            })

            it('is not drawn on the cards that do not link to their recipe, only the badge shows there too', () => {
                // the card inside a book or the preview keeps both, so the ring follows the same rule as the badge
                const w = mountRecipeCard({ recipe: makeRecipeOverview({ makenow: true } as any), disableLink: true, showMenu: false }, { card_showMakeNowBadge: true })
                expect(ring(w)).toBe(true)
                expect(w.find('.recipe-card-makenow-badge').exists()).toBe(true)
            })
        })

        it('is off by default', async () => {
            const { useUserPreferenceStore } = await import('@/stores/UserPreferenceStore')
            const w = mountRecipeCard({ recipe: makeRecipeOverview({ makenow: true } as any) })
            expect(useUserPreferenceStore().deviceSettings.card_showMakeNowBadge).toBe(false)
            expect(w.find('.recipe-card-makenow-badge').exists()).toBe(false)
        })
    })

    describe('cook time chip', () => {
        // The cook time chip (workingTime + waitingTime) shows in the
        // keyword chip row; gated by card_show_cook_time which defaults ON
        // to preserve current behavior (Q3a).

        it('shows cook time chip when card_show_cook_time is true and workingTime > 0', () => {
            const recipe = makeRecipeOverview({ workingTime: 15, waitingTime: 5 })
            const w = mountRecipeCard({ recipe }, { card_show_cook_time: true })
            // Cook time chip uses prepend-icon "far fa-clock"
            const html = w.html()
            expect(html).toContain('fa-clock')
            expect(w.text()).toContain('20')
        })

        it('hides cook time chip when card_show_cook_time is false', () => {
            const recipe = makeRecipeOverview({ workingTime: 15, waitingTime: 5 })
            const w = mountRecipeCard({ recipe }, { card_show_cook_time: false })
            // Should not render the cook-time chip even with workingTime > 0
            const html = w.html()
            expect(html).not.toContain('fa-clock')
        })

        it('hides cook time chip when workingTime is 0 even with setting on', () => {
            const recipe = makeRecipeOverview({ workingTime: 0, waitingTime: 0 })
            const w = mountRecipeCard({ recipe }, { card_show_cook_time: true })
            expect(w.html()).not.toContain('fa-clock')
        })
    })

    describe('photo refresh after context-menu edit', () => {
        // Regression: editing a photo via the recipe context menu refreshes
        // the dialog but didn't propagate the new recipe back to the card,
        // so the thumbnail stayed stale until manual page refresh. The
        // RecipeContextMenu already emits update:recipe after the dialog
        // closes; the card must listen and re-bind RecipeImage.

        function mountForRefreshTest(originalRecipe: any, opts: {imageStub?: boolean} = {}) {
            const ContextMenuStub = {
                props: ['recipe'],
                emits: ['update:recipe'],
                template: '<div class="stub-context-menu"></div>',
            }
            const RecipeImageStub = {
                props: ['recipe'],
                template: '<div class="stub-recipe-image" :data-image="recipe?.image"><slot name="overlay"/></div>',
            }
            const prePopulate: PiniaPlugin = ({ store }) => {
                if (store.$id === 'user_preference_store') {
                    store.userSettings = makeUserPreference() as any
                    store.activeSpace = makeSpace() as any
                }
            }
            const pinia = createPinia()
            pinia.use(prePopulate)
            const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
            const router = createRouter({history: createMemoryHistory(), routes: [
                {path: '/', name: 'StartPage', component: {template: '<div/>'}},
                {path: '/recipe/:id', name: 'RecipeViewPage', component: {template: '<div/>'}},
            ]})
            return mount(RecipeCard, {
                props: {recipe: originalRecipe, showMenu: true},
                global: {
                    plugins: [pinia, i18n, router],
                    stubs: {
                        RecipeContextMenu: ContextMenuStub,
                        RecipeImage: opts.imageStub === false
                            ? {template: '<div class="stub-recipe-image"><slot name="overlay"/></div>'}
                            : RecipeImageStub,
                        PrivateRecipeBadge: {template: '<div/>'},
                        KeywordsBar: {template: '<div/>'},
                    },
                },
            })
        }

        it('rebinds RecipeImage to the new recipe when context menu emits update:recipe', async () => {
            const original = makeRecipeOverview({ id: 7, image: '/media/old.jpg' })
            const updated = { ...original, image: '/media/new.jpg' }
            const w = mountForRefreshTest(original)

            expect(w.find('.stub-recipe-image').attributes('data-image')).toBe('/media/old.jpg')
            // Programmatically emit from the stubbed context menu
            const ctx = w.findComponent({name: 'RecipeContextMenu'})
            // RecipeContextMenu is stubbed; locate by its rendered class
            const ctxStub = w.find('.stub-context-menu')
            expect(ctxStub.exists()).toBe(true)
            ;(ctxStub as any).element.__vueParentComponent.emit('update:recipe', updated)
            await w.vm.$nextTick()
            expect(w.find('.stub-recipe-image').attributes('data-image')).toBe('/media/new.jpg')
        })

        it('forwards update:recipe to its parent so list owners can keep their data fresh', async () => {
            const original = makeRecipeOverview({ id: 7, image: '/media/old.jpg' })
            const updated = { ...original, image: '/media/new.jpg' }
            const w = mountForRefreshTest(original, {imageStub: false})

            const ctxStub = w.find('.stub-context-menu')
            ;(ctxStub as any).element.__vueParentComponent.emit('update:recipe', updated)
            await w.vm.$nextTick()
            const emitted = w.emitted('update:recipe')
            expect(emitted).toBeTruthy()
            expect(emitted![0][0]).toMatchObject({id: 7, image: '/media/new.jpg'})
        })
    })

    // D08: RecipeCard doubles as the book-card display (settings-driven visuals reused),
    // but the book supplies its own navigation (an "Open" button), so it must be able to
    // switch RecipeCard's built-in whole-card link off. disableLink drops the router-link
    // around the image and the title's click-to-open — the display renders, nothing navigates.
    describe('disableLink', () => {
        it('wraps the image in a navigation link by default', () => {
            const w = mountRecipeCard()
            expect(w.find('a').exists()).toBe(true)
        })

        it('renders no navigation link when disableLink is set', () => {
            const w = mountRecipeCard({ disableLink: true })
            expect(w.find('a').exists()).toBe(false)
        })

        it('does not navigate on title click when disableLink is set', async () => {
            const w = mountRecipeCard({ disableLink: true })
            const push = vi.spyOn(w.vm.$router, 'push')
            await w.find('.font-weight-bold').trigger('click')
            expect(push).not.toHaveBeenCalled()
        })
    })
})
