import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 240000,
  expect: { timeout: 15000 },
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1440, height: 1100 },
    launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
  },
  webServer: [
    { command: 'npm run preview', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI },
  ],
});
