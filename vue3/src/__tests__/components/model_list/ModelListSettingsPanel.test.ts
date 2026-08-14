import {describe, it, expect, beforeEach, vi} from 'vitest'
import {mount} from '@vue/test-utils'
import {createVuetify} from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import {createI18n} from 'vue-i18n'
import {createPinia, setActivePinia} from 'pinia'
import {ref} from 'vue'

vi.mock('vue-router', () => ({
    useRoute: () => ({query: {}}),
    useRouter: () => ({push: vi.fn(), replace: vi.fn()}),
}))
vi.mock('@vueuse/router', () => ({useRouteQuery: (_k: string, d: any) => ref(d)}))

import ModelListSettingsPanel from '@/components/model_list/ModelListSettingsPanel.vue'
import {MODEL_LIST_SETTINGS_KEY} from '@/composables/modellist/useModelListSettings'
import type {Model} from '@/types/Models'
import type {ActionDef} from '@/composables/modellist/types'

const MODEL: Model = {
    name: 'Food', localizationKey: 'Food', localizationKeyDescription: 'Food',
    icon: 'fa-solid fa-apple', toStringKeys: ['name'], itemValue: 'id', itemLabel: 'name',
    isAdvancedDelete: false, isPaginated: true, tableHeaders: [],
} as unknown as Model

const ACTION_DEFS: ActionDef[] = [
    {key: 'edit', labelKey: 'Edit', icon: 'fa-solid fa-pen'} as ActionDef,
    {key: 'delete', labelKey: 'Delete', icon: 'fa-solid fa-trash'} as ActionDef,
]

function mountPanel() {
    const vuetify = createVuetify({components, directives})
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    const pinia = createPinia()

    return mount(ModelListSettingsPanel, {
        props: {modelValue: true, model: MODEL, actionDefs: ACTION_DEFS},
        global: {
            plugins: [pinia, vuetify, i18n],
            provide: {
                [MODEL_LIST_SETTINGS_KEY as unknown as string]: {
                    isPinned: ref(false), showStats: ref(false), showColumnHeaders: ref(true),
                    treeEnabled: ref(false), quickActionKeys: ref([]), desktopSubtitleKeys: ref([]),
                    mobileSubtitleKeys: ref([]), swipeEnabled: ref(true), swipeLeftKeys: ref([]),
                    swipeRightKeys: ref([]), showMobileHeaders: ref(false), swipeHintDismissed: ref(false),
                    includeChildren: ref(true),
                },
            },
        },
        attachTo: document.body,
    })
}

describe('ModelListSettingsPanel — swipe action picker dialog', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
    })

    // v-dialog teleports to document.body — the swipe-picker dialog isn't inside the wrapper's
    // own root, so query document.body directly and scope to the overlay containing the title
    // (there's also the settings panel's own outer dialog in the DOM).
    function findSwipePickerCloseButton(): HTMLElement | undefined {
        const overlays = Array.from(document.body.querySelectorAll('.v-overlay'))
        const swipeOverlay = overlays.find(o => o.textContent?.includes('SelectAction'))
        return swipeOverlay?.querySelector('.mdi-close')?.closest('button') as HTMLElement | undefined
    }

    it('uses VClosableCardTitle (with a close button), not a raw v-card-title', async () => {
        const w = mountPanel()
        ;(w.vm as any).openSwipePicker('left')
        await w.vm.$nextTick()
        await new Promise(r => setTimeout(r, 0))

        // VClosableCardTitle renders a close (mdi-close) icon button; a raw v-card-title never did.
        // (VClosableCardTitle's own click-closes behavior is covered by its own component test —
        // interacting with a teleported v-dialog's content is documented as unreliable under jsdom
        // in this codebase, so this test only asserts the structural fix: which title component
        // is actually in use.)
        expect(findSwipePickerCloseButton()).toBeTruthy()
        w.unmount()
    })
})
