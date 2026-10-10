import ModelAutocomplete from '@/components/inputs/ModelAutocomplete.vue'
import ModelSelect from '@/components/inputs/ModelSelect.vue'

const STORAGE_KEY = 'modelSelectPrototype'

function remembered(): boolean {
    try {
        return localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
        return false
    }
}

function remember(on: boolean) {
    try {
        if (on) {
            localStorage.setItem(STORAGE_KEY, '1')
        } else {
            localStorage.removeItem(STORAGE_KEY)
        }
    } catch { /* storage blocked: the parameter still works for this page */ }
}

/**
 * Temporary switch for the ModelAutocomplete in-context trial. `?ms=new` turns the prototype on and remembers it,
 * `?ms=old` turns it off; without either, ModelSelect is used. Deleted together with the trial.
 */
export function useModelSelectPrototypeOn(): boolean {
    const flag = new URLSearchParams(window.location.search).get('ms')
    if (flag === 'new') remember(true)
    if (flag === 'old') remember(false)
    return flag === 'new' || (flag !== 'old' && remembered())
}

/** The picker to render, for call sites that can take a component through `<component :is>`. */
export function useModelSelectPrototype() {
    return useModelSelectPrototypeOn() ? ModelAutocomplete : ModelSelect
}
