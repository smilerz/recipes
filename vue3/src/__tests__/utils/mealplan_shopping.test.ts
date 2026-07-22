import { describe, it, expect } from 'vitest'
import { resolveMealplanShoppingAction } from '@/utils/mealplan_shopping'

// D11 P2a: a new meal plan's "add to shopping" intent resolves to either the editable preview
// (default) or the browser-remembered fast-path silent backend auto-add.
describe('resolveMealplanShoppingAction', () => {
    it('does nothing when the user does not want shopping', () => {
        expect(resolveMealplanShoppingAction(false, false)).toEqual({ addshopping: false, openPreview: false })
        expect(resolveMealplanShoppingAction(false, true)).toEqual({ addshopping: false, openPreview: false })
    })

    it('opens the editable preview by default (fast-path off)', () => {
        expect(resolveMealplanShoppingAction(true, false)).toEqual({ addshopping: false, openPreview: true })
    })

    it('silently auto-adds via the backend when the fast-path is on', () => {
        expect(resolveMealplanShoppingAction(true, true)).toEqual({ addshopping: true, openPreview: false })
    })
})
