import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { apiMock, resetApiMock } from '@/__tests__/api-mock'

vi.mock('@/openapi', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    ApiApi: class { constructor() { return apiMock } },
}))

import SpaceBackupSettings from '@/components/settings/SpaceBackupSettings.vue'

function mountSettings() {
    const pinia = createPinia()
    const i18n = createI18n({
        legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false,
        messages: { en: { RestoreComplete: 'Restored into new space "{name}"' } },
    })
    return mount(SpaceBackupSettings, {
        global: { plugins: [pinia, i18n] },
    })
}

const DONE_BACKUP = {
    id: 1, running: false, msg: '', totalItems: 12, processedItems: 12,
    file: 'https://example.test/media/backups/space-1-backup-1.json', fileSizeKb: 4,
    createdBy: 1, createdAt: '2026-08-13T00:00:00Z',
}

const RUNNING_BACKUP = {
    id: 2, running: true, msg: '', totalItems: 0, processedItems: 0,
    file: null, fileSizeKb: 0, createdBy: 1, createdAt: '2026-08-13T00:05:00Z',
}

describe('SpaceBackupSettings', () => {
    beforeEach(() => {
        resetApiMock()
        vi.useFakeTimers()
    })

    it('loads and displays past backups on mount', async () => {
        apiMock.apiSpaceBackupList.mockResolvedValue({ results: [DONE_BACKUP] })

        const wrapper = mountSettings()
        await flushPromises()

        expect(apiMock.apiSpaceBackupList).toHaveBeenCalled()
        expect(wrapper.findAll('[data-test="backup-row"]').length).toBe(1)
        expect(wrapper.find('[data-test="backup-download"]').exists()).toBe(true)
    })

    it('a still-running backup shows a running indicator and no download link', async () => {
        apiMock.apiSpaceBackupList.mockResolvedValue({ results: [RUNNING_BACKUP] })

        const wrapper = mountSettings()
        await flushPromises()

        expect(wrapper.find('[data-test="backup-running"]').exists()).toBe(true)
        expect(wrapper.find('[data-test="backup-download"]').exists()).toBe(false)
    })

    it('clicking Create Backup calls the API and reloads the list', async () => {
        apiMock.apiSpaceBackupList.mockResolvedValue({ results: [] })
        apiMock.apiSpaceBackupCreate.mockResolvedValue(RUNNING_BACKUP)

        const wrapper = mountSettings()
        await flushPromises()

        await wrapper.find('[data-test="create-backup-btn"]').trigger('click')
        await flushPromises()

        expect(apiMock.apiSpaceBackupCreate).toHaveBeenCalled()
        expect(apiMock.apiSpaceBackupList).toHaveBeenCalledTimes(2)
    })

    it('clicking Restore fetches the preview and shows model counts and the user re-link list', async () => {
        apiMock.apiSpaceBackupList.mockResolvedValue({ results: [DONE_BACKUP] })
        apiMock.apiSpaceBackupRestorePreviewCreate.mockResolvedValue({
            model_counts: { Food: 12, Keyword: 3 },
            users: [
                { username: 'alice', email: 'alice@example.com', resolved: true },
                { username: 'ghost-user', email: 'ghost@example.com', resolved: false },
            ],
        })

        const wrapper = mountSettings()
        await flushPromises()
        await wrapper.find('[data-test="backup-restore-btn"]').trigger('click')
        await flushPromises()

        expect(apiMock.apiSpaceBackupRestorePreviewCreate).toHaveBeenCalledWith({ id: 1 })
        const text = wrapper.text()
        expect(text).toContain('alice')
        expect(text).toContain('ghost-user')
    })

    it('the Confirm Restore button stays disabled until the acknowledgment checkbox is checked', async () => {
        apiMock.apiSpaceBackupList.mockResolvedValue({ results: [DONE_BACKUP] })
        apiMock.apiSpaceBackupRestorePreviewCreate.mockResolvedValue({
            model_counts: { Food: 1 },
            users: [{ username: 'alice', email: 'alice@example.com', resolved: true }],
        })

        const wrapper = mountSettings()
        await flushPromises()
        await wrapper.find('[data-test="backup-restore-btn"]').trigger('click')
        await flushPromises()

        expect(wrapper.find('[data-test="restore-confirm-btn"]').attributes('disabled')).toBeDefined()

        await wrapper.find('[data-test="restore-ack-checkbox"] input').setValue(true)
        await flushPromises()

        expect(wrapper.find('[data-test="restore-confirm-btn"]').attributes('disabled')).toBeUndefined()
    })

    it('confirming restore calls the restore action and shows the result', async () => {
        apiMock.apiSpaceBackupList.mockResolvedValue({ results: [DONE_BACKUP] })
        apiMock.apiSpaceBackupRestorePreviewCreate.mockResolvedValue({
            model_counts: { Food: 1 },
            users: [],
        })
        apiMock.apiSpaceBackupRestoreCreate.mockResolvedValue({
            space_id: 42, space_name: 'Restored: Test Space',
            report: { models: { Food: { created: 1, skipped: 0 } }, unresolved_users: [] },
        })

        const wrapper = mountSettings()
        await flushPromises()
        await wrapper.find('[data-test="backup-restore-btn"]').trigger('click')
        await flushPromises()
        await wrapper.find('[data-test="restore-ack-checkbox"] input').setValue(true)
        await wrapper.find('[data-test="restore-confirm-btn"]').trigger('click')
        await flushPromises()

        expect(apiMock.apiSpaceBackupRestoreCreate).toHaveBeenCalledWith({ id: 1 })
        expect(wrapper.find('[data-test="restore-result"]').text()).toContain('Restored: Test Space')
    })
})
