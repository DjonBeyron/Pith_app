import { defineConfig, devices } from '@playwright/test'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { isLocalBackend } from './e2e/helpers/backend.js'

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
// Админ-проекты (admin + rls) — только против локального стека Supabase
// (scripts/e2e-local.sh): они пишут в базу с правами is_admin. На боевой
// базе их нет вовсе, даже если админ-креды случайно заданы.
const hasAdmin = hasCreds && !!(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD) && isLocalBackend()
const IGNORE_AUTH = [/auth\.setup\.js/, /user\.spec\.js/, /admin\.spec\.js/, /rls\.spec\.js/]
const mobileChromium = { ...devices['iPhone 13'], browserName: 'chromium' }
const PORT = isLocalBackend() ? 5299 : 5199

// E2E-каркас (этап 5.5, план в TESTING.md). Приложение mobile-first.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 1,
  // html — артефакт CI (загружается в e2e.yml); list — читаемый лог прогона
  reporter: [['html', { open: 'never' }], ['list']],
  // Локальный стек — свой порт и ВСЕГДА свой dev-сервер: иначе Playwright
  // подхватил бы уже запущенный `npm run dev` на 5199, смотрящий в боевую
  // базу, и админ-тесты ушли бы в прод при «локальном» VITE_SUPABASE_URL
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !isLocalBackend(),
    timeout: 60_000,
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Свой Chromium вместо скачанного Playwright'ом — облачный контейнер
    // Claude, где браузер предустановлен, а скачивание закрыто (см.
    // scripts/e2e-local.sh). Без переменной — обычный браузер Playwright.
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
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
    ...(hasAdmin ? [
      {
        name: 'admin',
        testMatch: /admin\.spec\.js/,
        dependencies: ['setup'],
        use: { viewport: { width: 1280, height: 800 }, storageState: 'test-results/.auth/admin.json' },
      },
      // Права в БД (RLS) — прямые REST-запросы, браузер не нужен
      { name: 'rls', testMatch: /rls\.spec\.js/ },
    ] : []),
  ],
})
