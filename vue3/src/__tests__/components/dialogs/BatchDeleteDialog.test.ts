import {describe, it, expect} from 'vitest'
import {mount} from '@vue/test-utils'
import {createVuetify} from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import {createI18n} from 'vue-i18n'
import {makeFood} from '@/__tests__/factories'
import BatchDeleteDialog from '@/components/dialogs/BatchDeleteDialog.vue'

function mountDialog(items = [makeFood({name: 'Milk'}), makeFood({name: 'Eggs'})]) {
    const vuetify = createVuetify({components, directives})
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    return mount(BatchDeleteDialog, {
        props: {model: 'Food', items},
        global: {plugins: [vuetify, i18n]},
    })
}

describe('BatchDeleteDialog', () => {
    // The card subtitle read props.source, a prop that was never declared (the real prop is
    // `items`) - so it always rendered blank. Build it from the actual `items` prop instead.
    it('builds the subtitle from the items prop, comma-joining each item label', () => {
        const wrapper = mountDialog()
        const itemNames: string = (wrapper.vm as any).itemNames
        expect(itemNames).toContain('Milk')
        expect(itemNames).toContain('Eggs')
        expect(itemNames).toContain(',')
    })
})
