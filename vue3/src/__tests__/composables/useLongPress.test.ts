import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
})
