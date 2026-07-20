import { defineConfig, devices } from '@playwright/test'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'

// Грузим .env.test (тест-аккаунты, в .gitignore) в process.env — Playwright
// сам .env не читает. Простой парсер KEY=VALUE, существующий env не перетираем.
const envTestPath = fileURLToPath(new URL('./.env.test', import.meta.url))
if (existsSync(envTestPath)) {
  for (const line of readFileSync(envTestPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}

// Логин-проекты подключаются ТОЛЬКО когда есть креды — иначе гостевой прогон
// (smoke + guest) остаётся зелёным без .env.test.
const hasCreds = !!(process.env.E2E_EMAIL && process.env.E2E_PASSWORD)
const IGNORE_AUTH = [/auth\.setup\.js/, /user\.spec\.js/]
const mobileChromium = { ...devices['iPhone 13'], browserName: 'chromium' }

// E2E-каркас (этап 5.5, план в TESTING.md). Приложение mobile-first.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 1,
  // html — артефакт CI (загружается в e2e.yml); list — читаемый лог прогона
  reporter: [['html', { open: 'never' }], ['list']],
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
    // Гостевые (smoke + guest): без логина; auth-спеки игнорируются
    { name: 'mobile',  use: mobileChromium, testIgnore: IGNORE_AUTH },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } }, testIgnore: IGNORE_AUTH },
    // Под логином — только при наличии .env.test с кредами (этап D)
    ...(hasCreds ? [
      { name: 'setup', testMatch: /auth\.setup\.js/ },
      {
        name: 'mobile-auth',
        testMatch: /user\.spec\.js/,
        dependencies: ['setup'],
        use: { ...mobileChromium, storageState: 'test-results/.auth/user.json' },
      },
    ] : []),
  ],
})
