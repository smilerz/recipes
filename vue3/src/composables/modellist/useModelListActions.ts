import {computed, type ComputedRef, type Ref} from 'vue'
import {useRouter} from 'vue-router'
import type {ModelActionDef} from './types'
import type {Model, GenericModel} from '@/types/Models'
import {ErrorMessageType, PreparedMessage, useMessageStore} from '@/stores/MessageStore'

export function useModelListActions(
    model: ComputedRef<Model | undefined>,
    genericModel: Ref<GenericModel>,
    modelName: Ref<string> | ComputedRef<string>,
    onAction?: (key: string, item: any) => void,
    onToggleComplete?: (item: any, field: string) => void,
) {
    const router = useRouter()

    const actionDefs = computed<ModelActionDef[]>(() => model.value?.actionDefs ?? [])

    const groupedActionDefs = computed(() => {
        const map = new Map<string, ModelActionDef[]>()
        for (const def of actionDefs.value) {
            const group = def.group ?? ''
            if (!map.has(group)) map.set(group, [])
            map.get(group)!.push(def)
        }
        return map
    })

    function getToggleState(action: ModelActionDef, item: any): boolean {
        if (action.isActive) return action.isActive(item)
        return !!item[action.toggleField!]
    }

    async function executeAction(key: string, item: any) {
        const action = actionDefs.value.find(a => a.key === key)
        if (!action) return

        if (action.isToggle) {
            const field = action.toggleField!
            if (action.handler) {
                try {
                    await action.handler(item, genericModel.value)
                    onToggleComplete?.(item, field)
                    useMessageStore().addPreparedMessage(PreparedMessage.UPDATE_SUCCESS)
                } catch (e) {
                    useMessageStore().addError(ErrorMessageType.UPDATE_ERROR, e)
                }
            } else {
                const oldValue = item[field]
                item[field] = !oldValue
                onToggleComplete?.(item, field)
                try {
                    await genericModel.value.update(item.id, item)
                    useMessageStore().addPreparedMessage(PreparedMessage.UPDATE_SUCCESS)
                } catch (e) {
                    item[field] = oldValue
                    onToggleComplete?.(item, field)
                    useMessageStore().addError(ErrorMessageType.UPDATE_ERROR, e)
                }
            }
        } else if (action.routeName) {
            const params = action.routeParams?.(item, modelName.value) ?? {}
            const query = action.routeQuery?.(item)
            router.push({name: action.routeName, params, query})
        } else if (onAction) {
            onAction(key, item)
        }
    }

    return {
        actionDefs,
        groupedActionDefs,
        executeAction,
        getToggleState,
    }
}
