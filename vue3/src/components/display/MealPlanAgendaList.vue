<template>
    <!-- the phone's meal plan: a list of days instead of a calendar grid. Scrolled so today is at the top, which leaves
         "Load previous" just above the first screen; "Load more" is at the end. -->
    <div ref="container" class="agenda-list" data-test="agenda-list">
        <div class="agenda-toolbar d-flex align-center">
            <slot name="toolbar-start"></slot>
            <v-spacer></v-spacer>
            <v-btn v-if="!anchorIsToday" variant="text" class="text-none" data-test="agenda-go-today" @click="goToToday">
                {{ $t('Today') }}
            </v-btn>
            <v-btn icon variant="text" :aria-label="$t('JumpToDate')" data-test="agenda-jump">
                <v-icon icon="fa-solid fa-calendar-day"></v-icon>
                <v-menu activator="parent" :close-on-content-click="false" v-model="jumpMenu">
                    <v-card>
                        <v-date-picker :model-value="windowStart.toJSDate()" hide-header @update:model-value="onPickDate"></v-date-picker>
                        <v-card-actions>
                            <v-btn class="text-none" data-test="agenda-picker-today" @click="onPickerToday">{{ $t('Today') }}</v-btn>
                        </v-card-actions>
                    </v-card>
                </v-menu>
            </v-btn>
        </div>

        <!-- at least as tall as the list itself, so there is always room to scroll today to the top, even with few days -->
        <div class="agenda-content">
        <v-btn block variant="text" size="large" class="text-none" :loading="loadingPrevious" data-test="agenda-load-previous" @click="loadPrevious">
            {{ $t('LoadPrevious') }}
        </v-btn>

        <section v-for="day in days" :key="day.key" class="agenda-day" data-test="agenda-day" :data-date="day.key" :data-today="day.isToday ? 'true' : 'false'">
            <!-- today is set apart by colour and weight, not by a word; assistive tech gets it as the current date -->
            <header class="agenda-day-header d-flex align-center px-3" :aria-current="day.isToday ? 'date' : undefined">
                <span class="text-subtitle-1" :class="day.isToday ? 'text-primary font-weight-bold' : 'font-weight-medium'">{{ dayLabel(day.date) }}</span>
                <v-spacer></v-spacer>
                <v-btn icon="$create" size="small" variant="text" :aria-label="$t('AgendaAddEntryFor', {date: dayLabel(day.date)})" data-test="agenda-add"
                       @click="emit('add', day.date)"></v-btn>
            </header>

            <div v-for="entry in day.entries" :key="entry.plan.id" class="agenda-entry d-flex align-center px-3" role="button" tabindex="0"
                 data-test="agenda-entry" :aria-label="$t('AgendaEntryLabel', {mealType: entry.mealTypeName, title: entry.title})"
                 @click="emit('edit', entry.plan)" @keydown.enter="emit('edit', entry.plan)">
                <span class="agenda-bar" :class="{'agenda-bar-none': !entry.color}" data-test="agenda-entry-bar"
                      :data-colored="entry.color ? 'true' : 'false'" :style="entry.color ? {backgroundColor: entry.color} : undefined"></span>
                <div class="flex-grow-1 py-2 agenda-entry-text">
                    <div>{{ entry.title }}</div>
                    <div v-if="entry.range" class="text-caption text-medium-emphasis" data-test="agenda-entry-range">
                        {{ shortDate(entry.range.from) }} – {{ shortDate(entry.range.to) }}
                    </div>
                </div>
                <v-icon v-if="entry.plan.shopping" icon="$shopping" size="small" class="ms-2"></v-icon>
            </div>
        </section>

        <v-btn block variant="tonal" size="large" class="text-none my-2" :loading="loadingMore" data-test="agenda-load-more" @click="loadMore">
            {{ $t('load_more') }}
        </v-btn>
        </div>
    </div>
</template>

<script setup lang="ts">
import {computed, nextTick, onMounted, ref} from "vue";
import {DateTime} from "luxon";
import {MealPlan} from "@/openapi";
import {useMealPlanStore} from "@/stores/MealPlanStore";
import {buildAgendaDays} from "@/utils/mealplan_agenda";

const emit = defineEmits<{
    add: [date: Date],
    edit: [plan: MealPlan],
}>()

// days shown when the list opens, and days added by each "Load more" / "Load previous"
const INITIAL_DAYS = 3
const PAGE_DAYS = 7

const store = useMealPlanStore()

