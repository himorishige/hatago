import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@hatago/adapter-workers',
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'tests/', '*.config.ts', 'dist/', '**/*.test.ts', '**/*.spec.ts'],
    },
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@/': new URL('./src/', import.meta.url).pathname,
    },
  },
})
