import {describe, it, expect, vi} from 'vitest'
import {fdcFoodUrl, openFdcPage} from '@/utils/fdc'

describe('fdc utils', () => {
    it('builds the FoodData Central nutrient page URL for a food', () => {
        expect(fdcFoodUrl(170567)).toBe('https://fdc.nal.usda.gov/food-details/170567/nutrients')
    })

    it('openFdcPage opens that URL in a new tab', () => {
        const open = vi.spyOn(window, 'open').mockImplementation(() => null)
        openFdcPage(170567)
        expect(open).toHaveBeenCalledWith('https://fdc.nal.usda.gov/food-details/170567/nutrients', '_blank')
        open.mockRestore()
    })
})
