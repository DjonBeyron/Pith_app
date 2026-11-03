// Скриншоты стенда «Мини-игра 2.0» (Playwright, 375×812): RUNS=ABC node _stand/game2/shoot.mjs  (dev-сервер: npx vite --port 5410 --strictPort; PW_CHROMIUM_PATH=/opt/pw-browsers/chromium; OUT=каталог для картинок)
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:5410/_stand/game2/index.html'
const OUT = process.env.OUT || '/tmp/g2shots'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })

async function open(query) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ['microphone'] })
  await ctx.addInitScript(() => localStorage.setItem('pithy_weak_device_v6', '0')) // headless Chromium без GPU deviceTier считает «слабым» (lite): снимки — как на обычном телефоне
  const page = await ctx.newPage()
  page.on('pageerror', e => console.log('PAGEERROR', e.message))
  await page.goto(`${BASE}?${query}`)
  await page.waitForSelector('[data-testid="g2-run"]:not([disabled])', { timeout: 30000 })
  return { ctx, page }
}
const at = (page, mode, ms, timeout = 40000) => page.waitForFunction(([m, t]) => window.__g2?.mode === m && performance.now() - window.__g2.startedAt >= t, [mode, ms], { timeout, polling: 30 })
const shot = async (page, name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name) }

const RUNS = process.env.RUNS || 'ABC' // какие прогоны делать (RUNS=C — только третий)

// Прогон A: фраза озвучена, первая попытка «Ловлю» молчит (промах и повтор), все режимы до итога
if (RUNS.includes('A')) {
  const { ctx, page } = await open('catchMiss=1&lines=1')
  await page.locator('[data-testid="g2-block"]').screenshot({ path: `${OUT}/00-admin-block.png` })
  await page.click('[data-testid="g2-run"]')
  await page.waitForSelector('[data-testid="g2"][data-mode="start"]')
  await page.waitForTimeout(900); await shot(page, '01-start')
  await at(page, 'listen', 2250); await shot(page, '02-listen')
  await at(page, 'catch', 1500); await shot(page, '03-catch-wait')
  await at(page, 'catch', 3700); await shot(page, '04-catch-miss')
  await at(page, 'shadow', 2350); await shot(page, '06-shadow')
  await at(page, 'recall', 2350); await shot(page, '07-recall')
  await at(page, 'speed', 2000); await shot(page, '08-speed')
  await page.waitForSelector('[data-testid="g2-summary"]', { timeout: 30000 })
  await page.waitForTimeout(700); await shot(page, '09-summary')
  await ctx.close()
}

// Прогон B: повтор «Ловлю» (после промаха Пит говорит rh2_catch_miss, слова пойманы и улетают)
if (RUNS.includes('B')) {
  const { ctx, page } = await open('catchMiss=1&lines=1')
  await page.click('[data-testid="g2-run"]')
  await page.waitForFunction(() => window.__g2?.mode === 'catch', null, { timeout: 40000 })
  await page.waitForFunction(() => window.__g2?.mode === 'catch' && performance.now() - window.__g2.startedAt > 4500, null, { timeout: 20000 }) // конец первой попытки
  await page.waitForFunction(() => { const g = window.__g2; return g?.mode === 'catch' && performance.now() - g.startedAt < 400 }, null, { timeout: 40000, polling: 20 }) // началась вторая
  await page.waitForFunction(() => window.__g2?.mode === 'catch' && performance.now() - window.__g2.startedAt > 2650, null, { timeout: 10000, polling: 20 })
  await shot(page, '05-catch-retry-flying')
  await ctx.close()
}

// Прогон C: фраза не озвучена (оценка таймингов) и «По памяти» молчит — подсказка первого слова
if (RUNS.includes('C')) {
  const { ctx, page } = await open('voiced=0&silent=recall')
  await page.click('[data-testid="g2-run"]')
  await at(page, 'listen', 2300); await shot(page, '10-listen-estimated')
  await page.waitForSelector('[data-testid="g2-hint"]', { timeout: 120000 }); await page.waitForTimeout(500); await shot(page, '11-recall-hint')
  await ctx.close()
}
await browser.close()
