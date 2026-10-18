// @vitest-environment node
import {describe, it, expect} from 'vitest'
import {readdirSync, readFileSync} from 'node:fs'
import {join, relative, resolve} from 'node:path'
import en from '@/locales/en.json'

// A $t('Key') / t('Key') call whose key has no entry in en.json makes vue-i18n log "Not found 'Key' key" and show the raw key instead of
// text. This scans every literal call in the app (keys built at runtime, such as t(categoryLabel(cat)), cannot be checked this way).
const SRC = resolve(__dirname, '../..')
const SKIPPED_DIRS = new Set(['__tests__', 'openapi', 'locales', 'node_modules'])
const T_CALL = /(?<![\w.])(?:\$t|t)\(\s*['"]([^'"]+)['"]/g

function sourceFiles(dir: string): string[] {
    return readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : sourceFiles(path)
        return /\.(vue|ts)$/.test(entry.name) ? [path] : []
    })
}

describe('English locale', () => {
    it('has an entry for every literal translation key used in the app', () => {
        const keys = en as Record<string, unknown>
        const missing: string[] = []
        for (const file of sourceFiles(SRC)) {
            readFileSync(file, 'utf-8').split('\n').forEach((line, i) => {
                for (const match of line.matchAll(T_CALL)) {
                    if (!match[1].includes(' ') && !(match[1] in keys)) missing.push(`${match[1]}  (${relative(SRC, file)}:${i + 1})`)
                }
            })
        }
        expect(missing, `keys used but missing from en.json:\n${missing.join('\n')}`).toEqual([])
    })
})
