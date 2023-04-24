<template>
    <div>
        <div class="dropdown d-print-none">
            <a class="btn shadow-none p-0" href="javascript:void(0);" role="button" id="dropdownMenuLink" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                <i class="fas fa-ellipsis-v fa-sm"></i>
            </a>

            <div class="dropdown-menu dropdown-menu-right" aria-labelledby="dropdownMenuLink">
                <a class="dropdown-item"><i class="fas fa-pencil-alt fa-fw"></i> {{ $t("Edit") }}</a>

                <a href="javascript:void(0);">
                    <button class="dropdown-item"><i class="fas fa-bookmark fa-fw"></i> {{ $t("Manage_Books") }}</button>
                </a>

                <a class="dropdown-item" href="#"> <i class="fas fa-shopping-cart fa-fw"></i> {{ $t("Add_to_Shopping") }} </a>

                <a class="dropdown-item" href="javascript:void(0);"><i class="fas fa-calendar fa-fw"></i> {{ $t("Add_to_Plan") }} </a>

                <a href="javascript:void(0);">
                    <button class="dropdown-item"><i class="fas fa-clipboard-list fa-fw"></i> {{ $t("Log_Cooking") }}</button>
                </a>
            </div>
        </div>
    </div>
</template>

<script>
import { makeToast, resolveDjangoUrl, ResolveUrlMixin, StandardToasts } from "@/utils/utils"
import CookLog from "@/components/CookLog"
import axios from "axios"
import moment from "moment"
import Vue from "vue"
import { ApiApiFactory } from "@/utils/openapi/api"

Vue.prototype.moment = moment

export default {
    name: "IngredientContextMenu",
    mixins: [ResolveUrlMixin],
    components: {},
    data() {
        return {
            servings_value: 0,
            isPinned: false,
            recipe_share_link: undefined,
            modal_id: Math.round(Math.random() * 100000),
            options: {
                entryEditing: {
                    date: null,
                    id: -1,
                    meal_type: null,
                    note: "",
                    note_markdown: "",
                    recipe: null,
                    servings: 1,
                    shared: [],
                    title: "",
                    title_placeholder: this.$t("Title"),
                },
            },
            entryEditing: {},
            mealplan: undefined,
        }
    },
    props: {},
    mounted() {},
    watch: {
        // recipe: {
        //     handler() {},
        //     deep: true,
        // },
        // servings: function (newVal) {
        //     this.servings_value = parseInt(newVal)
        // },
    },
    methods: {
        pinRecipe() {
            let pinnedRecipes = JSON.parse(localStorage.getItem("pinned_recipes")) || []
            if (this.isPinned) {
                pinnedRecipes = pinnedRecipes.filter((r) => r.id !== this.recipe.id)
                makeToast(this.$t("Unpin"), this.$t("UnpinnedConfirmation", { recipe: this.recipe.name }), "info")
            } else {
                pinnedRecipes.push({ id: this.recipe.id, name: this.recipe.name })
                makeToast(this.$t("Pin"), this.$t("PinnedConfirmation", { recipe: this.recipe.name }), "info")
            }
            this.isPinned = !this.isPinned
            localStorage.setItem("pinned_recipes", JSON.stringify(pinnedRecipes))
        },
    },
}
</script>
