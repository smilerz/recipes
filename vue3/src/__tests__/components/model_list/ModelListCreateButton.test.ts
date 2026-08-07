import {describe, it, expect, vi} from 'vitest'
import {mount} from '@vue/test-utils'
import {createVuetify} from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import {createI18n} from 'vue-i18n'

import ModelListCreateButton from '@/components/model_list/ModelListCreateButton.vue'

function mountButton() {
    const vuetify = createVuetify({components, directives})
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})

    return mount(ModelListCreateButton, {
        props: {model: 'Food' as any},
        global: {
            plugins: [vuetify, i18n],
            stubs: {
                // Real ModelEditDialog pulls in the full editor stack; stub it but keep
                // the v-model contract so the open-state assertions below are meaningful.
                ModelEditDialog: {
                    props: ['modelValue', 'persistent'],
                    emits: ['update:modelValue'],
                    template: '<div class="stub-dialog" :data-open="modelValue" :data-persistent="persistent"></div>',
                },
            },
        },
    })
}

describe('ModelListCreateButton', () => {
    // feat-list-shopping-list-tc22: relying on v-dialog's implicit activator="parent"
    // click-to-toggle meant a real double-click opened the dialog on the first click
    // and immediately closed it again on the second - net no-op, zero feedback. The
    // button must explicitly set the dialog open rather than toggle on every click.
    it('stays open when the button is clicked twice in a row (double-click)', async () => {
        const wrapper = mountButton()
        const btn = wrapper.find('button')

        await btn.trigger('click')
        await btn.trigger('click')

        const dialog = wrapper.find('.stub-dialog')
        expect(dialog.attributes('data-open')).toBe('true')
    })

    it('opens on a single click', async () => {
        const wrapper = mountButton()
        await wrapper.find('button').trigger('click')

        const dialog = wrapper.find('.stub-dialog')
        expect(dialog.attributes('data-open')).toBe('true')
    })

    // The scrim renders over the button's own position within ~30ms of a real open,
    // so a genuine double-click's second click lands on the scrim (not the button),
    // triggering v-dialog's own click-outside-to-close - a click.stop/v-model fix
    // on the button alone can't prevent that. Force persistent briefly after opening.
    it('forces the dialog persistent immediately after opening, releasing it after a short window', async () => {
        vi.useFakeTimers()
        const wrapper = mountButton()
        await wrapper.find('button').trigger('click')
        await wrapper.vm.$nextTick()

        expect(wrapper.find('.stub-dialog').attributes('data-persistent')).toBe('true')

        vi.advanceTimersByTime(600)
        await wrapper.vm.$nextTick()

        expect(wrapper.find('.stub-dialog').attributes('data-persistent')).toBe('false')
        vi.useRealTimers()
    })
})
