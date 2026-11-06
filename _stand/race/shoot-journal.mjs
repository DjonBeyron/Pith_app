// Журнал игры из шестерёнки (Playwright, 375×812): «Начать» → «Тапаю» → игра → свернули (visibilitychange hidden → visible, пауза) → шестерёнка ПОВЕРХ плашки паузы → «Скопировать журнал» и «Скачать журнал».
// Проверяет: шестерёнка кликабельна на паузе, в журнале есть [page] (свернули / вернули), [pause], [start] (хронология и итог), заголовок с версией и режимом.
// Запуск: npx vite --port 5411 --strictPort; PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node _stand/race/shoot-journal.mjs (OUT=/tmp/race-journal)
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:5411/_stand/race/index.html'
const OUT = process.env.OUT || '/tmp/race-journal'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ['microphone', 'clipboard-read', 'clipboard-write'], acceptDownloads: true })
await ctx.addInitScript(() => { localStorage.setItem('pithy_weak_device_v6', '0') })
const page = await ctx.newPage()
page.on('pageerror', e => console.log('PAGEERROR', e.message))
const sleep = ms => new Promise(r => setTimeout(r, ms))

await page.goto(`${BASE}?seed=r1&ask=none&lines=1&only=stages`)
await page.waitForSelector('[data-testid="rotate-start"]:not([disabled])', { timeout: 30000 })
await sleep(1200)
await page.click('[data-testid="rotate-start"]')
await page.waitForSelector('[data-testid="race-ask-scene"]', { timeout: 10000 })
await sleep(400)
await page.click('[data-testid="race-ask-tap"]')
await page.waitForSelector('[data-testid="wl"]', { timeout: 8000 })
await sleep(2500)
// «свернули приложение»: вкладка скрыта и снова видна (как на iPhone при сворачивании)
await page.evaluate(async () => {
  const set = v => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v })
  set('hidden'); Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'))
  window.dispatchEvent(new Event('blur'))
  await new Promise(r => setTimeout(r, 400))
  set('visible'); Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'))
  window.dispatchEvent(new Event('focus'))
})
await page.waitForSelector('[data-testid="wl-pause"]', { timeout: 5000 })
console.log('пауза: плашка «Продолжить» на экране')
await page.click('[data-testid="wl-hud-open"]', { timeout: 3000 }) // упадёт, если подложка паузы перекрывает шестерёнку
await page.waitForSelector('[data-testid="wl-hud-journal"]')
await page.screenshot({ path: `${OUT}/pause-hud.png` })
await page.click('[data-testid="wl-hud-journal-copy"]')
await sleep(300)
console.log('статус после «Скопировать»:', await page.textContent('[data-testid="wl-hud-status"]'))
const clip = await page.evaluate(() => navigator.clipboard.readText().catch(e => `нет: ${e.message}`))
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click('[data-testid="wl-hud-journal"]')])
const file = dl ? `${OUT}/${dl.suggestedFilename()}` : null
if (dl) await dl.saveAs(file)
console.log('файл:', dl ? dl.suggestedFilename() : 'НЕТ', '; статус:', await page.textContent('[data-testid="wl-hud-status"]'))
const text = file ? readFileSync(file, 'utf8') : clip
console.log('--- заголовок ---\n' + text.split('\n').slice(0, 9).join('\n'))
for (const tag of ['[page]', '[pause]', '[start]', '[start] итог', '[note]', '[warm]']) console.log(`${tag}: ${text.split('\n').filter(l => l.includes(tag)).length} строк`)
console.log('--- [page] ---\n' + text.split('\n').filter(l => l.includes('[page]')).join('\n'))
console.log('буфер обмена совпадает с файлом по строкам [start]:', clip.split('\n').filter(l => l.includes('[start]')).length === text.split('\n').filter(l => l.includes('[start]')).length)
await ctx.close(); await browser.close()
