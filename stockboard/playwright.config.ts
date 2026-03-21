import { defineConfig, devices } from '@playwright/test'

// Default to the stockboard dev server port we used while developing.
// You can override via: E2E_BASE_URL=http://localhost:<port>
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5174'

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: {
    timeout: 8_000,
  },
  retries: 0,
  use: {
    baseURL,
    headless: true,
    actionTimeout: 12_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: [
    ['html', { open: 'never' }],
    [
      'json',
      {
        outputFile: process.env.PW_JSON_OUTPUT_FILE || 'test-results/results.json',
      },
    ],
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})

