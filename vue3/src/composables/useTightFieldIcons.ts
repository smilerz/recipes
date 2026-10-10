import {nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref} from 'vue'
import {textFitsBesideIcons} from '@/utils/field_fit'

/**
 * True while the text a picker shows is too long to sit beside its clear and caret icons, so the field can hide the
 * icons until it is hovered or focused. Both the field width and the text length count: it is measured, and measured
 * again whenever the field is resized or `source` (the value) changes.
 */
export function useTightFieldIcons(root: { value: HTMLElement | null | undefined }, source: () => unknown): Ref<boolean> {
    const tight = ref(false)
    let observer: ResizeObserver | undefined

    function measure() {
        const el = root.value
        const input = el?.querySelector<HTMLElement>('.v-field__input')
        const text = el?.querySelector<HTMLElement>('.v-autocomplete__selection-text')
        if (!el || !input || !text) {
            tight.value = false
            return
        }
        const style = getComputedStyle(input)
        tight.value = !textFitsBesideIcons({
            textWidth: text.scrollWidth,
            inputWidth: input.clientWidth,
            horizontalPadding: (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0),
            iconsShown: (el.querySelector<HTMLElement>('.v-field__append-inner')?.offsetWidth ?? 0) > 0,
        })
    }

    onMounted(() => {
        if (typeof ResizeObserver !== 'undefined' && root.value) {
            observer = new ResizeObserver(measure)
            observer.observe(root.value)
        }
        nextTick(measure)
    })
    watch(source, () => nextTick(measure))
    onBeforeUnmount(() => observer?.disconnect())

    return tight
}
