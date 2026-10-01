import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'apps/api/test/**/*.test.ts',
      'apps/mock-platform/test/**/*.test.ts',
      'apps/web/test/**/*.test.ts',
      'packages/contracts/test/**/*.test.ts',
    ],
    environment: 'node',
    globals: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // One file at a time: the integration tests share the Compose stack and the database
    // (goal-brief.md, "Run things one at a time").
    pool: 'forks',
    fileParallelism: false,
  },
})
