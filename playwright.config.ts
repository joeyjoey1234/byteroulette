import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results',
  reporter: [['html', { open: 'never' }], ['list']],
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'pnpm --filter @byteroulette/web dev',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: true,
    },
    {
      command:
        'SIGNAL_ALLOWED_ORIGINS=http://127.0.0.1:5173 SIGNAL_HOST=127.0.0.1 SIGNAL_PORT=3001 pnpm --filter @byteroulette/signaling dev',
      url: 'http://127.0.0.1:3001/health/live',
      reuseExistingServer: true,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath: '/usr/bin/chromium' } },
    },
  ],
});
