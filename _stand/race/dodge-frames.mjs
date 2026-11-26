// Покадровое положение головы Пита во время уворота в lite-режиме (слабый Android): rect svg головы, data-dodge, opacity / visibility на каждом кадре rAF + длительности кадров.
// Запуск (после сборки и preview стенда, см. vite.perf.config.mjs): BASE=http://127.0.0.1:5476/_stand/race/index.html OUT=/tmp/frames.json SECS=70 CPU=4 PW_CHROMIUM_PATH=... node _stand/race/dodge-frames.mjs
// Сводка: node _stand/race/dodge-report.mjs /tmp/frames.json
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'

const E = process.env, CPU = Number(E.CPU || 4), BASE = E.BASE || 'http://127.0.0.1:5476/_stand/race/index.html', OUT = E.OUT || '/tmp/frames.json', SECS = Number(E.SECS || 60)
const browser = await chromium.launch({ executablePath: E.PW_CHROMIUM_PATH, args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ['microphone'] })
await ctx.addInitScript(() => {
  localStorage.setItem('pithy_weak_device_v6', '1'); localStorage.setItem('pithy_debug', '1'); localStorage.setItem('pithy_debug_console', '0')
  document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('weak-device', 'perf-no-textures'))
  const S = window.__f = { rows: [], dt: [] }
  let last = 0
  const tick = t => {
    if (last) S.dt.push([Math.round(t), Math.round((t - last) * 10) / 10])
    last = t
    const c = document.querySelector('.wlCat--track'), s = c?.querySelector('.wlCatSvg')
    if (s) {
      const r = s.getBoundingClientRect(), cs = getComputedStyle(c), ss = getComputedStyle(s)
      S.rows.push([Math.round(t), Math.round(r.left * 10) / 10, Math.round(r.top * 10) / 10, c.dataset.dodge ?? '', cs.opacity, cs.visibility, ss.opacity])
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
const sleep = ms => new Promise(r => setTimeout(r, ms))
await page.goto(`${BASE}?seed=r1&ask=voice&only=stages&lines=1&meaning=1&perf=1`)
await page.waitForSelector('[data-testid="rotate-start"]:not([disabled])', { timeout: 30000 })
await sleep(800)
if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })
await page.tap('[data-testid="rotate-start"]')
await page.waitForSelector('[data-testid="wl"]', { timeout: 30000 })
await sleep(SECS * 1000)
writeFileSync(OUT, JSON.stringify(await page.evaluate(() => window.__f)))
await browser.close()
