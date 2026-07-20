/**
 * Guards the Bootswatch-derived themes: every theme the CosmeticSettings selector
 * exposes must define ALL colour tokens the base "light" theme has — otherwise the
 * app's custom tokens (tandoor nav, save/create/edit/delete/cancel, …) fall back to
 * undefined and buttons/nav lose their colour under that theme. Also guards that the
 * store's THEME_MAP-able set (the enum values the selector offers) each have a theme.
 */
import {describe, it, expect} from 'vitest'
import {vuetifyOptions} from '@/vuetify'
import {THEME_MAP} from '@/stores/UserPreferenceStore'

const themes: Record<string, {colors: Record<string, string>}> = vuetifyOptions.theme.themes as any
// The base theme defines the canonical token set every theme must cover.
const requiredTokens = Object.keys(themes.light.colors)

// Vuetify theme names introduced for the Bootswatch palettes.
const NEW_THEMES = ['cerulean', 'flat', 'midnight', 'slate']

describe('vuetify themes', () => {
    for (const name of NEW_THEMES) {
        it(`${name} defines every colour token the base theme has`, () => {
            expect(themes[name], `theme "${name}" is missing`).toBeDefined()
            const missing = requiredTokens.filter(t => !(t in themes[name].colors))
            expect(missing, `${name} missing tokens`).toEqual([])
        })
    }

    it('every theme THEME_MAP offers maps to a defined Vuetify theme', () => {
        for (const vName of Object.values(THEME_MAP)) {
            expect(themes[vName], `THEME_MAP maps to undefined theme "${vName}"`).toBeDefined()
        }
    })

    it('dark palettes are flagged dark for correct on-* contrast', () => {
        expect((themes.midnight as any).dark).toBe(true)
        expect((themes.slate as any).dark).toBe(true)
        expect((themes.cerulean as any).dark).toBe(false)
        expect((themes.flat as any).dark).toBe(false)
    })
})
