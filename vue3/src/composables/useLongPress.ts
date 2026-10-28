/**
 * Long press (touch, pen and mouse) as a set of pointer handlers to v-bind onto an element.
 *
 * The press fires after `delay` ms. Moving further than `tolerance` px, releasing, or the pointer
 * leaving cancels it, so scrolling and dragging still work. The click that follows a long press is
 * swallowed (the element's normal action would otherwise run too), and the native context menu of
 * a touch long press is hidden. A right click with a mouse keeps its native menu.
 */
import {onScopeDispose} from 'vue'

export function useLongPress(onLongPress: () => void, options: {delay?: number, tolerance?: number} = {}) {
    const {delay = 500, tolerance = 8} = options

    let timer: ReturnType<typeof setTimeout> | null = null
    let startX = 0
    let startY = 0
    let fired = false
    let pointerType = 'mouse'

    function cancel() {
        if (timer !== null) {
            clearTimeout(timer)
            timer = null
        }
    }

    onScopeDispose(cancel)

    const release = (_e?: Event) => cancel()

    return {
        onPointerdown(e: PointerEvent) {
            fired = false
            pointerType = e.pointerType
            if (e.pointerType === 'mouse' && e.button !== 0) return
            startX = e.clientX
            startY = e.clientY
            cancel()
            timer = setTimeout(() => {
                timer = null
                fired = true
                onLongPress()
            }, delay)
        },
        onPointermove(e: PointerEvent) {
            if (timer !== null && Math.hypot(e.clientX - startX, e.clientY - startY) > tolerance) cancel()
        },
        onPointerup: release,
        onPointercancel: release,
        onPointerleave: release,
        onClickCapture(e: Event) {
            if (!fired) return
            fired = false
            e.preventDefault()
            e.stopPropagation()
        },
        onContextmenu(e: Event) {
            if (fired || pointerType !== 'mouse') e.preventDefault()
        },
    }
}
