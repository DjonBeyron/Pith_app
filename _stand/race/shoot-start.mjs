// Замер запуска «Встряхни память» (Playwright, 375×812): «Начать» → попап (тихий прогрев) → «Говорю» (микрофон ДО входа в игру) / «Тапаю» (без микрофона) → первая реплика Пита.
// getUserMedia на странице перехвачен: считаем вызовы, GUM_MS — сколько «думает система» (диалог доступа), DENY=1 — отказ. Журнал: «[race] старт: реплика через M мс после входа в игру…», «[warm] гонка: …».
// Запуск: npx vite --port 5411 --strictPort; PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node _stand/race/shoot-start.mjs (MODE=voice|tap|deny, GUM_MS=0, OUT=/tmp/race-start)
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:5411/_stand/race/index.html'
const OUT = process.env.OUT || '/tmp/race-start'
const MODE = process.env.MODE || 'voice'
const GUM_MS = Number(process.env.GUM_MS ?? 0)
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ['microphone'] })
await ctx.addInitScript(({ gumMs, deny }) => {
  localStorage.setItem('pithy_weak_device_v6', '0')
  window.__gum = []
  const md = navigator.mediaDevices, real = md.getUserMedia.bind(md)
  md.getUserMedia = c => { window.__gum.push(performance.now()); return new Promise((res, rej) => setTimeout(() => (deny ? rej(Object.assign(new Error('нет'), { name: 'NotAllowedError' })) : real(c).then(res, rej)), gumMs)) }
}, { gumMs: GUM_MS, deny: MODE === 'deny' })
const page = await ctx.newPage()
page.on('pageerror', e => console.log('PAGEERROR', e.message))
const sleep = ms => new Promise(r => setTimeout(r, ms))

await page.goto(`${BASE}?seed=r1&ask=none&lines=1`)
await page.waitForSelector('[data-testid="rotate-start"]:not([disabled])', { timeout: 30000 })
await sleep(1500) // карточка успела прогреться, как у человека
await page.click('[data-testid="rotate-start"]')
await page.waitForSelector('[data-testid="race-ask-scene"]', { timeout: 10000 })
await sleep(600)
const t0 = await page.evaluate(() => performance.now())
await page.click(`[data-testid="race-ask-${MODE === 'tap' ? 'tap' : 'voice'}"]`)
if (MODE !== 'tap') { await sleep(Math.min(150, GUM_MS)); console.log('кнопка «Говорю» пока ждём:', await page.textContent('[data-testid="race-ask-voice"]'), '; игра:', await page.$('[data-testid="wl"]') ? 'ЕСТЬ' : 'нет'); await page.screenshot({ path: `${OUT}/${MODE}-wait.png` }) }
if (MODE === 'deny') {
  await page.waitForSelector('[data-testid="race-ask-hint"]', { timeout: 5000 })
  console.log('подсказка:', await page.textContent('[data-testid="race-ask-hint"]'), '; игра:', await page.$('[data-testid="wl"]') ? 'ЕСТЬ (плохо)' : 'нет', '; «Тапаю» доступно:', await page.isEnabled('[data-testid="race-ask-tap"]'))
  await page.screenshot({ path: `${OUT}/deny.png` })
  await page.click('[data-testid="race-ask-tap"]') // после отказа — «Тапаю»: игра без микрофона
  await page.waitForSelector('[data-testid="wl"]', { timeout: 8000 }); console.log('после отказа «Тапаю»: игра открыта'); await sleep(2000)
} else {
  await page.waitForSelector('[data-testid="wl"]', { timeout: 8000 })
  console.log('игра открыта через', Math.round(await page.evaluate(() => performance.now()) - t0), 'мс после ответа')
  await sleep(2500)
}
console.log('getUserMedia вызовов:', await page.evaluate(() => window.__gum.length))
const lines = await page.evaluate(async () => (await import('/src/shared/lib/debug.js')).getPlayerLines())
console.log(lines.filter(l => /\[race\] старт|\[warm\] гонка|\[mic\]|\[cat\] реплика «race_start»|\[cat-voice\]|race_start/.test(l)).slice(0, 30).join('\n'))
await ctx.close(); await browser.close()
