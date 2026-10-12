import {describe, it, expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {aliases as vuetifyFaAliases} from 'vuetify/iconsets/fa'
import en from '@/locales/en.json'
import {vuetifyOptions} from '@/vuetify'

// The calendar dialog showed the raw key "Calendar_URL" as its field label (no locale has it) and logged
// `Could not find aliased icon "$download"` for its Download button. Guard that it only references keys and icon aliases that resolve.
const source = readFileSync(resolve(__dirname, '../../../components/dialogs/MealPlanIcalDialog.vue'), 'utf-8')

describe('MealPlanIcalDialog', () => {
    it('references only existing en locale keys', () => {
        const keys = [...source.matchAll(/\$t\(['"]([^'"]+)['"]\)/g)].map(m => m[1])
        const missing = keys.filter(k => !(k in (en as Record<string, unknown>)))
        expect(keys.length).toBeGreaterThan(0)
        expect(missing, `missing en keys: ${missing.join(', ')}`).toEqual([])
    })

    it('uses only defined icon aliases', () => {
        const defined = new Set([...Object.keys(vuetifyFaAliases), ...Object.keys(vuetifyOptions.icons.aliases)])
        const used = [...source.matchAll(/icon[\w-]*="\$(\w+)"/g)].map(m => m[1])
        const undefinedAliases = used.filter(a => !defined.has(a))
        expect(used.length).toBeGreaterThan(0)
        expect(undefinedAliases, `undefined icon aliases: ${undefinedAliases.join(', ')}`).toEqual([])
    })
})
