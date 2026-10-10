/**
 * The hidden switch for the ModelAutocomplete in-context trial (requirements §9b, D6):
 * `?ms=new` selects the prototype and remembers it, `?ms=old` goes back and forgets it, and with neither
 * everyone gets the current ModelSelect.
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('@/components/inputs/ModelSelect.vue', () => ({default: {name: 'ModelSelect'}}))
vi.mock('@/components/inputs/ModelAutocomplete.vue', () => ({default: {name: 'ModelAutocomplete'}}))

import {useModelSelectPrototype, useModelSelectPrototypeOn} from '@/composables/useModelSelectPrototype'

function visit(search: string) {
    window.history.replaceState({}, '', `/${search}`)
}

beforeEach(() => {
    localStorage.clear()
    visit('')
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useModelSelectPrototype', () => {
    it('gives everyone the current ModelSelect by default', () => {
        expect((useModelSelectPrototype() as any).name).toBe('ModelSelect')
    })

    it('?ms=new selects the prototype', () => {
        visit('?ms=new')
        expect((useModelSelectPrototype() as any).name).toBe('ModelAutocomplete')
    })

    it('?ms=new is remembered for later pages that carry no parameter', () => {
        visit('?ms=new')
        useModelSelectPrototype()
        visit('')
        expect((useModelSelectPrototype() as any).name).toBe('ModelAutocomplete')
    })

    it('?ms=old goes back to ModelSelect and forgets the choice', () => {
        visit('?ms=new')
        useModelSelectPrototype()
        visit('?ms=old')
        expect((useModelSelectPrototype() as any).name).toBe('ModelSelect')
        visit('')
        expect((useModelSelectPrototype() as any).name).toBe('ModelSelect')
    })

    it('any other value of ms changes nothing', () => {
        visit('?ms=new')
        useModelSelectPrototype()
        visit('?ms=banana')
        expect((useModelSelectPrototype() as any).name).toBe('ModelAutocomplete')
    })

    it('still honours ?ms=new when browser storage is unavailable', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
        visit('?ms=new')
        expect((useModelSelectPrototype() as any).name).toBe('ModelAutocomplete')
        visit('')
        expect((useModelSelectPrototype() as any).name).toBe('ModelSelect')
    })

    it('useModelSelectPrototypeOn: false by default, true after ?ms=new, remembered, false again after ?ms=old', () => {
        expect(useModelSelectPrototypeOn()).toBe(false)
        visit('?ms=new')
        expect(useModelSelectPrototypeOn()).toBe(true)
        visit('')
        expect(useModelSelectPrototypeOn()).toBe(true)
        visit('?ms=old')
        expect(useModelSelectPrototypeOn()).toBe(false)
    })

    it('the component and the flag always agree', () => {
        visit('?ms=new')
        expect((useModelSelectPrototype() as any).name === 'ModelAutocomplete').toBe(useModelSelectPrototypeOn())
        visit('?ms=old')
        expect((useModelSelectPrototype() as any).name === 'ModelAutocomplete').toBe(useModelSelectPrototypeOn())
    })
})
