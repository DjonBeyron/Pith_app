// Пит и пауза в lite-режиме (слабый Android): покадровая видимость кота (узел, rect внутри экрана, opacity / visibility / transform / translate головы) через паузу и «Продолжить» на нескольких стадиях.
// Запуск: BASE=http://127.0.0.1:5504/_stand/race/index.html PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome CPU=4 node _stand/race/cat-pause.mjs
// Пауза — как в приложении: visibilityState = hidden + visibilitychange (wordLanePauseEvents.js); «Продолжить» — кнопка wl-pause-resume. Пишет в консоль строки «пропал» (кот вне экрана / hidden / opacity 0 дольше 600 мс вне коробки Мии).
import { chromium } from '@playwright/test'

const E = process.env, CPU = Number(E.CPU || 4), BASE = E.BASE || 'http://127.0.0.1:5504/_stand/race/index.html'
const browser = await chromium.launch({ executablePath: E.PW_CHROMIUM_PATH, args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ['microphone'] })
await ctx.addInitScript(() => {
  localStorage.setItem('pithy_weak_device_v6', '1'); localStorage.setItem('pithy_debug', '1'); localStorage.setItem('pithy_debug_console', '0')
  document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('weak-device', 'perf-no-textures'))
  const S = window.__cat = { rows: [], bad: [] }
  let prev = '', badFrom = 0
  const tick = () => {
    const c = document.querySelector('.wlCat'), s = c?.querySelector('.wlCatSvg'), wl = document.querySelector('.wl')
    let state = 'нет узла', ok = false
    if (c) {
      const r = (s ?? c).getBoundingClientRect(), cs = getComputedStyle(c), ss = s ? getComputedStyle(s) : null
      const inside = r.bottom > 0 && r.top < innerHeight - 40 && r.right > 0 && r.left < innerWidth && r.width > 0
      ok = inside && cs.visibility !== 'hidden' && cs.opacity !== '0' && ss?.opacity !== '0'
      state = [Math.round(r.left), Math.round(r.top), cs.opacity, cs.visibility, ss?.transform, ss?.translate, c.dataset.dodge ?? '', c.classList.contains('wlCat--up') ? 'up' : 'dn'].join('|')
    }
    const key = `${wl?.dataset.sid ?? ''}|${wl?.dataset.phase ?? ''}|${wl?.hasAttribute('data-paused') ? 'P' : '-'}|${state}`
    if (key !== prev) { prev = key; S.rows.push([Math.round(performance.now()), key]) }
    const t = performance.now(), box = !!document.querySelector('.wlMia, [data-testid="race-mia"]')
    if (!ok && !badFrom) badFrom = t
    if (ok && badFrom) { if (t - badFrom > 600) S.bad.push([Math.round(badFrom), Math.round(t - badFrom), key, box]); badFrom = 0 }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  window.__pause = on => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (on ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')) }
})
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
const sleep = ms => new Promise(r => setTimeout(r, ms))
page.on('pageerror', e => console.log('PAGEERROR', e.message))
await page.goto(`${BASE}?seed=r1&ask=voice&only=stages&lines=1&meaning=1&perf=1`)
await page.waitForSelector('[data-testid="rotate-start"]:not([disabled])', { timeout: 30000 })
await sleep(800)
if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })
await page.tap('[data-testid="rotate-start"]')
await page.waitForSelector('[data-testid="wl"]', { timeout: 30000 })
const sid = () => page.evaluate(() => document.querySelector('[data-testid="wl"]')?.dataset.sid ?? null)
const waitSid = async (re, ms = 90000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await sid(); if (s && re.test(s)) return s; await sleep(100) } return null }
const cycle = async (label, hold = 1500) => {
  await page.evaluate(() => window.__pause(true)); await sleep(hold)
  const shown = await page.$('[data-testid="wl-pause-resume"]')
  if (shown) { await page.tap('[data-testid="wl-pause-resume"]'); await sleep(2500) } else console.log(label, ': окно паузы не появилось')
  await page.evaluate(() => window.__pause(false))
  console.log(label, 'пауза-продолжить сделаны, стадия', await sid())
}
for (const re of [/^sprint-ann$/, /^sprint$/]) { const s = await waitSid(re, 60000); if (!s) { console.log('нет стадии', re); continue } await sleep(2500); await cycle(`пауза в ${s}`); await sleep(2500) }
const r = await page.evaluate(() => window.__cat)
console.log('строк:', r.rows.length, 'провалов видимости:', r.bad.length)
for (const b of r.bad) console.log('ПРОПАЛ', JSON.stringify(b))
for (const [t, k] of r.rows) if (/\|P\||paused/.test(k)) console.log(String(t).padStart(7), k.slice(0, 170))
await ctx.close(); await browser.close()
