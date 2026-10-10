import {describe, expect, it} from 'vitest'
import {FIELD_ICONS_WIDTH, INLINE_FIELD_ICONS_WIDTH, textFitsBesideIcons} from '@/utils/field_fit'

describe('textFitsBesideIcons', () => {
    const base = {textWidth: 35, inputWidth: 108, horizontalPadding: 0, iconsShown: true}

    it('fits when the text is narrower than the room the icons leave', () => {
        expect(textFitsBesideIcons(base)).toBe(true)
    })

    it('does not fit when the text is wider than that room', () => {
        expect(textFitsBesideIcons({...base, textWidth: 120})).toBe(false)
    })

    it('takes the input padding off the room', () => {
        expect(textFitsBesideIcons({...base, textWidth: 100, horizontalPadding: 16})).toBe(false)
        expect(textFitsBesideIcons({...base, textWidth: 90, horizontalPadding: 16})).toBe(true)
    })

    it('counts the icons back in when they are currently hidden, so the answer does not flip-flop', () => {
        // hidden icons leave the input FIELD_ICONS_WIDTH wider than it will be once they are shown
        const hidden = {...base, iconsShown: false, inputWidth: 108 + FIELD_ICONS_WIDTH}
        expect(textFitsBesideIcons({...hidden, textWidth: 100})).toBe(true)
        expect(textFitsBesideIcons({...hidden, textWidth: 120})).toBe(false)
    })

    it('says it fits when nothing has been laid out yet (width 0)', () => {
        expect(textFitsBesideIcons({...base, inputWidth: 0, textWidth: 0})).toBe(true)
    })

    it('uses the narrower icons of the inline variant when told to', () => {
        // the Stock-up dialog: "tablespoon" is 80px wide in a 122px text area whose icons (18 + 14px) take about 40px
        const inline = {textWidth: 80, inputWidth: 122, horizontalPadding: 0, iconsShown: false}
        expect(textFitsBesideIcons(inline)).toBe(false) // with the standard 52px reserve it looks too tight
        expect(textFitsBesideIcons({...inline, iconsWidth: INLINE_FIELD_ICONS_WIDTH})).toBe(true)
    })
})
