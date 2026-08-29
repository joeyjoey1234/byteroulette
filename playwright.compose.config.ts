import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  timeout: 60_000,
  testDir: './e2e',
  outputDir: 'test-results-compose',
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:8080', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium-compose',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath: '/usr/bin/chromium' } },
    },
  ],
});
