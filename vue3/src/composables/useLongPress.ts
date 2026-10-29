/**
 * Long press (touch, pen and mouse) as a set of pointer handlers to v-bind onto an element.
 *
 * The press fires after `delay` ms. Moving further than `tolerance` px, releasing, a second finger, or the
 * pointer leaving cancels it, so scrolling and dragging still work. The click that follows a long press is
 * swallowed (the element's normal action would otherwise run too), and the native context menu of a touch
 * long press is hidden. A right click with a mouse keeps its native menu.
 *
 * Why not onLongPress of @vueuse/core: it attaches to one element ref and has no click swallowing or
 * context menu handling, and a recipe card needs the same press on two elements (picture and title) that
 * are bound in the template. The timer and distance part would be the only thing reused.
 */
import {onScopeDispose} from 'vue'

/** how long after a long press the click that ends it can still arrive (a held mouse button), ms */
const CLICK_AFTER_PRESS = 400
/** how long after the release the context menu of a touch long press can still arrive, ms */
const MENU_AFTER_RELEASE = 800
/** the longest the context menu of the page stays blocked, in case the release is never seen, ms */
const MENU_GUARD_MAX = 10_000

export function useLongPress(onLongPress: () => void, options: {delay?: number, tolerance?: number} = {}) {
    const {delay = 500, tolerance = 8} = options

    let timer: ReturnType<typeof setTimeout> | null = null
    let forgetTimer: ReturnType<typeof setTimeout> | null = null
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

    function clearFired() {
        fired = false
        if (forgetTimer !== null) {
            clearTimeout(forgetTimer)
            forgetTimer = null
        }
    }

    let stopMenuGuard: (() => void) | null = null

    /**
     * Block the context menu of the whole page for the rest of this press. What a long press opens (the
     * preview) appears under the pointer, so the release and the context menu that a touch long press
     * brings up land on it and not on the pressed element, where the handlers below could stop them.
     */
    function guardContextMenu() {
        stopMenuGuard?.()
        const block = (e: Event) => e.preventDefault()
        let afterRelease: ReturnType<typeof setTimeout> | null = null
        const released = () => {
            if (afterRelease === null) afterRelease = setTimeout(stop, MENU_AFTER_RELEASE)
        }
        const longest = setTimeout(stop, MENU_GUARD_MAX)
        function stop() {
            document.removeEventListener('contextmenu', block, true)
            document.removeEventListener('pointerup', released, true)
            document.removeEventListener('pointercancel', released, true)
            clearTimeout(longest)
            if (afterRelease !== null) clearTimeout(afterRelease)
            if (stopMenuGuard === stop) stopMenuGuard = null
        }
        document.addEventListener('contextmenu', block, true)
        document.addEventListener('pointerup', released, true)
        document.addEventListener('pointercancel', released, true)
        stopMenuGuard = stop
    }

    onScopeDispose(() => {
        cancel()
        clearFired()
        stopMenuGuard?.()
    })

    /**
     * the pointer is released: no long press will follow, and the click that ends a long press is
     * only expected right now, so a later (keyboard) click is not swallowed by mistake
     */
    function release(_e?: Event) {
        cancel()
        if (fired && forgetTimer === null) forgetTimer = setTimeout(clearFired, CLICK_AFTER_PRESS)
    }

    return {
        onPointerdown(e: PointerEvent) {
            clearFired()
            pointerType = e.pointerType
            // a second finger is not a press of its own, and a press with it is no longer a single press
            if (e.isPrimary === false) {
                cancel()
                return
            }
            if (e.pointerType === 'mouse' && e.button !== 0) return
            startX = e.clientX
            startY = e.clientY
            cancel()
            timer = setTimeout(() => {
                timer = null
                fired = true
                guardContextMenu()
                onLongPress()
            }, delay)
        },
        onPointermove(e: PointerEvent) {
            if (timer !== null && Math.hypot(e.clientX - startX, e.clientY - startY) > tolerance) cancel()
        },
        onPointerup: release,
        onPointercancel: release,
        onPointerleave: release,
        onKeydown(_e?: Event) {
            clearFired()
        },
        onClickCapture(e: Event) {
            if (!fired) return
            clearFired()
            e.preventDefault()
            e.stopPropagation()
        },
        onContextmenu(e: Event) {
            if (fired || pointerType !== 'mouse') e.preventDefault()
        },
    }
}
