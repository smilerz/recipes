import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createVuetify } from 'vuetify'

const { listMock, createMock, destroyMock, addMessageMock, addErrorMock } = vi.hoisted(() => ({
    listMock: vi.fn(),
    createMock: vi.fn(),
    destroyMock: vi.fn(),
    addMessageMock: vi.fn(),
    addErrorMock: vi.fn(),
}))
vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/openapi')>()),
    ApiApi: class {
        apiRecipeBookEntryList = listMock
        apiRecipeBookEntryCreate = createMock
        apiRecipeBookEntryDestroy = destroyMock
    },
}))
vi.mock('@/stores/MessageStore', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/stores/MessageStore')>()),
    useMessageStore: () => ({ addMessage: addMessageMock, addError: addErrorMock, addPreparedMessage: vi.fn() }),
}))

import EditRecipeBooksDialog from '@/components/dialogs/EditRecipeBooksDialog.vue'

const entry = (id: number, book: number, name: string) => ({ id, book, recipe: 7, bookContent: { id: book, name } })

function mountDialog() {
    setActivePinia(createPinia())
    const i18n = createI18n({
        legacy: false, locale: 'en',
        messages: { en: { Edit_Books: 'Edit Books', Removed: 'Removed', Undo: 'Undo', Close: 'Close', Add: 'Add' } },
        missingWarn: false, fallbackWarn: false,
    })
    return mount(EditRecipeBooksDialog, {
        props: { recipe: { id: 7, name: 'Soup' } as any, modelValue: true },
        global: {
            plugins: [createPinia(), i18n, createVuetify()],
            stubs: {
                VDialog: { template: '<div class="stub-dialog"><slot/></div>' },
                VClosableCardTitle: { template: '<div class="stub-title"/>' },
                ModelSelect: {
                    name: 'ModelSelect', props: ['modelValue', 'model'], emits: ['update:modelValue'],
                    template: '<div><button class="stub-select" @click="$emit(\'update:modelValue\', {id: 3, name: \'Dinners\'})"/><slot name="append"/></div>',
                },
            },
        },
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    listMock.mockResolvedValue({ results: [entry(1, 10, 'Favourites'), entry(2, 11, 'Weeknight')] })
})

describe('EditRecipeBooksDialog', () => {
    it('lists the books the recipe is already in', async () => {
        const w = mountDialog()
        await flushPromises()
        expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ recipe: 7 }))
        expect(w.text()).toContain('Favourites')
        expect(w.text()).toContain('Weeknight')
    })

    it('adds the recipe to the picked book and shows the book in the list', async () => {
        createMock.mockResolvedValue(entry(3, 3, 'Dinners'))
        const w = mountDialog()
        await flushPromises()
        await w.find('.stub-select').trigger('click')
        await w.find('[data-testid="add-book"]').trigger('click')
        await flushPromises()
        expect(createMock).toHaveBeenCalledWith({ recipeBookEntry: { book: 3, recipe: 7 } })
        expect(w.text()).toContain('Dinners')
    })

    it('does not add the recipe to a book it is already in', async () => {
        const w = mountDialog()
        await flushPromises()
        w.findComponent({ name: 'ModelSelect' }).vm.$emit('update:modelValue', { id: 10, name: 'Favourites' })
        await flushPromises()
        await w.find('[data-testid="add-book"]').trigger('click')
        await flushPromises()
        expect(createMock).not.toHaveBeenCalled()
        expect(addMessageMock).toHaveBeenCalled()
    })

    it('removes the recipe from a book and offers to undo it', async () => {
        destroyMock.mockResolvedValue(undefined)
        const w = mountDialog()
        await flushPromises()
        await w.findAll('[data-testid="remove-book"]')[0].trigger('click')
        await flushPromises()
        expect(destroyMock).toHaveBeenCalledWith({ id: 1 })
        expect(w.text()).not.toContain('Favourites')
        expect(w.text()).toContain('Weeknight')
        const undo = addMessageMock.mock.calls[0][4]
        expect(undo.label).toBe('Undo')
    })

    it('puts the book back where it was when the removal is undone', async () => {
        destroyMock.mockResolvedValue(undefined)
        createMock.mockResolvedValue(entry(9, 10, 'Favourites'))
        const w = mountDialog()
        await flushPromises()
        await w.findAll('[data-testid="remove-book"]')[0].trigger('click')
        await flushPromises()
        addMessageMock.mock.calls[0][4].callback()
        await flushPromises()
        expect(createMock).toHaveBeenCalledWith({ recipeBookEntry: { book: 10, recipe: 7 } })
        const names = w.findAll('[data-testid="book-name"]').map(n => n.text())
        expect(names).toEqual(['Favourites', 'Weeknight'])
    })

    it('removes a book once when its delete button is pressed twice', async () => {
        destroyMock.mockResolvedValue(undefined)
        const w = mountDialog()
        await flushPromises()
        const button = w.findAll('[data-testid="remove-book"]')[0]
        button.trigger('click')
        button.trigger('click')
        await flushPromises()
        expect(destroyMock).toHaveBeenCalledTimes(1)
        expect(w.findAll('[data-testid="book-name"]').map(n => n.text())).toEqual(['Weeknight'])
    })

    it('removes the right book when another one was removed in the meantime', async () => {
        let finishFirst: () => void = () => {}
        destroyMock.mockImplementationOnce(() => new Promise<void>(resolve => { finishFirst = resolve }))
        destroyMock.mockResolvedValueOnce(undefined)
        const w = mountDialog()
        await flushPromises()
        const [first, second] = w.findAll('[data-testid="remove-book"]')
        first.trigger('click')
        second.trigger('click')
        await flushPromises()
        finishFirst()
        await flushPromises()
        expect(w.findAll('[data-testid="book-name"]')).toHaveLength(0)
    })

    it('undoes a removal for the recipe it was removed from', async () => {
        destroyMock.mockResolvedValue(undefined)
        createMock.mockResolvedValue(entry(9, 10, 'Favourites'))
        const w = mountDialog()
        await flushPromises()
        await w.findAll('[data-testid="remove-book"]')[0].trigger('click')
        await flushPromises()
        await w.setProps({ recipe: { id: 8, name: 'Stew' } as any })
        await flushPromises()
        addMessageMock.mock.calls[0][4].callback()
        await flushPromises()
        expect(createMock).toHaveBeenCalledWith({ recipeBookEntry: { book: 10, recipe: 7 } })
    })

    it('shows the books of the new recipe when the recipe changes while it is open', async () => {
        const w = mountDialog()
        await flushPromises()
        listMock.mockResolvedValue({ results: [{ id: 5, book: 12, recipe: 8, bookContent: { id: 12, name: 'Stew book' } }] })
        await w.setProps({ recipe: { id: 8, name: 'Stew' } as any })
        await flushPromises()
        expect(listMock).toHaveBeenLastCalledWith(expect.objectContaining({ recipe: 8 }))
        expect(w.findAll('[data-testid="book-name"]').map(n => n.text())).toEqual(['Stew book'])
    })

    it('gives the icon buttons an accessible name', async () => {
        const w = mountDialog()
        await flushPromises()
        expect(w.find('[data-testid="add-book"]').attributes('aria-label')).toBeTruthy()
        w.findAll('[data-testid="remove-book"]').forEach(b => expect(b.attributes('aria-label')).toBeTruthy())
    })

    it('reports an error and keeps the book when the removal fails', async () => {
        destroyMock.mockRejectedValue(new Error('nope'))
        const w = mountDialog()
        await flushPromises()
        await w.findAll('[data-testid="remove-book"]')[0].trigger('click')
        await flushPromises()
        expect(addErrorMock).toHaveBeenCalled()
        expect(w.text()).toContain('Favourites')
    })
})
