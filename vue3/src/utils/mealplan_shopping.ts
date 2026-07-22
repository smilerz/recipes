export interface MealplanShoppingAction {
    /** send addshopping=true so the backend silently adds all non-pantry ingredients on create */
    addshopping: boolean
    /** open the editable AddToShoppingDialog preview after the plan is created */
    openPreview: boolean
}

/**
 * Decide how a new meal plan's "add to shopping" intent is fulfilled (D11 P2a).
 *
 * The default is the editable preview so the user chooses what actually lands on the list. The
 * browser-remembered fast-path (`skipPreview`) reverts to the one-click silent backend auto-add.
 */
export function resolveMealplanShoppingAction(wantsShopping: boolean, skipPreview: boolean): MealplanShoppingAction {
    if (!wantsShopping) return { addshopping: false, openPreview: false }
    if (skipPreview) return { addshopping: true, openPreview: false }
    return { addshopping: false, openPreview: true }
}