const container = ref<HTMLElement | null>(null)
const windowStart = ref<DateTime>(DateTime.now().startOf('day'))
const dayCount = ref(INITIAL_DAYS)
// the day the list was last opened at (today, or a day jumped to): the one scrolled to the top
const anchorKey = ref(windowStart.value.toISODate() as string)
const loadingMore = ref(false)
const loadingPrevious = ref(false)
const jumpMenu = ref(false)

const days = computed(() => buildAgendaDays(store.planList, windowStart.value.toJSDate(), dayCount.value))
const anchorIsToday = computed(() => anchorKey.value === DateTime.now().toISODate())

function dayLabel(date: Date): string {
    return DateTime.fromJSDate(date).toFormat('cccc M/d')
}

function shortDate(date: Date): string {
    return DateTime.fromJSDate(date).toFormat('ccc M/d')
}

function scrollToAnchor() {
    container.value?.querySelector(`[data-date="${anchorKey.value}"]`)?.scrollIntoView({block: 'start'})
}

function loadDays(from: DateTime, count: number) {
    return store.loadRange(from.toJSDate(), from.plus({days: count - 1}).toJSDate())
}

onMounted(async () => {
    await loadDays(windowStart.value, dayCount.value)
    await nextTick()
    scrollToAnchor()
})

async function loadMore() {
    loadingMore.value = true
    await loadDays(windowStart.value.plus({days: dayCount.value}), PAGE_DAYS)
    dayCount.value += PAGE_DAYS
    loadingMore.value = false
}

/**
 * Add the days before the first one. The list grows upwards, so the scroll position moves down by the height that
 * was added: whatever the reader was looking at stays under their finger (iOS Safari does not do this by itself).
 */
async function loadPrevious() {
    loadingPrevious.value = true
    const newStart = windowStart.value.minus({days: PAGE_DAYS})
    await loadDays(newStart, PAGE_DAYS)

    const heightBefore = container.value?.scrollHeight ?? 0
    windowStart.value = newStart
    dayCount.value += PAGE_DAYS
    await nextTick()
    if (container.value) {
        container.value.scrollTop += container.value.scrollHeight - heightBefore
    }
    loadingPrevious.value = false
}

/**
 * start the list over at the given day
 */
async function jumpTo(date: Date) {
    windowStart.value = DateTime.fromJSDate(date).startOf('day')
    dayCount.value = INITIAL_DAYS
    anchorKey.value = windowStart.value.toISODate() as string
    await loadDays(windowStart.value, INITIAL_DAYS)
    await nextTick()
    scrollToAnchor()
}

function goToToday() {
    return jumpTo(new Date())
}

function onPickerToday() {
    jumpMenu.value = false
    goToToday()
}

function onPickDate(value: unknown) {
    jumpMenu.value = false
    if (value instanceof Date) jumpTo(value)
}

defineExpose({jumpTo})
</script>

<style scoped>
.agenda-list {
    height: 100%;
    overflow-y: auto;
}

/* stays in view; the scroll margin below keeps a day header that is scrolled to from sitting underneath it */
.agenda-toolbar {
    position: sticky;
    top: 0;
    z-index: 1;
    min-height: 48px;
    background: rgb(var(--v-theme-surface));
}

/* a readable column on wide screens with a gutter at the sides (the page container has none, for the calendar's sake);
   on a phone it is simply the full width less the gutters */
.agenda-toolbar,
.agenda-content {
    width: 100%;
    max-width: 720px;
    margin-inline: auto;
    padding-inline: 16px;
}

.agenda-content {
    min-height: 100%;
}

.agenda-day {
    scroll-margin-top: 48px;
}

.agenda-day-header {
    min-height: 48px;
    border-radius: 4px;
    color: rgb(var(--v-theme-on-surface));
    background: rgba(var(--v-theme-on-surface), 0.05);
}

.agenda-entry {
    position: relative;
    min-height: 48px;
    cursor: pointer;
    border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.agenda-entry:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
}

.agenda-entry-text {
    min-width: 0;
    overflow-wrap: anywhere;
}

/* the meal type's colour, drawn like the shopping list's list colour: a 3px strip flush with the row's left edge.
   The meal type itself is in the row's accessible label, so colour is not the only carrier. */
.agenda-bar {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 3px;
}

/* a meal type without a colour: a neutral strip, so every row has one */
.agenda-bar-none {
    background: rgba(var(--v-theme-on-surface), 0.3);
}
</style>
