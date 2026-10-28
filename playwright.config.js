import { defineConfig, devices } from '@playwright/test'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { isLocalBackend } from './e2e/helpers/backend.js'
import { NEWBIE_HOST, NEWBIE_PORT } from './e2e/helpers/newbieBackend.js'

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
// Живые сценарии нового пользователя (проект newbie-live) идут только на своём сервере с боевыми ключами и тестовыми аккаунтами
const LIVE_SPEC = /newbie-live-.*\.spec\.js/
const IGNORE_AUTH = [/auth\.setup\.js/, /user\.spec\.js/, /admin.*\.spec\.js/, /rls\.spec\.js/, LIVE_SPEC]
const mobileChromium = { ...devices['iPhone 13'], browserName: 'chromium' }
const PORT = isLocalBackend() ? 5299 : 5199
// Стенд «медиа в чате» (e2e/chat-media.spec.js): свой dev-сервер с МЁРТВЫМ Supabase (бэкенд не нужен и не должен быть
// достижим — плеер монтируется напрямую с синтетическим уроком) и Chromium с разрешённым автоплеем (видео/голосовые без жеста)
const BENCH_PORT = 5398
const BENCH_SPECS = /((chat|feed)-media|review-perf)\.spec\.js/
const benchChromium = {
  ...mobileChromium,
  baseURL: `http://localhost:${BENCH_PORT}`,
  launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'], ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}) },
}

// Стенд «новый пользователь» (e2e/newbie-first-session.spec.js): свой dev-сервер с недостижимым Supabase (адрес NEWBIE_HOST),
// ответы бэкенда — из e2e/helpers/newbieBackend.js (перехват сети в самом тесте). Ни базы, ни Docker, ни .env не нужно;
// автоплей разрешён — видео ленты играют без жеста (как на стендах медиа).
// Видео и трасса — ВСЕГДА (не только при падении): это доказательства для отчёта покрытия (e2e/newbie-coverage-*.spec.js,
// scripts/newbie-coverage-report.mjs): владелец смотрит, что именно увидел симулированный человек. Массовый прогон
// (newbie-crowd.spec.js) переопределяет их на «только при падении» — иначе 50 видео.
// newbie-live-*.spec.js — отдельный проект newbie-live (настоящая база), сюда не входят
const NEWBIE_SPEC = /newbie-(?!live-).*\.spec\.js/
const newbieChromium = {
  ...mobileChromium,
  video: 'on',
  trace: { mode: 'on', snapshots: false, screenshots: false, sources: false }, // без снимков DOM и кадров: с ними трасса 10–85 МБ на тест (dev-сервер Vite, долгие сценарии), весь прогон ≈ 1 ГБ — не влезет в артефакт; остаются шаги, консоль и сеть, а картинку даёт видео
  baseURL: `http://localhost:${NEWBIE_PORT}`,
  launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'], ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}) },
}

// Живые сценарии нового пользователя (e2e/newbie-live-*.spec.js, workflow newbie-live.yml): свой dev-сервер с БОЕВЫМИ ключами
// (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY из env — как у гостевого job) и тестовые аккаунты владельца (E2E_USER_EMAILS /
// E2E_USER_PASSWORD). Без E2E_USER_EMAILS сервер не поднимается, а спеки пропускаются с причиной (helpers/liveAccounts.js).
// Капча на стенде выключена (пустой ключ перекрывает .env.local): если в Supabase она включена, вход честно скажет об этом.
// iPhone 12 mini: 375×812 CSS px (минимальный экран, CLAUDE.md); видео и трасса — всегда (доказательство прохода)
const LIVE_PORT = 5499
const hasLive = !!process.env.E2E_USER_EMAILS
const liveChromium = {
  ...devices['iPhone 12 Mini'],
  browserName: 'chromium',
  viewport: { width: 375, height: 812 },
  baseURL: `http://localhost:${LIVE_PORT}`,
  video: 'on',
  trace: 'on',
  launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'], ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}) },
}

