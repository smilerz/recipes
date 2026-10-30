/**
 * A sample recipe card for the settings that decide what a card shows. It is one random recipe, dressed up so
 * that every optional element of a card (new badge, make now chip and ring, rating, last cooked, cook time) shows on it,
 * whatever the real recipe is, and given as many keywords as the card is set to show.
 */
import {computed, ref} from "vue";
import {ApiApi, type RecipeOverview} from "@/openapi";

/** keywords of the sample when the card is set to show all of them, which is no number to match */
const KEYWORDS_FOR_ALL = 4

/**
 * @param options.maxKeywords how many keywords a card shows (0 = all), asked every time, so the sample follows the setting
 * @param options.sampleKeyword name of the keywords that are made up, numbered after the ones the recipe has
 */
export function useRecipeCardPreview(options: {maxKeywords: () => number, sampleKeyword?: string}) {
    const fetched = ref<RecipeOverview | null>(null)
    let requested = false

    /**
     * the recipe with the keywords it is short of made up, so that the number selected shows on the card; a recipe
     * with more keywords keeps them all, the card shows the rest as +n
     */
    const previewRecipe = computed<RecipeOverview | null>(() => {
        if (!fetched.value) return null
        const max = options.maxKeywords()
        const wanted = max > 0 ? max : KEYWORDS_FOR_ALL
        const keywords = [...(fetched.value.keywords ?? [])]
        for (let n = keywords.length + 1; n <= wanted; n++) {
            keywords.push({id: -n, label: `${options.sampleKeyword ?? 'Keyword'} ${n}`})
        }
        return {...fetched.value, keywords}
    })

    /**
     * fetch the sample recipe, once; call it when the preview is about to be seen, not when the page loads
     */
    function loadPreview() {
        if (requested) return
        requested = true
        // makenowBadge false: the answer is made up below, so the server does not need to work it out
        new ApiApi().apiRecipeList({pageSize: 1, random: true, makenowBadge: false}).then(r => {
            if (r.results?.length) {
                const recipe = {...r.results[0]}
                recipe._new = true
                ;(recipe as any).makenow = true
                if (!recipe.lastCooked) {
                    recipe.lastCooked = new Date(Date.now() - 3 * 86400000)
                }
                if (!recipe.rating) {
                    recipe.rating = 4.5
                }
                // the cook time pill needs a working time; both parts are made up so the total is a number
                if (!recipe.workingTime) {
                    recipe.workingTime = 30
                    recipe.waitingTime = 15
                }
                fetched.value = recipe as RecipeOverview
            }
        }).catch(() => {})
    }

    return {previewRecipe, loadPreview}
}
