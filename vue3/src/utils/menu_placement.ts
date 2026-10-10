/** Vuetify's default height for a picker menu. */
export const MENU_MAX_HEIGHT = 310

/** Kept free between the menu and the edge of the window. */
export const MENU_EDGE_GAP = 12

/** A menu is never shrunk below this: smaller is not usable, so it would rather overlap. */
export const MENU_MIN_HEIGHT = 120

/**
 * Where a picker menu opens and how tall it may be. When neither side of the field has room for the full menu (a short
 * window) Vuetify slides it over the field, hiding what is being typed; this uses the side with more room instead and
 * shrinks the menu to fit.
 */
export function menuPlacement(m: { fieldTop: number, fieldBottom: number, viewportHeight: number }): { location: 'bottom' | 'top', maxHeight: number } {
    const below = m.viewportHeight - m.fieldBottom - MENU_EDGE_GAP
    const above = m.fieldTop - MENU_EDGE_GAP
    if (below >= MENU_MAX_HEIGHT) return {location: 'bottom', maxHeight: MENU_MAX_HEIGHT}
    if (above >= MENU_MAX_HEIGHT) return {location: 'top', maxHeight: MENU_MAX_HEIGHT}
    const location = below >= above ? 'bottom' : 'top'
    return {location, maxHeight: Math.max(MENU_MIN_HEIGHT, Math.min(MENU_MAX_HEIGHT, location === 'bottom' ? below : above))}
}
