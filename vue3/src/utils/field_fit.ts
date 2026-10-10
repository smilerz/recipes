/** Room taken by a picker's clear (x) and caret icons; measured on the dense fields (compact density). */
export const FIELD_ICONS_WIDTH = 52

/** The same for the inline variant, whose icons are smaller (caret 18px + clear 14px plus spacing). */
export const INLINE_FIELD_ICONS_WIDTH = 40

/**
 * Whether the selected text still fits in a picker once its icons are shown.
 * `inputWidth` is the text area as it is right now, so when the icons are currently hidden it is already
 * `iconsWidth` (FIELD_ICONS_WIDTH unless the variant says otherwise) wider than it will be with them, and that is taken off again.
 */
export function textFitsBesideIcons(m: { textWidth: number, inputWidth: number, horizontalPadding: number, iconsShown: boolean, iconsWidth?: number }): boolean {
    if (m.inputWidth <= 0) return true // not laid out yet
    const room = m.inputWidth - m.horizontalPadding - (m.iconsShown ? 0 : (m.iconsWidth ?? FIELD_ICONS_WIDTH))
    return m.textWidth <= room
}
