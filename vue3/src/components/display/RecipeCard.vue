<template>
    <template v-if="!props.loading">

        <component :is="props.disableLink ? 'div' : 'router-link'"
                   :to="props.disableLink ? undefined : dest"
                   :target="props.disableLink ? undefined : linkTarget"
                   :class="{'press-target': !props.disableLink}"
                   v-bind="pressHandlers">
            <recipe-image :style="{height: props.height}" :recipe="recipe" rounded="lg" class="mr-3 ml-3" :class="{'recipe-card-makenow-ring': showMakeNow}" :disable-lightbox="true">
                <template #overlay>
                    <span v-if="deviceSettings.card_showRating && recipe.rating != null"
                          class="card-overlay-top-right recipe-card-rating">
                        <v-icon icon="fa-solid fa-star" size="x-small" color="amber" />
                        <span class="card-overlay-rating-text">{{ recipe.rating.toFixed(1) }}</span>
                    </span>
                    <span v-if="showMakeNow" role="img" :aria-label="t('MakeNow')" :title="t('MakeNow')"
                          class="card-overlay-bottom-right card-overlay-makenow recipe-card-makenow-badge">
                        <v-icon icon="fa-solid fa-utensils" size="x-small"></v-icon>
                    </span>
                    <span v-if="deviceSettings.card_showNewBadge && (recipe as any)._new"
                          class="card-overlay-bottom-left card-overlay-new recipe-card-new-badge">
                        {{ t('New') }}
                    </span>
                    <span v-if="hasMetadataOverlay"
                          class="card-overlay-bottom-right" :class="{'recipe-card-meta-shifted': showMakeNow}">
                        <span v-if="deviceSettings.card_showAuthor" class="recipe-card-author">{{ recipe.createdBy?.displayName }}</span>
                        <span v-if="deviceSettings.card_showAuthor && deviceSettings.card_showLastCooked && recipe.lastCooked"> · </span>
                        <span v-if="deviceSettings.card_showLastCooked && recipe.lastCooked" class="recipe-card-last-cooked">{{ lastCookedText }}</span>
                    </span>
                </template>
            </recipe-image>
        </component>
        <div class="ml-3">
            <div class="d-flex ">
                <div class="flex-grow-1" :class="{'cursor-pointer': !props.disableLink, 'press-target': !props.disableLink}" @click="!props.disableLink && openRecipe()" v-bind="pressHandlers">
                    <p class="font-weight-bold mt-1">{{ recipe.name }}</p>
                </div>
                <div class="mt-1">
                    <recipe-context-menu :recipe="recipe" size="small" v-if="props.showMenu" @update:recipe="onContextMenuRecipeUpdated" @preview="previewDialog = true"></recipe-context-menu>
                </div>
            </div>
            <keywords-component variant="outlined" :keywords="recipe.keywords" :max-keywords="deviceSettings.card_maxKeywords" v-if="props.showKeywords">
                <template #prepend>
                    <v-chip class="mb-1 me-1" size="x-small" label variant="outlined" v-if="recipe._private">
                        <private-recipe-badge  :show-text="false"></private-recipe-badge>
                    </v-chip>
                    <v-chip class="mb-1 me-1" size="x-small" label variant="outlined" color="info"
                            v-if="recipe.internal == false">
                        {{ $t('External') }}
                    </v-chip>
                    <v-chip class="mb-1 me-1" size="x-small" prepend-icon="far fa-clock" label variant="outlined"
                            v-if="deviceSettings.card_show_cook_time && recipe.workingTime != undefined && recipe.workingTime > 0">
                        {{ recipe.workingTime! + recipe.waitingTime! }}
                    </v-chip>
                </template>
            </keywords-component>
        </div>
        <recipe-preview-dialog v-if="previewDialog" :recipe="recipe" v-model="previewDialog"></recipe-preview-dialog>
    </template>
    <template v-else>
        <v-card :style="{'height': props.height}">
            <v-img src="../../assets/recipe_no_image.svg" cover height="60%"></v-img>
            <v-card-title>
                <v-skeleton-loader type="heading"></v-skeleton-loader>
            </v-card-title>
            <v-card-text>
                <v-skeleton-loader type="subtitle"></v-skeleton-loader>
            </v-card-text>
        </v-card>

    </template>

</template>

<script setup lang="ts">
import {computed, PropType, ref, watch} from 'vue'
import KeywordsComponent from "@/components/display/KeywordsBar.vue";
import {Recipe, RecipeOverview} from "@/openapi";

import RecipeContextMenu from "@/components/inputs/RecipeContextMenu.vue";
import RecipeImage from "@/components/display/RecipeImage.vue";
import {useRouter} from "vue-router";
import PrivateRecipeBadge from "@/components/display/PrivateRecipeBadge.vue";
import {useUserPreferenceStore} from "@/stores/UserPreferenceStore";
import {useI18n} from "vue-i18n";
import RecipePreviewDialog from "@/components/dialogs/RecipePreviewDialog.vue";
import {useLongPress} from "@/composables/useLongPress";

