import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {defineComponent, h, nextTick, ref} from 'vue'
import {mount} from '@vue/test-utils'
import {useTightFieldIcons} from '@/composables/useTightFieldIcons'
import {FIELD_ICONS_WIDTH} from '@/utils/field_fit'

/** A stand-in for a Vuetify picker: jsdom lays nothing out, so the measurements are set by hand. */
function fakeField(m: {input: number, text: number | null, iconsShown?: boolean}) {
    const root = document.createElement('div')
    const input = document.createElement('div')
    input.className = 'v-field__input'
    root.appendChild(input)
    const icons = document.createElement('div')
    icons.className = 'v-field__append-inner'
    root.appendChild(icons)
    const text = document.createElement('span')
    text.className = 'v-autocomplete__selection-text'
    if (m.text !== null) input.appendChild(text)
    const set = (el: HTMLElement, prop: string, value: number) => Object.defineProperty(el, prop, {configurable: true, get: () => value})
    const api = {
        root,
        setInput: (w: number) => set(input, 'clientWidth', w),
        setText: (w: number) => set(text, 'scrollWidth', w),
        setIconsShown: (shown: boolean) => set(icons, 'offsetWidth', shown ? FIELD_ICONS_WIDTH : 0),
    }
    api.setInput(m.input)
    api.setText(m.text ?? 0)
    api.setIconsShown(m.iconsShown ?? true)
    return api
}

let resizeCallback: (() => void) | undefined
const disconnect = vi.fn()

beforeEach(() => {
    resizeCallback = undefined
    disconnect.mockReset()
    vi.stubGlobal('ResizeObserver', class {
        constructor(cb: () => void) { resizeCallback = cb }
        observe() {}
        disconnect = disconnect
    })
})

afterEach(() => vi.unstubAllGlobals())

function mountWith(field: ReturnType<typeof fakeField>, label = ref('fl oz')) {
    let tight: any
    const wrapper = mount(defineComponent({
        setup() {
            tight = useTightFieldIcons(ref(field.root), () => label.value)
            return () => h('span')
        },
    }))
    return {wrapper, tight: () => tight.value as boolean, label}
}

describe('useTightFieldIcons', () => {
    it('is not tight when the selected text fits beside the icons', async () => {
        const {tight} = mountWith(fakeField({input: 108, text: 35}))
        await nextTick()
        expect(tight()).toBe(false)
    })

    it('is tight when the selected text would be cut off by the icons', async () => {
        const {tight} = mountWith(fakeField({input: 108, text: 120}))
        await nextTick()
        expect(tight()).toBe(true)
    })

    it('counts hidden icons back in: text that fits once they are shown does not stay tight', async () => {
        const field = fakeField({input: 108 + FIELD_ICONS_WIDTH, text: 100, iconsShown: false})
        const {tight} = mountWith(field)
        await nextTick()
        expect(tight()).toBe(false)
    })

    it('measures again when the field is resized', async () => {
        const field = fakeField({input: 200, text: 120})
        const {tight} = mountWith(field)
        await nextTick()
        expect(tight()).toBe(false)
        field.setInput(108)
        resizeCallback?.()
        expect(tight()).toBe(true)
    })

    it('measures again when the value changes', async () => {
        const field = fakeField({input: 108, text: 35})
        const {tight, label} = mountWith(field)
        await nextTick()
        expect(tight()).toBe(false)
        field.setText(140)
        label.value = 'a much longer unit name'
        await nextTick()
        await nextTick()
        expect(tight()).toBe(true)
    })

    it('is not tight when nothing is laid out yet', async () => {
        const {tight} = mountWith(fakeField({input: 0, text: 0}))
        await nextTick()
        expect(tight()).toBe(false)
    })

    it('is not tight when nothing is selected', async () => {
        const {tight} = mountWith(fakeField({input: 108, text: null}))
        await nextTick()
        expect(tight()).toBe(false)
    })

    it('stops observing when the component goes away', async () => {
        const {wrapper} = mountWith(fakeField({input: 108, text: 35}))
        await nextTick()
        wrapper.unmount()
        expect(disconnect).toHaveBeenCalled()
    })
})
