import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope } from 'vue'
import { useLongPress } from '@/composables/useLongPress'

const down = (pointerType = 'mouse', x = 100, y = 100, button = 0) => ({ pointerType, clientX: x, clientY: y, button }) as any
const move = (x: number, y: number) => ({ clientX: x, clientY: y }) as any
const clickEvent = () => ({ preventDefault: vi.fn(), stopPropagation: vi.fn() }) as any

describe('useLongPress', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it('fires after the press has been held for the delay', () => {
        const onLongPress = vi.fn()
        const press = useLongPress(onLongPress, { delay: 500 })
        press.onPointerdown(down())
        vi.advanceTimersByTime(499)
        expect(onLongPress).not.toHaveBeenCalled()
        vi.advanceTimersByTime(1)
        expect(onLongPress).toHaveBeenCalledTimes(1)
    })

    it.each(['mouse', 'touch', 'pen'])('works for a %s pointer', (pointerType) => {
        const onLongPress = vi.fn()
        const press = useLongPress(onLongPress)
        press.onPointerdown(down(pointerType))
        vi.advanceTimersByTime(600)
        expect(onLongPress).toHaveBeenCalledTimes(1)
    })

    it('does not fire when the press is released early', () => {
        const onLongPress = vi.fn()
        const press = useLongPress(onLongPress)
        press.onPointerdown(down())
        vi.advanceTimersByTime(200)
        press.onPointerup(down())
        vi.advanceTimersByTime(1000)
        expect(onLongPress).not.toHaveBeenCalled()
    })

    it.each(['onPointercancel', 'onPointerleave'] as const)('does not fire after %s', (handler) => {
        const onLongPress = vi.fn()
        const press = useLongPress(onLongPress)
        press.onPointerdown(down())
        press[handler]({} as any)
        vi.advanceTimersByTime(1000)
        expect(onLongPress).not.toHaveBeenCalled()
    })

    it('does not fire when the pointer moves further than the tolerance, so scrolling and dragging still work', () => {
        const onLongPress = vi.fn()
        const press = useLongPress(onLongPress, { tolerance: 8 })
        press.onPointerdown(down('touch', 100, 100))
        press.onPointermove(move(100, 109))
        vi.advanceTimersByTime(1000)
        expect(onLongPress).not.toHaveBeenCalled()
    })

    it('still fires when the pointer only wobbles within the tolerance', () => {
        const onLongPress = vi.fn()
        const press = useLongPress(onLongPress, { tolerance: 8 })
        press.onPointerdown(down('touch', 100, 100))
        press.onPointermove(move(103, 104))
        vi.advanceTimersByTime(600)
        expect(onLongPress).toHaveBeenCalledTimes(1)
    })

    it('ignores the right and middle mouse buttons', () => {
        const onLongPress = vi.fn()
        const press = useLongPress(onLongPress)
        press.onPointerdown(down('mouse', 100, 100, 2))
        press.onPointerdown(down('mouse', 100, 100, 1))
        vi.advanceTimersByTime(1000)
        expect(onLongPress).not.toHaveBeenCalled()
    })

    it('fires once per press', () => {
        const onLongPress = vi.fn()
        const press = useLongPress(onLongPress)
        press.onPointerdown(down())
        vi.advanceTimersByTime(5000)
        expect(onLongPress).toHaveBeenCalledTimes(1)
    })

    it('swallows the click that follows a long press so the recipe does not also open', () => {
        const press = useLongPress(vi.fn())
        press.onPointerdown(down())
        vi.advanceTimersByTime(600)
        press.onPointerup(down())
        const click = clickEvent()
        press.onClickCapture(click)
        expect(click.preventDefault).toHaveBeenCalled()
        expect(click.stopPropagation).toHaveBeenCalled()
    })

    it('lets an ordinary click through', () => {
        const press = useLongPress(vi.fn())
        press.onPointerdown(down())
        vi.advanceTimersByTime(100)
        press.onPointerup(down())
        const click = clickEvent()
        press.onClickCapture(click)
        expect(click.preventDefault).not.toHaveBeenCalled()
        expect(click.stopPropagation).not.toHaveBeenCalled()
    })

    it('swallows only the one click after a long press', () => {
        const press = useLongPress(vi.fn())
        press.onPointerdown(down())
        vi.advanceTimersByTime(600)
        press.onClickCapture(clickEvent())
        const later = clickEvent()
        press.onClickCapture(later)
        expect(later.preventDefault).not.toHaveBeenCalled()
    })

    it('does not swallow the click of a new press when the browser sent no click after the long press', () => {
        const press = useLongPress(vi.fn())
        press.onPointerdown(down('touch'))
        vi.advanceTimersByTime(600)
        press.onPointerup(down('touch'))
        press.onPointerdown(down('touch'))
        press.onPointerup(down('touch'))
        const click = clickEvent()
        press.onClickCapture(click)
        expect(click.preventDefault).not.toHaveBeenCalled()
    })

    it('swallows a click only right after the long press, not a keyboard click long after it', () => {
        // a held mouse button opens the preview under the pointer, so its click never reaches the element
        const press = useLongPress(vi.fn())
        press.onPointerdown(down())
        vi.advanceTimersByTime(600)
        press.onPointerup(down())
        vi.advanceTimersByTime(1000)
        const click = clickEvent()
        press.onClickCapture(click)
        expect(click.preventDefault).not.toHaveBeenCalled()
    })

    it('still swallows the click that comes straight after the release', () => {
        const press = useLongPress(vi.fn())
        press.onPointerdown(down())
        vi.advanceTimersByTime(600)
        press.onPointerup(down())
        vi.advanceTimersByTime(50)
        const click = clickEvent()
        press.onClickCapture(click)
        expect(click.preventDefault).toHaveBeenCalled()
    })

    it('does not swallow the click of a key press', () => {
        const press = useLongPress(vi.fn())
        press.onPointerdown(down())
        vi.advanceTimersByTime(600)
        press.onKeydown({} as any)
        const click = clickEvent()
        press.onClickCapture(click)
        expect(click.preventDefault).not.toHaveBeenCalled()
    })

    it('ignores a second finger, so a two finger hold does not open anything', () => {
        const onLongPress = vi.fn()
        const press = useLongPress(onLongPress)
        press.onPointerdown({ ...down('touch'), isPrimary: true } as any)
        vi.advanceTimersByTime(300)
        press.onPointerdown({ ...down('touch', 140, 140), isPrimary: false } as any)
        vi.advanceTimersByTime(1000)
        expect(onLongPress).not.toHaveBeenCalled()
    })

    it('still fires for a pointer that reports isPrimary', () => {
        const onLongPress = vi.fn()
        const press = useLongPress(onLongPress)
        press.onPointerdown({ ...down('touch'), isPrimary: true } as any)
        vi.advanceTimersByTime(600)
        expect(onLongPress).toHaveBeenCalledTimes(1)
    })

    it('stops waiting when the component goes away', () => {
        const onLongPress = vi.fn()
        const scope = effectScope()
        const press = scope.run(() => useLongPress(onLongPress))!
        press.onPointerdown(down())
        vi.advanceTimersByTime(300)
        scope.stop()
        vi.advanceTimersByTime(1000)
        expect(onLongPress).not.toHaveBeenCalled()
    })

    it('hides the native context menu that a touch long press brings up', () => {
        const press = useLongPress(vi.fn())
        press.onPointerdown(down('touch'))
        vi.advanceTimersByTime(600)
        const menu = { preventDefault: vi.fn() } as any
        press.onContextmenu(menu)
        expect(menu.preventDefault).toHaveBeenCalled()
    })

    it('keeps the native context menu for an ordinary right click with a mouse', () => {
        const press = useLongPress(vi.fn())
        press.onPointerdown(down('mouse', 100, 100, 2))
        const menu = { preventDefault: vi.fn() } as any
        press.onContextmenu(menu)
        expect(menu.preventDefault).not.toHaveBeenCalled()
    })

    // the preview opens under the pointer, so the release and the context menu of a touch long press go to the dialog, not to the pressed element
    describe('context menu of the page after a long press', () => {
        const contextMenuOn = (target: EventTarget) => {
            const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
            target.dispatchEvent(event)
            return event.defaultPrevented
        }
        const releaseOn = (target: EventTarget) => target.dispatchEvent(new Event('pointerup', { bubbles: true }))
        const longPress = (press: ReturnType<typeof useLongPress>, pointerType = 'touch') => {
            press.onPointerdown(down(pointerType))
            vi.advanceTimersByTime(600)
        }

        afterEach(() => {
            // let a guard of a test end, whatever it was doing
            vi.advanceTimersByTime(60_000)
        })

        it('is blocked wherever it lands once a long press fired, also on what opened under the pointer', () => {
            const dialog = document.createElement('div')
            document.body.appendChild(dialog)
            longPress(useLongPress(vi.fn()))
            expect(contextMenuOn(dialog)).toBe(true)
            dialog.remove()
        })

        it('is blocked just after the release, which also lands elsewhere', () => {
            const dialog = document.createElement('div')
            document.body.appendChild(dialog)
            longPress(useLongPress(vi.fn()), 'mouse')
            releaseOn(dialog)
            vi.advanceTimersByTime(300)
            expect(contextMenuOn(dialog)).toBe(true)
            dialog.remove()
        })

        it('is allowed again a moment after the release', () => {
            longPress(useLongPress(vi.fn()))
            releaseOn(document.body)
            vi.advanceTimersByTime(1500)
            expect(contextMenuOn(document.body)).toBe(false)
        })

        it('stays blocked while the press is held on, however long', () => {
            longPress(useLongPress(vi.fn()))
            vi.advanceTimersByTime(5000)
            expect(contextMenuOn(document.body)).toBe(true)
        })

        it('is not blocked when no long press happened, so an ordinary right click keeps its menu', () => {
            useLongPress(vi.fn())
            expect(contextMenuOn(document.body)).toBe(false)
        })

        it('is not blocked after a press that was released early', () => {
            const press = useLongPress(vi.fn())
            press.onPointerdown(down())
            vi.advanceTimersByTime(200)
            press.onPointerup(down())
            expect(contextMenuOn(document.body)).toBe(false)
        })

        it('is allowed again at the latest after a few seconds, if the release never came', () => {
            longPress(useLongPress(vi.fn()))
            vi.advanceTimersByTime(30_000)
            expect(contextMenuOn(document.body)).toBe(false)
        })

        it('is allowed again when the component goes away', () => {
            const scope = effectScope()
            const press = scope.run(() => useLongPress(vi.fn()))!
            longPress(press)
            scope.stop()
            expect(contextMenuOn(document.body)).toBe(false)
        })

        it('does not pile up when there are several long presses', () => {
            const press = useLongPress(vi.fn())
            longPress(press)
            releaseOn(document.body)
            longPress(press)
            releaseOn(document.body)
            vi.advanceTimersByTime(1500)
            expect(contextMenuOn(document.body)).toBe(false)
        })
    })
})
