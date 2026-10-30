import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { apiMock, resetApiMock } from '@/__tests__/api-mock'
import { makeRecipeOverview } from '@/__tests__/factories'

vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    ApiApi: class { constructor() { return apiMock } },
}))

import { useRecipeCardPreview } from '@/composables/useRecipeCardPreview'

const answer = (...recipes: any[]) => apiMock.apiRecipeList = vi.fn().mockResolvedValue({ results: recipes, count: recipes.length })

describe('useRecipeCardPreview', () => {
    beforeEach(() => resetApiMock())

    it('has no recipe before it is loaded, and does not ask for one by itself', () => {
        answer(makeRecipeOverview())
        const { previewRecipe } = useRecipeCardPreview({ maxKeywords: () => 3 })
        expect(previewRecipe.value).toBeNull()
        expect(apiMock.apiRecipeList).not.toHaveBeenCalled()
    })

    it('asks for one random recipe, without the make now answer it would only throw away', async () => {
        answer(makeRecipeOverview())
        const { loadPreview } = useRecipeCardPreview({ maxKeywords: () => 3 })
        loadPreview()
        await flushPromises()
        expect(apiMock.apiRecipeList).toHaveBeenCalledWith({ pageSize: 1, random: true, makenowBadge: false })
    })

    it('asks only once, however often it is loaded', async () => {
        answer(makeRecipeOverview())
        const { loadPreview } = useRecipeCardPreview({ maxKeywords: () => 3 })
        loadPreview()
        loadPreview()
        await flushPromises()
        loadPreview()
        expect(apiMock.apiRecipeList).toHaveBeenCalledTimes(1)
    })

    it('dresses the recipe up so that every optional element of a card shows on it', async () => {
        answer(makeRecipeOverview({ _new: false, makenow: null, rating: null, lastCooked: null } as any))
        const { previewRecipe, loadPreview } = useRecipeCardPreview({ maxKeywords: () => 3 })
        loadPreview()
        await flushPromises()
        const recipe = previewRecipe.value as any
        expect(recipe._new).toBe(true)
        expect(recipe.makenow).toBe(true)
        expect(recipe.rating).toBe(4.5)
        expect(recipe.lastCooked).toBeInstanceOf(Date)
    })

    it('keeps the rating and the last cooked date the recipe really has', async () => {
        const cooked = new Date('2026-03-01T12:00:00Z')
        answer(makeRecipeOverview({ rating: 2, lastCooked: cooked } as any))
        const { previewRecipe, loadPreview } = useRecipeCardPreview({ maxKeywords: () => 3 })
        loadPreview()
        await flushPromises()
        expect((previewRecipe.value as any).rating).toBe(2)
        expect((previewRecipe.value as any).lastCooked).toBe(cooked)
    })

    it('gives the recipe a cook time when it has none, so the cook time pill shows', async () => {
        answer(makeRecipeOverview({ workingTime: 0, waitingTime: 0 } as any))
        const { previewRecipe, loadPreview } = useRecipeCardPreview({ maxKeywords: () => 3 })
        loadPreview()
        await flushPromises()
        const recipe = previewRecipe.value as any
        expect(recipe.workingTime).toBeGreaterThan(0)
        expect(Number.isFinite(recipe.workingTime + recipe.waitingTime)).toBe(true)
    })

    it('gives a recipe without any times a cook time too, not NaN', async () => {
        answer(makeRecipeOverview({ workingTime: undefined, waitingTime: undefined } as any))
        const { previewRecipe, loadPreview } = useRecipeCardPreview({ maxKeywords: () => 3 })
        loadPreview()
        await flushPromises()
        const recipe = previewRecipe.value as any
        expect(recipe.workingTime).toBeGreaterThan(0)
        expect(Number.isFinite(recipe.workingTime + recipe.waitingTime)).toBe(true)
    })

    it('keeps the working and waiting time the recipe really has', async () => {
        answer(makeRecipeOverview({ workingTime: 20, waitingTime: 10 } as any))
        const { previewRecipe, loadPreview } = useRecipeCardPreview({ maxKeywords: () => 3 })
        loadPreview()
        await flushPromises()
        expect((previewRecipe.value as any).workingTime).toBe(20)
        expect((previewRecipe.value as any).waitingTime).toBe(10)
    })

    it('does not change the recipe it was given', async () => {
        const original = makeRecipeOverview({ _new: false, makenow: false, rating: null } as any)
        answer(original)
        const { loadPreview } = useRecipeCardPreview({ maxKeywords: () => 3 })
        loadPreview()
        await flushPromises()
        expect((original as any)._new).toBe(false)
        expect((original as any).makenow).toBe(false)
        expect(original.rating).toBeNull()
    })

    it('stays empty when there is no recipe, or the request fails', async () => {
        answer()
        const none = useRecipeCardPreview({ maxKeywords: () => 3 })
        none.loadPreview()
        await flushPromises()
        expect(none.previewRecipe.value).toBeNull()

        apiMock.apiRecipeList = vi.fn().mockRejectedValue(new Error('offline'))
        const failing = useRecipeCardPreview({ maxKeywords: () => 3 })
        failing.loadPreview()
        await flushPromises()
        expect(failing.previewRecipe.value).toBeNull()
    })

    describe('keywords, so that the number selected for a card shows', () => {
        const kw = (...labels: string[]) => labels.map((label, i) => ({ id: i + 1, label }))
        const preview = async (keywords: any[], max: number | (() => number), sample?: string) => {
            answer(makeRecipeOverview({ keywords } as any))
            const result = useRecipeCardPreview({ maxKeywords: typeof max === 'function' ? max : () => max, sampleKeyword: sample })
            result.loadPreview()
            await flushPromises()
            return result
        }
        const labels = (recipe: any) => recipe.keywords.map((k: any) => k.label)

        it('makes up the keywords the recipe is short of, after its own', async () => {
            const { previewRecipe } = await preview(kw('soup'), 4)
            expect(labels(previewRecipe.value)).toEqual(['soup', 'Keyword 2', 'Keyword 3', 'Keyword 4'])
        })

        it('makes up all of them for a recipe without keywords', async () => {
            expect(labels((await preview([], 3)).previewRecipe.value)).toEqual(['Keyword 1', 'Keyword 2', 'Keyword 3'])
        })

        it('gives the made up ones ids of their own, which no real keyword can have', async () => {
            const ids = (await preview(kw('soup'), 4)).previewRecipe.value!.keywords.map((k: any) => k.id)
            expect(ids).toEqual([1, -2, -3, -4])
            expect(new Set(ids).size).toBe(ids.length)
        })

        it('keeps every keyword of a recipe that has more than the number selected, the card shows the rest as +n', async () => {
            const { previewRecipe } = await preview(kw('a', 'b', 'c', 'd', 'e', 'f', 'g'), 3)
            expect(labels(previewRecipe.value)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
        })

        it('has a few keywords to show for "All", which has no number', async () => {
            expect(labels((await preview(kw('soup'), 0)).previewRecipe.value)).toEqual(['soup', 'Keyword 2', 'Keyword 3', 'Keyword 4'])
            expect((await preview(kw('a', 'b', 'c', 'd', 'e', 'f'), 0)).previewRecipe.value!.keywords).toHaveLength(6)
        })

        it('follows the number selected, without asking for the recipe again', async () => {
            const max = ref(3)
            const { previewRecipe } = await preview(kw('soup'), () => max.value)
            expect(previewRecipe.value!.keywords).toHaveLength(3)
            max.value = 10
            expect(previewRecipe.value!.keywords).toHaveLength(10)
            max.value = 5
            expect(previewRecipe.value!.keywords).toHaveLength(5)
            expect(apiMock.apiRecipeList).toHaveBeenCalledTimes(1)
        })

        it('calls the made up ones what it is told to, in the language of the page', async () => {
            expect(labels((await preview([], 2, 'Stichwort')).previewRecipe.value)).toEqual(['Stichwort 1', 'Stichwort 2'])
        })

        it('does not change the keywords of the recipe it was given', async () => {
            const original = kw('soup')
            await preview(original, 4)
            expect(original).toEqual([{ id: 1, label: 'soup' }])
        })
    })
})
