/** Room taken by a picker's clear (x) and caret icons; measured on the dense fields (compact density). */
export const FIELD_ICONS_WIDTH = 52

/**
 * Whether the selected text still fits in a picker once its icons are shown.
 * `inputWidth` is the text area as it is right now, so when the icons are currently hidden it is already
 * FIELD_ICONS_WIDTH wider than it will be with them, and that is taken off again.
 */
export function textFitsBesideIcons(m: { textWidth: number, inputWidth: number, horizontalPadding: number, iconsShown: boolean }): boolean {
    if (m.inputWidth <= 0) return true // not laid out yet
    const room = m.inputWidth - m.horizontalPadding - (m.iconsShown ? 0 : FIELD_ICONS_WIDTH)
    return m.textWidth <= room
}