const props = defineProps({
    recipe: {type: {} as PropType<Recipe | RecipeOverview>, required: true,},
    loading: {type: Boolean, required: false},
    showKeywords: {type: Boolean, default: true, required: false},
    show_description: {type: Boolean, required: false},
    height: {type: String, required: false, default: '15vh'},
    linkTarget: {type: String, required: false, default: ''},
    showMenu: {type: Boolean, default: true, required: false},
    // Drop the built-in whole-card navigation (image link + title click). The book
    // card reuses RecipeCard purely as the settings-driven display and supplies its
    // own "Open" button instead (D08).
    disableLink: {type: Boolean, default: false, required: false},
    servings: {type: Number, required: false},
})

const emit = defineEmits<{
    'update:recipe': [recipe: Recipe | RecipeOverview]
}>()

// Shadow the recipe prop so the card can refresh its own display when the
// context menu (e.g. inline photo editor) reports an updated recipe — list
// owners that don't listen for update:recipe still see the new image
// without a manual page reload. Watch the prop so an external update from
// a parent that DOES listen still propagates in.
const recipe = ref(props.recipe)
watch(() => props.recipe, (r) => { recipe.value = r })

function onContextMenuRecipeUpdated(updated: Recipe | RecipeOverview) {
    recipe.value = updated
    emit('update:recipe', updated)
}

const previewDialog = ref(false)
const longPress = useLongPress(() => previewDialog.value = true)
// a card that does not link to its recipe (the one inside a book) has nothing to press and hold
const pressHandlers = computed(() => props.disableLink ? {} : longPress)

const router = useRouter()
const {t} = useI18n()
const deviceSettings = useUserPreferenceStore().deviceSettings

/** the setting is on and the household can make the recipe now: shown as an icon and a ring around the picture */
const showMakeNow = computed(() => !!deviceSettings.card_showMakeNowBadge && !!(recipe.value as RecipeOverview).makenow)

const hasMetadataOverlay = computed(() =>
    (deviceSettings.card_showAuthor && recipe.value.createdBy?.displayName) ||
    (deviceSettings.card_showLastCooked && recipe.value.lastCooked)
)

const lastCookedText = computed(() => {
    if (!recipe.value.lastCooked) return ''
    const date = new Date(recipe.value.lastCooked)
    if (isNaN(date.getTime())) return ''
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays < 0) return t('today')
    if (diffDays === 0) return t('today')
    if (diffDays === 1) return t('yesterday')
    if (diffDays < 30) return t('days_ago', {count: diffDays})
    const diffMonths = Math.floor(diffDays / 30)
    if (diffMonths < 12) return t('months_ago', {count: diffMonths})
    const diffYears = Math.floor(diffDays / 365)
    return t('years_ago', {count: diffYears})
})

const dest = computed(() => {
    const route: any = { name: 'RecipeViewPage', params: { id: recipe.value.id } };
    if (props.servings !== undefined) {
        route.query = { servings: String(props.servings) };
    }
    return route;
})

/**
 * open the recipe either in the same tab or in a new tab depending on the link target prop
 */
function openRecipe() {
    if (props.linkTarget != '') {
        const routeData = router.resolve(dest.value);
        window.open(routeData.href, props.linkTarget);
    } else {
        router.push(dest.value);
    }
}

</script>

<style scoped>

.text-rows-1 {
    overflow: hidden;
    text-overflow: clip;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    -webkit-box-orient: vertical;
}

.text-rows-2 {
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
}

/* a long press opens the preview, so keep the browser's own long press (link sheet, text selection) out of it */
.press-target {
    -webkit-touch-callout: none;
    user-select: none;
}

.card-overlay-top-right,
.card-overlay-bottom-right,
.card-overlay-bottom-left {
    position: absolute;
    z-index: 1;
    background: rgba(0, 0, 0, 0.55);
    color: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(4px);
    font-size: 10px;
    line-height: 1;
    padding: 3px 6px;
    border-radius: 4px;
}

.card-overlay-top-right {
    top: 6px;
    right: 6px;
    display: flex;
    align-items: center;
    gap: 3px;
}

.card-overlay-rating-text {
    font-weight: 600;
    font-size: 11px;
}

.card-overlay-bottom-right {
    bottom: 6px;
    right: 6px;
    max-width: 70%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.card-overlay-bottom-left {
    bottom: 6px;
    left: 6px;
}

/* the chip (22px) takes the bottom right corner, the author and last cooked pill moves left of it; the selection
   checkbox of the search page is at the top left of a card and the rating at the top right */
.recipe-card-meta-shifted {
    right: 34px;
    max-width: calc(70% - 28px);
}

/* icon only chip: the fork and knife of the "ready to cook" stat; its name is in the aria-label and the title */
.card-overlay-makenow {
    background: rgb(var(--v-theme-success));
    color: rgb(var(--v-theme-on-success));
    width: 22px;
    height: 22px;
    padding: 0;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

/* thin inset ring around the picture so the cards that can be made now stand out in a grid;
   an outline (drawn over the picture, following its rounded corners) and not a shadow, which the image would cover */
.recipe-card-makenow-ring {
    outline: 2px solid rgb(var(--v-theme-success));
    outline-offset: -2px;
}

.card-overlay-new {
    background: rgba(76, 175, 80, 0.85);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
</style>