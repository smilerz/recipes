import {acceptHMRUpdate, defineStore} from "pinia"
import {
    ApiApi,
    ApiShoppingListEntryListRequest,
    Food,
    FoodBatchUpdate,
    FoodShopping,
    Recipe,
    ShoppingList,
    ShoppingListEntry,
    ShoppingListEntryBulk,
    ShoppingListRecipe,
    Supermarket,
    SupermarketCategory
} from "@/openapi";
import {computed, ref, shallowRef, triggerRef} from "vue";
import {
    IShoppingExportEntry,
    IShoppingList,
    IShoppingListCategory,
    IShoppingListFood,
    IShoppingSyncQueueEntry,
    ShoppingGroupingOptions,
    ShoppingListStats,
    NOT_UNDOABLE_HISTORY_TYPES,
    ShoppingOperationHistoryEntry,
    ShoppingOperationHistoryType
} from "@/types/Shopping";
import {ErrorMessageType, PreparedMessage, useMessageStore} from "@/stores/MessageStore";
import {useUserPreferenceStore} from "@/stores/UserPreferenceStore";
import {isDelayed, isEntryVisible} from "@/utils/logic_utils";
import {DateTime} from "luxon";

const _STORE_ID = "shopping_store"
const UNDEFINED_CATEGORY = 'shopping_undefined_category'

