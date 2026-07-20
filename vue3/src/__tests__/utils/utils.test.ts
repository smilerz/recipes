import { describe, it, expect } from 'vitest'
import {
    getNestedProperty,
    toNumberArray,
    stringToBool,
    boolOrUndefinedTransformer,
    numberOrUndefinedTransformer,
    buildSubtitleParts,
} from '@/utils/utils'

const t = (k: string) => k

describe('buildSubtitleParts', () => {
    const recipesCol = {key: 'numrecipe', title: 'Recipes', filterLink: {route: 'SearchPage', param: 'foods'}}
    const plainCol = {key: 'plural', title: 'Plural'}

    it('emits a link part for a positive numeric value with a filterLink', () => {
        const parts = buildSubtitleParts({id: 42, numrecipe: 5}, [recipesCol], t)
        expect(parts).toEqual([
            {text: 'Recipes: 5', to: {name: 'SearchPage', query: {foods: 42}}},
        ])
    })

    it('emits plain text (no link) when the value is 0', () => {
        // 0 still shows as text (preserves current subtitle content) but is not a link
        const parts = buildSubtitleParts({id: 42, numrecipe: 0}, [recipesCol], t)
        expect(parts).toEqual([{text: 'Recipes: 0'}])
    })

    it('emits no part when a filterLink is set but the value is null', () => {
        const parts = buildSubtitleParts({id: 42, numrecipe: null}, [recipesCol], t)
        expect(parts).toEqual([])
    })

    it('emits plain text for a column without a filterLink', () => {
        const parts = buildSubtitleParts({id: 42, plural: 'apples'}, [plainCol], t)
        expect(parts).toEqual([{text: 'apples'}])
    })

    it('mixes link and text parts across columns', () => {
        const parts = buildSubtitleParts({id: 7, numrecipe: 3, plural: 'apples'}, [recipesCol, plainCol], t)
        expect(parts).toEqual([
            {text: 'Recipes: 3', to: {name: 'SearchPage', query: {foods: 7}}},
            {text: 'apples'},
        ])
    })
})

describe('getNestedProperty', () => {
    it('returns top-level property', () => {
        expect(getNestedProperty({ a: 1 }, 'a')).toBe(1)
    })

    it('returns nested property via dot notation', () => {
        expect(getNestedProperty({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42)
    })

    it('returns undefined for missing path', () => {
        expect(getNestedProperty({ a: 1 }, 'b')).toBeUndefined()
    })

    it('returns undefined for deep missing path', () => {
        expect(getNestedProperty({ a: { b: 1 } }, 'a.c.d')).toBeUndefined()
    })

    it('returns undefined when traversing through a primitive', () => {
        expect(getNestedProperty({ a: 'string' }, 'a.b')).toBeUndefined()
    })

    it('handles null object', () => {
        expect(getNestedProperty(null, 'a')).toBeUndefined()
    })
})

describe('toNumberArray', () => {
    it('converts a single string to a number array', () => {
        expect(toNumberArray('5')).toEqual([5])
    })

    it('converts an array of strings to numbers', () => {
        expect(toNumberArray(['1', '2', '3'])).toEqual([1, 2, 3])
    })

    it('handles NaN for non-numeric strings', () => {
        expect(toNumberArray('abc')).toEqual([NaN])
    })
})

describe('stringToBool', () => {
    it('converts "true" to true', () => {
        expect(stringToBool('true')).toBe(true)
    })

    it('converts "false" to false', () => {
        expect(stringToBool('false')).toBe(false)
    })

    it('returns undefined for other strings', () => {
        expect(stringToBool('yes')).toBeUndefined()
        expect(stringToBool('')).toBeUndefined()
    })
})

describe('boolOrUndefinedTransformer', () => {
    describe('get', () => {
        it('converts "true" string to true', () => {
            expect(boolOrUndefinedTransformer.get('true')).toBe(true)
        })

        it('converts "false" string to false', () => {
            expect(boolOrUndefinedTransformer.get('false')).toBe(false)
        })

        it('returns undefined for null', () => {
            expect(boolOrUndefinedTransformer.get(null)).toBeUndefined()
        })

        it('returns undefined for undefined', () => {
            expect(boolOrUndefinedTransformer.get(undefined)).toBeUndefined()
        })
    })

    describe('set', () => {
        it('converts true to "true"', () => {
            expect(boolOrUndefinedTransformer.set(true)).toBe('true')
        })

        it('converts false to "false"', () => {
            expect(boolOrUndefinedTransformer.set(false)).toBe('false')
        })

        it('returns undefined for null', () => {
            expect(boolOrUndefinedTransformer.set(null)).toBeUndefined()
        })
    })
})

describe('numberOrUndefinedTransformer', () => {
    describe('get', () => {
        it('converts numeric string to number', () => {
            expect(numberOrUndefinedTransformer.get('42')).toBe(42)
        })

        it('converts decimal string to number', () => {
            expect(numberOrUndefinedTransformer.get('3.14')).toBe(3.14)
        })

        it('returns undefined for null', () => {
            expect(numberOrUndefinedTransformer.get(null)).toBeUndefined()
        })
    })

    describe('set', () => {
        it('converts value to string', () => {
            expect(numberOrUndefinedTransformer.set('42')).toBe('42')
        })

        it('returns undefined for null', () => {
            expect(numberOrUndefinedTransformer.set(null)).toBeUndefined()
        })
    })
})
