import { defineConfig, devices } from '@playwright/test';

const use = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } };

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  outputDir: 'test-results/artifacts',
  reporter: [['list']],
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  projects: [
    { name: 'light', use: { ...use, colorScheme: 'light' } },
    { name: 'dark', use: { ...use, colorScheme: 'dark' } },
  ],
});
