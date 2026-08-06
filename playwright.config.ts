import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';
import { STORAGE_STATE_PATH } from '@utils/constants';

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: isCI
    ? [
        ['line'],
        ['junit', { outputFile: 'artifacts/results.xml' }],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
        ['./utils/reporters/ibt-html.reporter.ts'],
      ]
    : [['line'], ['html', { open: 'never' }], ['./utils/reporters/ibt-html.reporter.ts']],
  outputDir: 'test-results',
  use: {
    baseURL: process.env.BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    acceptDownloads: true,
  },
  projects: [
    {
      name: 'setup',
      testMatch: '**/*.setup.ts',
    },
    {
      name: 'chromium',
      testMatch: '**/*.spec.ts',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE_PATH },
      dependencies: ['setup'],
    },
  ],
});
