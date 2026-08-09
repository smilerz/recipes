/**
 * #42 restoration: shopping_showFoodImages was a dead deviceSettings key (no UI toggle,
 * nothing ever rendered it) - the whole feature (Food.food_image FK, serializer exposure,
 * this thumbnail rendering) was dropped during a chain rebaseline. Restored end-to-end.
 */
import {describe, it, expect, vi, beforeEach} from 'vitest'
import {mount} from '@vue/test-utils'
import {createPinia, setActivePinia, type PiniaPlugin} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createVuetify} from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'
import {ref} from 'vue'

vi.mock('@vueuse/core', async (imp) => ({...(await imp<any>()), useStorage: (_k: string, d: any) => ref(d)}))
vi.mock('@vueuse/router', () => ({useRouteQuery: (_k: string, d: any) => ref(d)}))
vi.mock('vue-router', () => ({useRouter: () => ({push: vi.fn().mockResolvedValue(undefined)})}))
vi.mock('@/openapi', async (imp) => ({...(await imp<any>()), ApiApi: class {}}))
vi.mock('vue-i18n', async (importOriginal) => ({
    ...(await importOriginal<typeof import('vue-i18n')>()),
    useI18n: () => ({t: (key: string) => key}),
}))

import ShoppingLineItem from '@/components/display/ShoppingLineItem.vue'
import {useUserPreferenceStore} from '@/stores/UserPreferenceStore'
import {makeUserPreference} from '@/__tests__/factories'

function mountItem(showFoodImages: boolean, foodImage: any) {
    const prePopulate: PiniaPlugin = ({store}) => {
        if (store.$id === 'user_preference_store') {
            store.userSettings = makeUserPreference() as any
            store.activeSpace = {id: 1} as any
            store.deviceSettings.shopping_showFoodImages = showFoodImages
        }
    }
    const pinia = createPinia()
    pinia.use(prePopulate)
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const vuetify = createVuetify({components: vuetifyComponents, directives: vuetifyDirectives})

    const shoppingListFood = {
        food: {id: 1, name: 'Milk', foodImage},
        entries: new Map([[1, {id: 1, amount: 1, checked: false, food: {id: 1, name: 'Milk'}}]]),
    }

    return mount(ShoppingLineItem, {
        props: {shoppingListFood} as any,
        global: {
            plugins: [pinia, i18n, vuetify],
            stubs: {
                ShoppingLineItemDialog: {template: '<div/>'},
                PantryJarIndicator: {template: '<div/>'},
                ShoppingListsBar: {template: '<div/>'},
            },
        },
    })
}

describe('ShoppingLineItem food image (#42)', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
    })

    it('renders the food thumbnail when the setting is on and food has an image', () => {
        const w = mountItem(true, {preview: 'http://example.com/img.jpg', cropData: null})
        expect(w.find('.shopping-food-image').exists()).toBe(true)
        w.unmount()
    })

    it('does not render a thumbnail when the setting is off', () => {
        const w = mountItem(false, {preview: 'http://example.com/img.jpg', cropData: null})
        expect(w.find('.shopping-food-image').exists()).toBe(false)
        w.unmount()
    })

    it('renders an empty placeholder slot (alignment) when the setting is on but the food has no image', () => {
        const w = mountItem(true, null)
        expect(w.find('.shopping-food-image-empty').exists()).toBe(true)
        w.unmount()
    })
})
