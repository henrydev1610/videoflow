import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080',
    trace: 'retain-on-failure',
  },
  reporter: [
    ['list'],
    [
      'html',
      {
        outputFolder: '../../docs/verification/dashboard-playwright',
        open: 'never',
      },
    ],
  ],
  outputDir: '../../test-results/dashboard',
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev -- --host 127.0.0.1',
        url: 'http://localhost:8080',
        reuseExistingServer: true,
        timeout: 30000,
      },
});
