// Shared setup for every test file. The DOM setup (the Vuetify instance, test-utils config and browser-API mocks)
// only makes sense under jsdom. A file that opts into the node environment with `// @vitest-environment node` skips it,
// and with it the cost of importing Vuetify and the test utilities.
if (typeof window !== 'undefined') {
    await import('./vitest.setup.dom')
}
