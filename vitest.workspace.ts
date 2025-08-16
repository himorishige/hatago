import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'packages/core/vitest.config.ts',
  'packages/adapter-node/vitest.config.ts',
  'packages/adapter-workers/vitest.config.ts',
])
