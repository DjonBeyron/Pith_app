// Верх разделительных линий дорожек и узора против кнопок «назад» / пауза (Playwright, 375×812, DPR 2, safe-area сверху 50 px — CDP Emulation.setSafeAreaInsetsOverride, как iPhone 12 mini).
// Снимок верхней части экрана во время прохода A (ONLY=stages) или круга фраз (ONLY=phrases) и замер: верх .wlLaneEdge / колонок .wlLanes i и верх кнопок .raceBack / .racePause.
// Запуск: npx vite --port 5441 --strictPort; PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node _stand/race/shoot-top.mjs (OUT=каталог, NAME=префикс снимков, ONLY=stages|phrases, SAT=50)
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:5441/_stand/race/index.html'
const OUT = process.env.OUT || '/tmp/top'
const NAME = process.env.NAME || 'top'
const ONLY = process.env.ONLY || 'stages'
const SAT = Number(process.env.SAT ?? 50)
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ['microphone'] })
await ctx.addInitScript(() => localStorage.setItem('pithy_weak_device_v6', '0'))
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
try { await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: SAT, bottom: 34 } }); console.log('safe-area: эмуляция CDP, top', SAT) } catch (e) { console.log('safe-area: CDP не умеет —', e.message) }
page.on('pageerror', e => console.log('PAGEERROR', e.message))
const sleep = ms => new Promise(r => setTimeout(r, ms))
await page.goto(`${BASE}?seed=r1&ask=tap&only=${ONLY}`)
await page.waitForSelector('[data-testid="rotate-start"]:not([disabled])', { timeout: 30000 })
await sleep(800)
await page.click('[data-testid="rotate-start"]')
await page.waitForSelector('[data-testid="wl"]', { timeout: 15000 })
if (process.env.CAP) { // CAP=1 — снимок плашки с подписью неозвученной реплики (.wlTurnCap / заставка race-charge-cap)
  await page.waitForSelector(process.env.CAP === 'charge' ? '[data-testid="race-charge-cap"]' : '[data-testid="wl-turn-cap"]', { timeout: 90000 }); await sleep(400)
  await page.screenshot({ path: `${OUT}/${NAME}-cap.png` }); console.log('подпись:', await page.textContent(process.env.CAP === 'charge' ? '[data-testid="race-charge-cap"]' : '[data-testid="wl-turn-cap"]'))
}
await page.waitForFunction(() => document.querySelector('.wlPill[data-held]'), null, { timeout: 60000 })
await sleep(Number(process.env.DELAY || 1200)) // DELAY — для снимка нескольких пилюль фраз (шаг PHRASE_GAP_MS)
const m = await page.evaluate(() => {
  const top = sel => { const el = document.querySelector(sel); return el ? Math.round(el.getBoundingClientRect().top) : null }
  return { edge: top('.wlLaneEdge'), lane: top('.wlLanes i'), lanes: top('.wlLanes'), back: top('.raceBack'), pause: top('.racePause'), sat: getComputedStyle(document.documentElement).getPropertyValue('--x') }
})
console.log('верх, px:', JSON.stringify(m))
await page.screenshot({ path: `${OUT}/${NAME}-full.png` })
await page.screenshot({ path: `${OUT}/${NAME}-top.png`, clip: { x: 0, y: 0, width: 375, height: 260 } })
await ctx.close(); await browser.close()
