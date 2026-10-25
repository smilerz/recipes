import {describe, it, expect, vi, afterEach} from 'vitest'
import {mount} from '@vue/test-utils'
import {nextTick} from 'vue'
import {createVuetify} from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import {createI18n} from 'vue-i18n'
import {makeFood} from '@/__tests__/factories'
import ModelMergeDialog from '@/components/dialogs/ModelMergeDialog.vue'
import {ApiApi} from '@/openapi'

afterEach(() => vi.restoreAllMocks())

function mountDialog() {
    const vuetify = createVuetify({components, directives})
    const i18n = createI18n({legacy: false, locale: 'en', messages: {en: {}}, missingWarn: false, fallbackWarn: false})
    return mount(ModelMergeDialog, {
        props: {model: 'Food', source: [makeFood({name: 'Milk'})], modelValue: false},
        global: {plugins: [vuetify, i18n], stubs: {ModelSelect: true}},
    })
}

async function setOpen(wrapper: ReturnType<typeof mountDialog>, open: boolean) {
    await wrapper.setProps({modelValue: open})
    await nextTick()
}

describe('ModelMergeDialog', () => {
    // The list page mounts this dialog once and reuses it, so state from the previous merge
    // (picked target, per-item result icons, automate) used to survive into the next open.
    it('clears the previous target and results when reopened', async () => {
        const wrapper = mountDialog()
        const vm = wrapper.vm as any

        await setOpen(wrapper, true)
        vm.target = makeFood({name: 'Cream'})
        vm.updatedItems = [makeFood({name: 'Milk'})]
        vm.failedItems = [makeFood({name: 'Butter'})]
        vm.automate = true

        await setOpen(wrapper, false)
        await setOpen(wrapper, true)

        expect(vm.target).toBeNull()
        expect(vm.updatedItems).toEqual([])
        expect(vm.failedItems).toEqual([])
        expect(vm.automate).toBe(false)
    })

    // The merge .catch pushed the item into updatedItems, so a failed merge showed the green
    // success check and the red failure icon could never appear.
    it('marks an item as failed, not updated, when its merge request rejects', async () => {
        vi.spyOn(ApiApi.prototype, 'apiFoodMergeUpdate').mockRejectedValue(new Error('boom'))
        const wrapper = mountDialog()
        const vm = wrapper.vm as any

        await setOpen(wrapper, true)
        vm.target = makeFood({name: 'Cream'})
        vm.mergeModel()
        await vi.waitFor(() => expect(vm.loading).toBe(false))

        expect(vm.failedItems.map((i: any) => i.name)).toEqual(['Milk'])
        expect(vm.updatedItems).toEqual([])
    })

    it('marks an item as updated when its merge request succeeds', async () => {
        vi.spyOn(ApiApi.prototype, 'apiFoodMergeUpdate').mockResolvedValue({} as any)
        const wrapper = mountDialog()
        const vm = wrapper.vm as any

        await setOpen(wrapper, true)
        vm.target = makeFood({name: 'Cream'})
        vm.mergeModel()
        await vi.waitFor(() => expect(vm.loading).toBe(false))

        expect(vm.updatedItems.map((i: any) => i.name)).toEqual(['Milk'])
        expect(vm.failedItems).toEqual([])
    })
})
