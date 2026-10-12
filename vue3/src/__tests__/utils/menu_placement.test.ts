import {describe, expect, it} from 'vitest'
import {MENU_COMFORT_HEIGHT, MENU_EDGE_GAP, MENU_MAX_HEIGHT, MENU_MIN_HEIGHT, menuPlacement} from '@/utils/menu_placement'

describe('menuPlacement', () => {
    it('opens below at full height when there is room below', () => {
        expect(menuPlacement({fieldTop: 100, fieldBottom: 156, viewportHeight: 900})).toEqual({location: 'bottom', maxHeight: MENU_MAX_HEIGHT})
    })

    it('opens above at full height when only the room above is enough', () => {
        expect(menuPlacement({fieldTop: 600, fieldBottom: 656, viewportHeight: 760})).toEqual({location: 'top', maxHeight: MENU_MAX_HEIGHT})
    })

    it('when neither side fits the full height, uses the side with more room and shrinks to it (the 616px-high window)', () => {
        // field 273-329 in a 616px window: 275px below (after the edge gap), 261px above
        expect(menuPlacement({fieldTop: 273, fieldBottom: 329, viewportHeight: 616})).toEqual({location: 'bottom', maxHeight: 616 - 329 - MENU_EDGE_GAP})
    })

    it('prefers the upper side when it has more room', () => {
        expect(menuPlacement({fieldTop: 280, fieldBottom: 336, viewportHeight: 520})).toEqual({location: 'top', maxHeight: 280 - MENU_EDGE_GAP})
    })

    // A short list (a few options) was sent above the field because the other side had a few pixels more room, covering the title of
    // the dialog the picker sat in, although it fit comfortably below.
    it('when neither side fits the full height, still opens below if that is comfortable, even when above has a little more room', () => {
        // field 287-343 in a 616px window (the Batch Edit dialog's Group picker): 261px below, 275px above
        expect(menuPlacement({fieldTop: 287, fieldBottom: 343, viewportHeight: 616})).toEqual({location: 'bottom', maxHeight: 616 - 343 - MENU_EDGE_GAP})
    })

    it('opens below from exactly the comfortable height, and above one pixel short of it when above has more room', () => {
        const viewportHeight = 700
        const fieldTop = 300 // 288px above: not the full height either
        expect(menuPlacement({fieldTop, fieldBottom: viewportHeight - MENU_EDGE_GAP - MENU_COMFORT_HEIGHT, viewportHeight}).location).toBe('bottom')
        expect(menuPlacement({fieldTop, fieldBottom: viewportHeight - MENU_EDGE_GAP - MENU_COMFORT_HEIGHT + 1, viewportHeight}).location).toBe('top')
    })

    it('never shrinks the menu below a usable height', () => {
        expect(menuPlacement({fieldTop: 60, fieldBottom: 116, viewportHeight: 160}).maxHeight).toBe(MENU_MIN_HEIGHT)
    })
})
