import { defineConfig } from 'vitest/config';
// Integration suites share the same PostgreSQL quotas; serialize files, not production workers.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    fsModuleCache: false,
  },
});
