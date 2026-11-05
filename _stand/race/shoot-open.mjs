// Снимки открытия «Гонки с Питом» (Playwright, 375×812): попап «Говорю / Тапаю» внутри сцены игры, Пит в первые 300 мс, слова летят в бар, импакт бара, морф бара в плашку «Разгон + задание», бейдж скорости.
// Запуск: npx vite --port 5411 --strictPort; PW_CHROMIUM_PATH=/opt/pw-browsers/chromium OUT=/tmp/raceshots-open node _stand/race/shoot-open.mjs (ASK=none — стоять на попапе, потом ответить кликом, как человек).
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:5411/_stand/race/index.html'
const OUT = process.env.OUT || '/tmp/raceshots-open'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ['microphone'] })
await ctx.addInitScript(() => localStorage.setItem('pithy_weak_device_v6', '0'))
const page = await ctx.newPage()
page.on('pageerror', e => console.log('PAGEERROR', e.message))
let T0 = Date.now()
page.on('console', m => { const t = m.text(); if (/\[race\]|\[cat\] очередь: \+реплика|отсчёт|ноты/.test(t)) console.log('LOG +' + (Date.now() - T0) + ' мс', t) })
const shot = async name => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name) }

await page.goto(`${BASE}?only=${process.env.ONLY ?? 'sprint'}&seed=r1&ask=none`) // ONLY= (пусто) — полная гонка с race_start
await page.waitForSelector('[data-testid="rotate-start"]:not([disabled])', { timeout: 30000 })
await page.click('[data-testid="rotate-start"]')
await page.waitForSelector('[data-testid="race-ask-scene"]', { timeout: 10000 })
await sleep(500)
console.log('до ответа: game =', await page.$('[data-testid="wl"]') ? 'ЕСТЬ (плохо)' : 'нет', '; charge =', await page.$('[data-testid="race-charge"]') ? 'ЕСТЬ (плохо)' : 'нет')
await shot('01-popup-in-scene')
const t0 = Date.now(); T0 = t0
await page.click('[data-testid="race-ask-voice"]')
await page.waitForSelector('[data-testid="wl"]', { timeout: 5000 })
console.log('игра открыта через', Date.now() - t0, 'мс')
for (const [ms, name] of [[120, '02-pit-120ms'], [300, '03-pit-300ms']]) { await sleep(Math.max(0, ms - (Date.now() - t0))); await shot(name) }
await page.waitForSelector('[data-testid="race-charge"]', { timeout: 8000 }); console.log('заставка началась через', Date.now() - t0, 'мс')
let i = 0
while (!(await page.$('[data-testid="race-charge-plate"]')) && i < 60) { await sleep(120); await page.screenshot({ path: `${OUT}/04-top-${String(i).padStart(3, '0')}.png`, clip: { x: 0, y: 0, width: 375, height: 240 } }); if (i % 8 === 0) await shot(`04-charge-${String(i).padStart(3, '0')}`); i += 1 } // слова летят в бар, импакт: полоска сверху каждые 120 мс
console.log('плашка появилась через', Date.now() - t0, 'мс, время', new Date().toISOString().slice(11, 23))
for (const ms of [60, 160, 160, 160, 160, 300]) { await sleep(ms); await shot(`05-morph-${String(Date.now() - t0).padStart(5, '0')}`) }
await sleep(3500); await shot('06-after-plate')
await sleep(1500)
const lines = await page.evaluate(async () => (await import('/src/shared/lib/debug.js')).getPlayerLines())
console.log(lines.filter(l => /\[race\] (старт|взлёт)|\[warm\] готово|очередь: \+|отсчёт|нот[аы]/.test(l)).join('\n'))
await ctx.close(); await browser.close()
