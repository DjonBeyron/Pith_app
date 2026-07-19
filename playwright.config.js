import { defineConfig, devices } from '@playwright/test'

// E2E-каркас (этап 5.5, план в TESTING.md). Приложение mobile-first, поэтому
// основной проект — iPhone; desktop — второй прогон той же логики.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 1,
  webServer: {
    command: 'npm run dev -- --port 5199',
    port: 5199,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  use: {
    baseURL: 'http://localhost:5199',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // iPhone-вьюпорт/тач/мобильный UA, но движок Chromium — план и CI (этап F)
    // ставят только chromium; это обычная мобильная эмуляция, webkit не нужен.
    { name: 'mobile',  use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
  ],
})