export const useShoppingStore = defineStore(_STORE_ID, () => {
    let globalEntriesMap = ref(new Map<number, ShoppingListEntry>)
    let supermarketCategories = ref([] as SupermarketCategory[])
    let supermarkets = ref([] as Supermarket[])
    let shoppingLists = ref([] as ShoppingList[])

    // internal
    let currentlyUpdating = ref(false)
    let initialized = ref(false)

    let autoSyncLastTimestamp = ref(new Date('1970-01-01'))
    let autoSyncHasFocus = ref(true)
    let autoSyncTimeoutId = ref(0)

    let undoStack = ref([] as ShoppingOperationHistoryEntry[])
    let queueTimeoutId = ref(-1)
    let itemCheckSyncQueue = shallowRef([] as IShoppingSyncQueueEntry[])
    let syncQueueRunning = ref(false)

    let entriesByGroup = shallowRef([] as IShoppingListCategory[])
    let entriesByGroupMealPlan = shallowRef([] as IShoppingListCategory[])
    let selectedMealPlan = ref<number | undefined>(undefined)

    /**
     * update the variable that displays the shopping list
     * split from getEntriesStructure so its reusable for meal plan
     */
    function updateEntriesStructure() {
        entriesByGroup.value = getEntriesStructure()

        if (selectedMealPlan.value != undefined) {
            console.log("updateEntriesStructure for meal plan " + selectedMealPlan.value)
            entriesByGroupMealPlan.value = getEntriesStructure(selectedMealPlan.value)
        }
    }

    /**
     * build a multi-level data structure ready for display from shopping list entries
     * group by selected grouping key
     */
    function getEntriesStructure(mealPlanId: number | undefined = undefined) {
        let structure = {} as IShoppingList
        structure.categories = new Map<string, IShoppingListCategory>

        const deviceSettings = useUserPreferenceStore().deviceSettings

        if (deviceSettings.shopping_selected_grouping === ShoppingGroupingOptions.CATEGORY && deviceSettings.shopping_selected_supermarket != null) {
            deviceSettings.shopping_selected_supermarket.categoryToSupermarket.forEach(cTS => {
                structure.categories.set(cTS.category.name, {'name': cTS.category.name, 'foods': new Map<number, IShoppingListFood>} as IShoppingListCategory)
            })
        }

        let orderedStructure = [] as IShoppingListCategory[]

        // build structure
        globalEntriesMap.value.forEach(shoppingListEntry => {
            if (isEntryVisible(shoppingListEntry, deviceSettings)) {
                if (mealPlanId == undefined || shoppingListEntry.listRecipe && shoppingListEntry.listRecipeData.mealplan == mealPlanId) {
                    structure = updateEntryInStructure(structure, shoppingListEntry)
                }
            }
        })

        // ordering
        let undefinedCategoryGroup = structure.categories.get(UNDEFINED_CATEGORY)
        if (undefinedCategoryGroup != null) {
            orderedStructure.push(undefinedCategoryGroup)
            structure.categories.delete(UNDEFINED_CATEGORY)
        }

        if (deviceSettings.shopping_selected_grouping === ShoppingGroupingOptions.CATEGORY && deviceSettings.shopping_selected_supermarket != null) {
            deviceSettings.shopping_selected_supermarket.categoryToSupermarket.forEach(cTS => {
                if (structure.categories.has(cTS.category.name)) {
                    let category = structure.categories.get(cTS.category.name)
                    if (category && category.foods.size > 0) {
                        orderedStructure.push(category)
                    }
                    structure.categories.delete(cTS.category.name)
                }
            })
        }

        if(!(useUserPreferenceStore().deviceSettings.shopping_selected_grouping == ShoppingGroupingOptions.CATEGORY && useUserPreferenceStore().deviceSettings.shopping_show_selected_supermarket_only)){
            const remaining = Array.from(structure.categories.values()).filter(category => category.foods.size > 0)
            remaining.sort((a, b) => a.name.localeCompare(b.name))
            orderedStructure.push(...remaining)
        }

        return orderedStructure
    }

    /**
     * updates a given entry within the precalculated shopping list structure
     * CANNOT handle anything besides checked state and shopping lists (e.g. category does not work)
     * @param entry
     */
    function updateEntryInShoppingList(entry: ShoppingListEntry) {
        //TODO this only works well when checking and even then the render thread seems to be faster
        // TODO showing the different render state before this code is able to remove the entry


        // predictive update of entry directly in render structure
        entriesByGroup.value.forEach((sLC, sLCIndex) => {
            sLC.foods.forEach(sLF => {
                sLF.entries.forEach(sLE => {
                    if (sLE.id == entry.id) {
                        sLE.checked = entry.checked
                        sLE.shoppingLists = entry.shoppingLists

                        if (!isEntryVisible(sLE, useUserPreferenceStore().deviceSettings)) {
                            sLF.entries.delete(sLE.id!)
                        }
                    }
                })
                if (sLF.entries.size == 0) {
                    sLC.foods.delete(sLF.food.id!)
                }
            })
            if (sLC.foods.size == 0) {
                entriesByGroup.value.splice(sLCIndex, 1)
            }
        })
    }

    /**
     * get the total number of foods in the shopping list
     * since entries are always grouped by food, it makes no sense to display the entry count anywhere
     */
    let totalFoods = computed(() => {
        let count = 0
        if (initialized.value) {
            entriesByGroup.value.forEach(category => {
                count += category.foods.size
            })
        }
        return count
    })

    /**
     * flattened list of entries used for exporters
     * kinda uncool but works for now
     * @return IShoppingExportEntry[]
     */
    function getFlatEntries() {
        let items: IShoppingExportEntry[] = []

        entriesByGroup.value.forEach(shoppingListEntry => {
            shoppingListEntry.foods.forEach(food => {
                food.entries.forEach(entry => {
                    items.push({
                        amount: entry.amount,
                        unit: entry.unit?.name ?? '',
                        food: entry.food?.name ?? '',
                    })
                })
            })
        })

        return items
    }

    /**
     * checks if failed items are contained in the sync queue
     */
    function hasFailedItems() {
        for (let i in itemCheckSyncQueue.value) {
            if (itemCheckSyncQueue.value[i]['status'] === 'syncing_failed_before' || itemCheckSyncQueue.value[i]['status'] === 'waiting_failed_before') {
                return !syncQueueRunning.value
            }
        }
        return false
    }

    /**
     * Retrieves all shopping related data (shopping list entries, supermarkets, supermarket categories and shopping list recipes) from API
     * @param mealPlanId optionally filter by mealplan ID and only load entries associated with that
     */
    function refreshFromAPI(mealPlanId?: number) {
        if (!currentlyUpdating.value) {
            currentlyUpdating.value = true
            autoSyncLastTimestamp.value = new Date();

            let api = new ApiApi()
            let requestParameters = {pageSize: 50, page: 1} as ApiShoppingListEntryListRequest
            if (mealPlanId) {
                requestParameters.mealplan = mealPlanId
            } else {
                // only clear local entries when not given a meal plan to not accidentally filter the shopping list
                globalEntriesMap.value = new Map<number, ShoppingListEntry>
                initialized.value = false
            }

            recLoadShoppingListEntries(requestParameters)

            api.apiSupermarketCategoryList().then(r => {
                supermarketCategories.value = r.results
            }).catch((err) => {
                useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
            })

            api.apiSupermarketList().then(r => {
                supermarkets.value = r.results
            }).catch((err) => {
                useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
            })
        }
    }

    /**
     * recursively load shopping list entries from paginated api
     * @param requestParameters
     */
    function recLoadShoppingListEntries(requestParameters: ApiShoppingListEntryListRequest) {
        let api = new ApiApi()
        return api.apiShoppingListEntryList(requestParameters).then((r) => {
            let promises = [] as Promise<any>[]
            let newMap = new Map<number, ShoppingListEntry>()
            r.results.forEach((e) => {
                newMap.set(e.id!, e)
            })
            // bulk assign to avoid unnecessary reactivity updates
            globalEntriesMap.value = new Map([...globalEntriesMap.value, ...newMap])

            if (requestParameters.page == 1) {
                if (r.next) {
                    while (Math.ceil(r.count / requestParameters.pageSize!) > requestParameters.page) {
                        requestParameters.page = requestParameters.page + 1
                        promises.push(recLoadShoppingListEntries(requestParameters))
                    }
                }

                Promise.allSettled(promises).then(() => {
                    updateEntriesStructure()
                    currentlyUpdating.value = false
                    initialized.value = true
                })
            }

        }).catch((err) => {
            currentlyUpdating.value = false
            useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
        })
    }

    /**
     * perform auto sync request to special endpoint returning only entries changed since last auto sync
     */
    function autoSync() {
        if (!currentlyUpdating.value && autoSyncHasFocus.value && !hasFailedItems()) {
            currentlyUpdating.value = true

            const api = new ApiApi()
            api.apiShoppingListEntryList({updatedAfter: autoSyncLastTimestamp.value}).then((r) => {
                autoSyncLastTimestamp.value = r.timestamp!
                r.results.forEach((e) => {
                    globalEntriesMap.value.set(e.id!, e)
                })
                if (r.results.length > 0) {
                    updateEntriesStructure()
                }
                currentlyUpdating.value = false
            }).catch((err: any) => {
                currentlyUpdating.value = false
            })
        }
    }

    /**
     * creates new ShoppingListEntry in database and updates it in store
     * @param object entry to create
     * @param undo if the user should be able to undo the change or not
     */
    function createObject(object: ShoppingListEntry, undo: boolean) {
        const api = new ApiApi()
        return api.apiShoppingListEntryCreate({shoppingListEntry: object}).then((r) => {
            globalEntriesMap.value.set(r.id!, r)
            updateEntriesStructure()
            if (undo) {
                registerChange("CREATE", [r])
            }
            return r
        }).catch((err) => {
            useMessageStore().addError(ErrorMessageType.CREATE_ERROR, err)
            return undefined
        })
    }

    /**
     * update existing entry object and updated_at timestamp
     * updates data in store
     * IMPORTANT: always use this method to update objects to keep client state consistent
     * @param object entry object to update
     * @return {Promise<ShoppingListEntry>} promise of updating call to subscribe to
     */
    function updateObject(object: ShoppingListEntry) {
        const api = new ApiApi()
        // sets the update_at timestamp on the client to prevent auto sync from overriding with older changes
        // moment().format() yields locale aware datetime without ms 2024-01-04T13:39:08.607238+01:00
        //Vue.set(object, 'updated_at', moment().format())
        // object.updatedAt = DateTime.toLocaleString()
        // TODO setting timestamp on the client does not make sense because client and server clock might be out of sync and field will be overridden by server anyway

        return api.apiShoppingListEntryUpdate({id: object.id!, shoppingListEntry: object}).then((r) => {
            globalEntriesMap.value.set(r.id!, r)
        }).catch((err) => {
            useMessageStore().addError(ErrorMessageType.UPDATE_ERROR, err)
        })
    }


    /**
     * delete shopping list entry object from DB and store
     * @param object entry object to delete
     * @param undo if the user should be able to undo the change or not
     */
    function deleteObject(object: ShoppingListEntry, undo: boolean) {
        const api = new ApiApi()
        return api.apiShoppingListEntryDestroy({id: object.id!}).then((r) => {
            globalEntriesMap.value.delete(object.id!)
            // Rebuild the display from the (now-updated) source. The previous in-place surgery
            // mutated the entriesByGroup shallowRef without reassigning its value or calling
            // triggerRef in the multi-entry case, so the deleted row stayed on screen until a
            // refresh (D01). updateEntriesStructure() reassigns the value, which always re-renders.
            updateEntriesStructure()

            if (undo) {
                registerChange("DESTROY", [object])
            }
        }).catch((err) => {
            useMessageStore().addError(ErrorMessageType.DELETE_ERROR, err)
        })
    }

    /**
     * returns a distinct list of recipes associated with unchecked shopping list entries
     */
    function getAssociatedRecipes(): ShoppingListRecipe[] {
        let recipes = [] as ShoppingListRecipe[]

        globalEntriesMap.value.forEach(e => {
            if (e.listRecipe != null && recipes.findIndex(x => x.id == e.listRecipe) == -1 && isEntryVisible(e, useUserPreferenceStore().deviceSettings)) {
                recipes.push(e.listRecipeData)
            }
        })

        return recipes
    }


    /**
     * get the key (name) of the IShoppingListCategory that an entry belongs to
     * @param object
     */
    function getEntryCategoryKey(object: ShoppingListEntry) {
        let group = useUserPreferenceStore().deviceSettings.shopping_selected_grouping
        let groupingKey = UNDEFINED_CATEGORY

        if (group == ShoppingGroupingOptions.CATEGORY && object.food != null && object.food.supermarketCategory != null) {
            groupingKey = object.food?.supermarketCategory?.name
        } else if (group == ShoppingGroupingOptions.CREATED_BY) {
            groupingKey = object.createdBy.displayName
        } else if (group == ShoppingGroupingOptions.RECIPE && object.listRecipeData != null) {
            if (object.listRecipeData.recipeData != null) {
                groupingKey = object.listRecipeData.recipeData.name
                if (object.listRecipeData.mealPlanData != null) {
                    groupingKey += ' - ' + object.listRecipeData.mealPlanData.mealType.name + ' - ' + DateTime.fromJSDate(object.listRecipeData.mealPlanData.fromDate).toLocaleString(DateTime.DATE_SHORT)
                }
            }
        }

        return groupingKey
    }


    /**
     * puts an entry into the appropriate group of the IShoppingList datastructure
     * if a group does not yet exist and the sorting is not set to category with selected supermarket only, it will be created
     * @param structure
     * @param entry
     */
    function updateEntryInStructure(structure: IShoppingList, entry: ShoppingListEntry) {
        let groupingKey = getEntryCategoryKey(entry)

        if (!structure.categories.has(groupingKey)) {
            structure.categories.set(groupingKey, {'name': groupingKey, 'foods': new Map<number, IShoppingListFood>} as IShoppingListCategory)
        }
        if (structure.categories.has(groupingKey)) {
            if (!structure.categories.get(groupingKey)!.foods.has(entry.food.id!)) {
                structure.categories.get(groupingKey)!.foods.set(entry.food.id!, {
                    food: entry.food,
                    entries: new Map<number, ShoppingListEntry>
                } as IShoppingListFood)
            }
            structure.categories.get(groupingKey)!.foods.get(entry.food.id!)!.entries.set(entry.id!, entry)
        }

        return structure
    }

    /**
     * function to handle user checking or unchecking a set of entries
     * @param {{}} entries set of entries
     * @param checked boolean to set checked state of entry to
     * @param undo if the user should be able to undo the change or not
     */
    function setEntriesCheckedState(entries: ShoppingListEntry[], checked: boolean, undo: boolean) {
        if (undo) {
            registerChange((checked ? 'CHECKED' : 'UNCHECKED'), entries)
        }
        let entryIdList: number[] = []
        entries.forEach(entry => {
            entry.checked = checked
            globalEntriesMap.value.set(entry.id!, entry)
            entryIdList.push(entry.id!)
        })

        // not ideal to recalculate everything but its a quick fix
        // TODO special function just for checked state refreshing
        updateEntriesStructure()

        itemCheckSyncQueue.value.push({
            ids: entryIdList,
            checked: checked,
            status: 'waiting',
        } as IShoppingSyncQueueEntry)

        runSyncQueue(100)
    }

    /**
     * go through the list of queued requests and try to run them
     * add request back to queue if it fails due to offline or timeout
     * Do NOT call this method directly, always call using runSyncQueue method to prevent simultaneous runs
     * @private
     */
    function _replaySyncQueue() {
        if (navigator.onLine || document.location.href.includes('localhost')) {
            let api = new ApiApi()
            let promises: Promise<void>[] = []

            let updatedEntries = new Map<number, ShoppingListEntry>()
            itemCheckSyncQueue.value.forEach((entry, index) => {
                entry['status'] = ((entry['status'] === 'waiting_failed_before') ? 'syncing_failed_before' : 'syncing')
                syncQueueRunning.value = true
                let p = api.apiShoppingListEntryBulkCreate({shoppingListEntryBulk: entry}, {}).then((r) => {
                    entry.ids.forEach(id => {
                        let e = globalEntriesMap.value.get(id)
                        if (e) {
                            // updatedAt is server-managed (readonly) on the generated type, but this
                            // is the store deliberately syncing its own cached copy to the server's
                            // response timestamp after a successful write - not an external mutation.
                            (e as any).updatedAt = r.timestamp
                            updatedEntries.set(id, e)
                        }
                    })
                    itemCheckSyncQueue.value.splice(index, 1)
                }).catch((err) => {
                    if (err.name === "FetchError") {
                        entry['status'] = 'waiting_failed_before'
                    } else {
                        itemCheckSyncQueue.value.splice(index, 1)
                        useMessageStore().addError(ErrorMessageType.UPDATE_ERROR, err)
                    }
                })
                promises.push(p)
            })

            Promise.allSettled(promises).finally(() => {
                globalEntriesMap.value = new Map([...globalEntriesMap.value, ...updatedEntries])
                syncQueueRunning.value = false
                //TODO proper function to splice/update structure as needed
                //useShoppingStore().updateEntriesStructure()
                if (itemCheckSyncQueue.value.length > 0) {
                    runSyncQueue(500)
                }
            })
        } else {
            // try again if internet after a few seconds
            runSyncQueue(5000)
        }
    }

    /**
     * manages running the replaySyncQueue function after the given timeout
     * calling this function might cancel a previously created timeout
     * @param timeout time in ms after which to run the replaySyncQueue function
     */
    function runSyncQueue(timeout: number) {
        clearTimeout(queueTimeoutId.value)

        queueTimeoutId.value = window.setTimeout(() => {
            _replaySyncQueue()
        }, timeout)
    }

    /**
     * function to handle user "delaying" and "undelaying" shopping entries
     * @param {{}} entries set of entries
     * @param delay if entries should be delayed or if delay should be removed
     * @param undo if the user should be able to undo the change or not
     */
    function setEntriesDelayedState(entries: ShoppingListEntry[], delay: boolean, undo: boolean) {
        let delay_hours = useUserPreferenceStore().userSettings.defaultDelay!
        let delayDate = new Date(Date.now() + delay_hours * (60 * 60 * 1000))

        if (undo) {
            registerChange((delay ? 'DELAY' : 'UNDELAY'), entries)
        }
        entries.forEach(entry => {
            entry.delayUntil = (delay ? delayDate : new Date('1970-01-01'))
            globalEntriesMap.value.set(entry.id!, entry)
        })

        // the screen reads the pre-built grouped list: rebuild it now so postponed entries leave (or come back to) it
        // right away instead of waiting for the saves or the next refresh - same as checking an entry off does
        updateEntriesStructure()

        Promise.all(entries.map(entry => updateObject(entry))).then(() => updateEntriesStructure())
    }

    /**
     * ignore all foods of the given entries for shopping in the future and check associated entries from the list
     * @param ignored if the food should be ignored or not ignored (for undo)
     * @param {{}} entries set of entries associated with food to set checked
     * @param undo if the user should be able to undo the change or not
     */
    function setFoodIgnoredState(entries: ShoppingListEntry[], ignored: boolean, undo: boolean) {
        const api = new ApiApi()
        if (undo) {
            registerChange((ignored ? 'IGNORE' : 'UNIGNORE'), entries)
        }

        let foods = [] as FoodShopping[]

        entries.forEach(e => {
            if (!foods.includes(e.food!)) {
                foods.push(e.food!)
            }
        })

        setEntriesCheckedState(entries, ignored, false)

        foods.forEach(food => {
            (food as any).ignoreShopping = ignored
            // FoodShopping is a lighter shopping-list-context view of the same Food row (both
            // require only `name`) - apiFoodUpdate's payload type wants the full Food shape, but
            // this update only ever touches ignoreShopping, so the narrower shape is safe here.
            api.apiFoodUpdate({food: food as unknown as Food, id: food.id!}).catch(err => {
                useMessageStore().addError(ErrorMessageType.UPDATE_ERROR, err)
            })
        })
    }

    /**
     * delete list of entries
     * @param {{}} entries set of entries
     */
    function deleteEntries(entries: ShoppingListEntry[]) {
        entries.forEach((entry) => {
            deleteObject(entry, false)
        })
    }

    function deleteShoppingListRecipe(shopping_list_recipe_id: number) {
        const api = new ApiApi()

        globalEntriesMap.value.forEach(entry => {
            if (entry.listRecipe == shopping_list_recipe_id) {
                globalEntriesMap.value.delete(entry.id!)
            }
        })

        api.apiShoppingListRecipeDestroy({id: shopping_list_recipe_id}).then((x) => {
            // no need to update anything, entries were already removed
        }).catch((err) => {
            useMessageStore().addError(ErrorMessageType.DELETE_ERROR, err)
        })
    }


    /**
     * register the change to a set of entries to allow undoing it
     * throws an Error if the operation type is not known
     * @param type the type of change to register. This determines what undoing the change does. (CREATE->delete object,
     *              CHECKED->uncheck entry, UNCHECKED->check entry, DELAY->remove delay)
     * @param {{}} entries set of entries
     */
    function registerChange(type: ShoppingOperationHistoryType, entries: ShoppingListEntry[]) {
        undoStack.value.push({'type': type, 'entries': entries} as ShoppingOperationHistoryEntry)
    }

    /**
     * add a note to the history that cannot be undone (e.g. foods added to the pantry), so the history stays honest
     * about what happened; undo skips it
     */
    function registerNote(type: ShoppingOperationHistoryType, count: number) {
        undoStack.value.push({'type': type, 'entries': [], 'count': count} as ShoppingOperationHistoryEntry)
    }

    function isUndoable(item: ShoppingOperationHistoryEntry) {
        return !NOT_UNDOABLE_HISTORY_TYPES.includes(item.type)
    }

    /** if there is anything left that undo can revert (notes do not count) */
    const canUndo = computed(() => undoStack.value.some(isUndoable))

    /**
     * takes the newest undoable item from the undo stack and reverts it; notes are left where they are
     */
    function undoChange() {
        for (let i = undoStack.value.length - 1; i >= 0; i--) {
            if (isUndoable(undoStack.value[i])) {
                const [item] = undoStack.value.splice(i, 1)
                revertChange(item)
                return
            }
        }
    }

    /**
     * undo back through the history item at the given index (oldest first), newest first; notes in between stay
     * @param index index in undoStack; a note cannot be undone, so nothing happens for it
     */
    function undoUntil(index: number) {
        if (index < 0 || index >= undoStack.value.length || !isUndoable(undoStack.value[index])) return
        for (let i = undoStack.value.length - 1; i >= index; i--) {
            if (!isUndoable(undoStack.value[i])) continue
            const [item] = undoStack.value.splice(i, 1)
            revertChange(item)
        }
    }

    function revertChange(item: ShoppingOperationHistoryEntry) {
        const type = item['type']
        const entries = item['entries']

        if (type === 'CHECKED' || type === 'UNCHECKED') {
            setEntriesCheckedState(entries, (type === 'UNCHECKED'), false)
        } else if (type === 'DELAY' || type === 'UNDELAY') {
            setEntriesDelayedState(entries, (type === 'UNDELAY'), false)
        } else if (type === 'CREATE') {
            for (let i in entries) {
                let e = entries[i]
                deleteObject(e, false)
            }
        } else if (type === 'DESTROY') {
            for (let i in entries) {
                let e = entries[i]
                createObject(e, false)
            }
        } else if (type === 'IGNORE' || type === 'UNIGNORE') {
            setFoodIgnoredState(entries, (type === 'UNIGNORE'), false)
        } else if (type === 'SCALE' && item.amounts) {
            const originalAmounts = item.amounts
            entries.forEach((e, i) => {
                e.amount = originalAmounts[i]
                globalEntriesMap.value.set(e.id!, e)
            })
            updateEntriesStructure()
            Promise.all(entries.map(e => updateObject(e))).then(() => updateEntriesStructure())
        } else if (type === 'LISTS' && item.lists) {
            revertShoppingListsAdded(item.lists)
        } else if (type === 'LISTS_SET' && item.previousLists) {
            revertShoppingListsSet(item.previousLists)
        } else if (type === 'CATEGORY' && item.categories) {
            revertCategories(item.entries, item.categories)
        }
    }

    /** remove each list again from just the entries that gained it; entries that were already on it keep it */
    function revertShoppingListsAdded(added: { list: ShoppingList, entries: ShoppingListEntry[] }[]) {
        const api = new ApiApi()
        added.forEach(({list, entries}) => {
            if (entries.length === 0) return
            entries.forEach(e => e.shoppingLists = (e.shoppingLists ?? []).filter(l => l.id !== list.id))
            api.apiShoppingListEntryBulkCreate({
                shoppingListEntryBulk: {ids: entries.map(e => e.id!), shoppingListsRemove: [list.id!]}
            }).catch(err => {
                useMessageStore().addError(ErrorMessageType.UPDATE_ERROR, err)
            })
        })
        updateEntriesStructure()
    }

    /** put each food back to the category it had, one batch call per previous category */
    function revertCategories(entries: ShoppingListEntry[], categories: { food: FoodShopping, previous: SupermarketCategory | null | undefined }[]) {
        const api = new ApiApi()
        const foodsByCategory = new Map<number | null, number[]>()
        categories.forEach(({food, previous}) => {
            (food as any).supermarketCategory = previous
            entries.filter(e => e.food?.id === food.id).forEach(e => (e.food as any).supermarketCategory = previous)
            const key = previous?.id ?? null
            foodsByCategory.set(key, [...(foodsByCategory.get(key) ?? []), food.id!])
        })
        updateEntriesStructure()

        foodsByCategory.forEach((foodIds, categoryId) => {
            api.apiFoodBatchUpdateUpdate({foodBatchUpdate: {foods: foodIds, category: categoryId} as FoodBatchUpdate}).catch(err => {
                useMessageStore().addError(ErrorMessageType.UPDATE_ERROR, err)
            })
        })
    }

    /**
     * change the supermarket category of foods
     * @param undo if the user should be able to undo the change; undoing restores each food's previous category
     */
    function updateCategories(shoppingListFoods: IShoppingListFood[], category: SupermarketCategory, undo: boolean = false) {
        const api = new ApiApi()
        const foodIds: number[] = []
        if (undo) {
            undoStack.value.push({
                'type': 'CATEGORY',
                'entries': shoppingListFoods.flatMap(sLF => Array.from(sLF.entries.values())),
                'categories': shoppingListFoods.map(sLF => ({food: sLF.food as FoodShopping, previous: (sLF.food as any).supermarketCategory}))
            } as ShoppingOperationHistoryEntry)
        }
        shoppingListFoods.forEach(sLF => {
            // supermarketCategory is server-managed (readonly) on the generated type; this is an
            // optimistic local cache update ahead of the API call below, same pattern as the
            // updatedAt sync elsewhere in this store - not an external mutation.
            (sLF.food as any).supermarketCategory = category
            sLF.entries.forEach(e => (e.food as any).supermarketCategory = category)
            foodIds.push(sLF.food.id!)
        })

        useShoppingStore().updateEntriesStructure()

        // FoodBatchUpdate's generated type marks substituteAdd/Remove/Set and inheritFields*
        // as required, but this endpoint already ships without them (this cast changes no
        // runtime behavior - see the substituteAdd/Set discussion, it's a schema/backend drift,
        // not something to paper over by guessing at Add/Remove/Set semantics here).
        api.apiFoodBatchUpdateUpdate({foodBatchUpdate: {foods: foodIds, category: category.id!} as FoodBatchUpdate}).then(r => {
            useMessageStore().addPreparedMessage(PreparedMessage.UPDATE_SUCCESS)
        }).catch(err => {
            useMessageStore().addError(ErrorMessageType.UPDATE_ERROR, err)
        })
    }

    /**
     * multiply the amount of each entry by a factor and save each one (there is no bulk amount endpoint)
     * @param entries entries to scale
     * @param factor 2 doubles, 0.5 halves
     * @param undo if the user should be able to undo the change; undoing restores the exact previous amounts
     */
    function scaleEntries(entries: ShoppingListEntry[], factor: number, undo: boolean) {
        if (undo) {
            undoStack.value.push({'type': 'SCALE', 'entries': entries, 'amounts': entries.map(e => e.amount)} as ShoppingOperationHistoryEntry)
        }
        entries.forEach(entry => {
            entry.amount = entry.amount * factor
            globalEntriesMap.value.set(entry.id!, entry)
        })
        // rebuild the grouped list the screen reads, so the lines show the new amounts right away
        updateEntriesStructure()
        return Promise.all(entries.map(entry => updateObject(entry))).then(results => {
            updateEntriesStructure()
            return results
        })
    }

    /**
     * add the given shopping lists to the entries, keeping the lists each entry is already on
     * @param undo if the user should be able to undo the change; undoing removes each list only from the entries that gained it
     */
    function addEntriesToShoppingLists(entries: ShoppingListEntry[], shoppingLists: ShoppingList[], undo: boolean = false) {
        const api = new ApiApi()
        if (undo) {
            undoStack.value.push({
                'type': 'LISTS',
                'entries': entries,
                'lists': shoppingLists.map(list => ({list, entries: entries.filter(e => !(e.shoppingLists ?? []).some(existing => existing.id === list.id))}))
            } as ShoppingOperationHistoryEntry)
        }
        entries.forEach(entry => {
            const merged = [...(entry.shoppingLists ?? [])]
            shoppingLists.forEach(list => {
                if (!merged.some(existing => existing.id === list.id)) merged.push(list)
            })
            entry.shoppingLists = merged
        })

        updateEntriesStructure()

        return api.apiShoppingListEntryBulkCreate({
            shoppingListEntryBulk: {
                ids: entries.map(e => e.id!),
                shoppingListsAdd: shoppingLists.map(sl => sl.id!)
            }
        }).then(() => {
            useMessageStore().addPreparedMessage(PreparedMessage.UPDATE_SUCCESS)
        }).catch(err => {
            useMessageStore().addError(ErrorMessageType.UPDATE_ERROR, err)
        })
    }

    /**
     * replace the lists of the entries with the given ones (the server ignores an empty set, so none means remove all)
     * @param undo if the user should be able to undo the change; undoing restores each entry's previous lists
     */
    function updateEntryShoppingLists(entries: ShoppingListEntry[], shoppingLists: ShoppingList[], undo: boolean = false) {
        const api = new ApiApi()
        if (undo) {
            undoStack.value.push({
                'type': 'LISTS_SET',
                'entries': entries,
                'previousLists': entries.map(entry => ({entry, lists: entry.shoppingLists ?? []}))
            } as ShoppingOperationHistoryEntry)
        }
        entries.forEach(sLE => {
            sLE.shoppingLists = shoppingLists
        })

        updateEntriesStructure()

        return setShoppingListsOnServer(entries.map(e => e.id!), shoppingLists).then(() => {
            useMessageStore().addPreparedMessage(PreparedMessage.UPDATE_SUCCESS)
        }).catch(err => {
            useMessageStore().addError(ErrorMessageType.UPDATE_ERROR, err)
        })

        //TODO if food update that as well
    }

    /** one bulk call that makes the given lists the only lists of the given entries */
    function setShoppingListsOnServer(entryIds: number[], shoppingLists: ShoppingList[]) {
        return new ApiApi().apiShoppingListEntryBulkCreate({
            shoppingListEntryBulk: shoppingLists.length > 0
                ? {ids: entryIds, shoppingListsSet: shoppingLists.map(sl => sl.id!)}
                : {ids: entryIds, shoppingListsRemoveAll: true}
        })
    }

    /** put each entry back on the lists it was on, one bulk call per distinct set of lists */
    function revertShoppingListsSet(previous: { entry: ShoppingListEntry, lists: ShoppingList[] }[]) {
        const groups = new Map<string, { ids: number[], lists: ShoppingList[] }>()
        previous.forEach(({entry, lists}) => {
            entry.shoppingLists = lists
            const key = lists.map(l => l.id).sort().join(',')
            const group = groups.get(key) ?? {ids: [], lists}
            group.ids.push(entry.id!)
            groups.set(key, group)
        })
        updateEntriesStructure()
        groups.forEach(group => {
            setShoppingListsOnServer(group.ids, group.lists).catch(err => {
                useMessageStore().addError(ErrorMessageType.UPDATE_ERROR, err)
            })
        })
    }

    /**
     * load a list of supermarkets
     */
    function loadShoppingLists() {
        let api = new ApiApi()

        api.apiShoppingListList().then(r => {
            shoppingLists.value = r.results
            // TODO recursive load
        }).catch(err => {
            useMessageStore().addError(ErrorMessageType.FETCH_ERROR, err)
        })
    }

    return {
        UNDEFINED_CATEGORY,
        entries: globalEntriesMap,
        supermarkets,
        supermarketCategories,
        updateEntriesStructure,
        entriesByGroup,
        autoSyncTimeoutId,
        autoSyncHasFocus,
        autoSyncLastTimestamp,
        currentlyUpdating,
        initialized,
        getFlatEntries,
        hasFailedItems,
        itemCheckSyncQueue,
        undoStack,
        canUndo,
        registerNote,
        undoUntil,
        totalFoods,
        shoppingLists,
        selectedMealPlan,
        refreshFromAPI,
        autoSync,
        createObject,
        deleteObject,
        updateObject,
        undoChange,
        setEntriesCheckedState,
        setFoodIgnoredState,
        delayEntries: setEntriesDelayedState,
        getAssociatedRecipes,
        getEntriesStructure,
        entriesByGroupMealPlan,
        updateCategories,
        updateEntryShoppingLists,
        addEntriesToShoppingLists,
        scaleEntries,
        loadShoppingLists,
    }
})

// enable hot reload for store
if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useShoppingStore, import.meta.hot))
}