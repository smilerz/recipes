<template>
    <!-- Undo plus a history menu (like undo in Office): the button undoes the last action, the menu lists the recent
         ones and undoes back through the one you pick. Notes that cannot be undone are listed greyed out. -->
    <div class="d-flex align-center">
        <v-btn variant="text" class="text-none px-2" prepend-icon="fa-solid fa-reply" data-test="shopping-undo"
               :rounded="tall ? 0 : undefined" :height="tall ? '100%' : undefined"
               :disabled="!useShoppingStore().canUndo" @click="useShoppingStore().undoChange()">
            {{ $t('Undo') }}
        </v-btn>
        <v-btn icon variant="text" size="x-small" width="20" class="ms-n1" data-test="shopping-history" :aria-label="$t('History')"
               :disabled="historyItems.length === 0">
            <v-icon icon="fa-solid fa-caret-down"></v-icon>
            <v-menu activator="parent">
                <v-list density="compact">
                    <v-list-item v-for="h in historyItems" :key="h.index" data-test="history-item" :class="{'text-disabled': !h.undoable}"
                                 :aria-disabled="!h.undoable" @click="onHistoryClick(h)">
                        {{ h.label }}
                    </v-list-item>
                </v-list>
            </v-menu>
        </v-btn>
    </div>
</template>

<script setup lang="ts">
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import {useShoppingStore} from "@/stores/ShoppingStore";
import {MessageType, useMessageStore} from "@/stores/MessageStore";
import {NOT_UNDOABLE_HISTORY_TYPES, ShoppingOperationHistoryEntry, ShoppingOperationHistoryType} from "@/types/Shopping";

defineProps({
    // fill the height of a tab bar and square the corners, like the other buttons in it
    tall: {type: Boolean, default: false},
})

const {t} = useI18n()

const HISTORY_LABEL_KEYS: Record<ShoppingOperationHistoryType, string> = {
    CHECKED: 'HistoryChecked', UNCHECKED: 'HistoryUnchecked', DELAY: 'HistoryDelay', UNDELAY: 'HistoryUndelay',
    IGNORE: 'HistoryIgnore', UNIGNORE: 'HistoryUnignore', CREATE: 'HistoryCreate', DESTROY: 'HistoryDestroy',
    SCALE: 'HistoryScale', LISTS: 'HistoryLists', LISTS_SET: 'HistoryLists', CATEGORY: 'HistoryCategory', PANTRY_ADD: 'HistoryPantryAdd',
}

/** what an action touched, for its history label: the food's name when it is one food, otherwise a count */
function historyWhat(item: ShoppingOperationHistoryEntry): string {
    if (item.type === 'PANTRY_ADD') return t('HistoryItems', {count: item.count ?? 0})
    const foods = new Map(item.entries.map(e => [e.food?.id, e.food?.name]))
    if (foods.size === 1) return String(Array.from(foods.values())[0] ?? t('HistoryItems', {count: 1}))
    return t('HistoryItems', {count: foods.size})
}

/** the last actions, newest first; index is the position in the store's history */
const historyItems = computed(() => useShoppingStore().undoStack.map((item, index) => ({
    index,
    type: item.type,
    undoable: !NOT_UNDOABLE_HISTORY_TYPES.includes(item.type),
    label: t(HISTORY_LABEL_KEYS[item.type], {what: historyWhat(item)}),
})).reverse().slice(0, 10))

function onHistoryClick(item: { index: number, undoable: boolean }) {
    if (!item.undoable) {
        // listed so the history is honest about what happened, but undo never removes inventory
        useMessageStore().addMessage(MessageType.INFO, t('PantryCannotBeUndone'), 5000)
        return
    }
    useShoppingStore().undoUntil(item.index)
}

defineExpose({historyItems, onHistoryClick})
</script>