// E2E-каркас (этап 5.5, план в TESTING.md). Приложение mobile-first.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 1,
  // html — артефакт CI (загружается в e2e.yml); list — читаемый лог прогона
  // json — для scripts/newbie-coverage-report.mjs (отчёт покрытия плана новичка читает test-results/results.json)
  reporter: [['html', { open: 'never' }], ['list'], ['json', { outputFile: 'test-results/results.json' }]],
  // Локальный стек — свой порт и ВСЕГДА свой dev-сервер: иначе Playwright
  // подхватил бы уже запущенный `npm run dev` на 5199, смотрящий в боевую
  // базу, и админ-тесты ушли бы в прод при «локальном» VITE_SUPABASE_URL
  webServer: [
    {
      command: `npm run dev -- --port ${PORT} --strictPort`,
      port: PORT,
      reuseExistingServer: !isLocalBackend(),
      timeout: 60_000,
    },
    // Стенд медиа: env перекрывает .env — Supabase недостижим по плану
    {
      command: `npm run dev -- --port ${BENCH_PORT} --strictPort`,
      port: BENCH_PORT,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'bench', PITHY_BENCH_STUBS: '1' },
    },
    // Стенд «новый пользователь»: Supabase по адресу-пустышке, капча выключена (пустой ключ перекрывает .env.local)
    {
      command: `npm run dev -- --port ${NEWBIE_PORT} --strictPort`,
      port: NEWBIE_PORT,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_SUPABASE_URL: `https://${NEWBIE_HOST}`, VITE_SUPABASE_ANON_KEY: 'newbie', VITE_TURNSTILE_SITE_KEY: '' },
    },
    // Живой стенд «новый пользователь»: боевая база (env как есть), только при наличии тестовых аккаунтов
    ...(hasLive ? [{
      command: `npm run dev -- --port ${LIVE_PORT} --strictPort`,
      port: LIVE_PORT,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_TURNSTILE_SITE_KEY: process.env.E2E_LIVE_TURNSTILE_SITE_KEY ?? '' },
    }] : []),
  ],
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
    { name: 'mobile',  use: mobileChromium, testIgnore: [...IGNORE_AUTH, BENCH_SPECS, NEWBIE_SPEC] },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } }, testIgnore: [...IGNORE_AUTH, BENCH_SPECS, NEWBIE_SPEC] },
    // Стенды — на своём сервере (BENCH_PORT), без бэкенда: «медиа в чате» и «лента рекомендаций»
    { name: 'chat-media', testMatch: /chat-media\.spec\.js/, use: benchChromium },
    { name: 'feed-media', testMatch: /feed-media\.spec\.js/, use: benchChromium },
    // Стенд «Разбор урока» (десктоп, настоящий LessonReviewPanel на уроке из lesson-drafts)
    { name: 'review-perf', testMatch: /review-perf\.spec\.js/, use: { ...benchChromium, viewport: { width: 1920, height: 1080 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 } },
    // Сценарий нового пользователя (мобильный, на своём сервере и с перехватом сети)
    { name: 'newbie', testMatch: NEWBIE_SPEC, use: newbieChromium },
    // Живой сценарий нового пользователя: боевая база, тестовые аккаунты, без повторов (прогон меняет состояние аккаунтов)
    { name: 'newbie-live', testMatch: LIVE_SPEC, retries: 0, timeout: 300_000, use: liveChromium },
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
        testMatch: /admin.*\.spec\.js/, // admin.spec.js, admin-decks.spec.js
        dependencies: ['setup'],
        use: { viewport: { width: 1280, height: 800 }, storageState: 'test-results/.auth/admin.json' },
      },
      // Права в БД (RLS) — прямые REST-запросы, браузер не нужен
      { name: 'rls', testMatch: /rls\.spec\.js/ },
    ] : []),
  ],
})
