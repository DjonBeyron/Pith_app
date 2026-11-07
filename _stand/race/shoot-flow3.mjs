// Этап «Фразы»: конвейер между кругами и скорость пилюль (Playwright, 375×812). Круг 1 тапами по верной (цель — из журнала «[phrase-voice] перед ходом «…»»), замер top пилюль каждые ~50 мс,
// проверка: пилюли круга 1 после «finished» доезжают вниз (top растёт ровно) и не исчезают посреди экрана; скорость пилюль по отрезкам постоянна (±5 %).
// Запуск: npx vite --port 5438 --strictPort; PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node _stand/race/shoot-flow3.mjs (ASK=tap|voice, OUT=каталог снимков, SECS=длительность)
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:5438/_stand/race/index.html'
const OUT = process.env.OUT || '/tmp/flow3'
const ASK = process.env.ASK || 'tap'
const SECS = Number(process.env.SECS || 75)
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ['microphone'] })
await ctx.addInitScript(() => { localStorage.setItem('pithy_weak_device_v6', '0'); localStorage.setItem('pithy_debug', '1'); localStorage.setItem('pithy_debug_console', '1') })
const page = await ctx.newPage()
const log = []
page.on('console', m => { const t = m.text(); if (t.startsWith('[PLAYER]')) log.push({ at: Date.now(), t: t.slice(9) }) })
page.on('pageerror', e => console.log('PAGEERROR', e.message))
const sleep = ms => new Promise(r => setTimeout(r, ms))

await page.goto(`${BASE}?seed=r1&ask=${ASK}&only=phrases`)
await page.waitForSelector('[data-testid="rotate-start"]:not([disabled])', { timeout: 30000 })
await sleep(800)
await page.click('[data-testid="rotate-start"]')
await page.waitForSelector('[data-testid="wl"]', { timeout: 15000 })
const t0 = Date.now()
const samples = [] // { t, pills: [{ i, top, cap, spent, coast, mode }] }
const tapped = new Set()
const shots = new Set()
const shot = async name => { if (shots.has(name)) return; shots.add(name); await page.screenshot({ path: `${OUT}/flow3-${name}.png` }) }
let finishedAt = null, said = new Set()
while (Date.now() - t0 < SECS * 1000) {
  const [pt, s] = await page.evaluate(() => [performance.now(), [...document.querySelectorAll('.wlPill[data-wide][data-held]')].map(el => { const r = el.getBoundingClientRect(); return { i: [...el.parentNode.children].indexOf(el), top: r.top, h: r.height, cap: el.getAttribute('data-cap'), spent: el.hasAttribute('data-spent'), coast: el.hasAttribute('data-coast'), mode: el.getAttribute('data-mode'), rise: el.hasAttribute('data-rise') } })])
  const t = Date.now() - t0
  samples.push({ t, pt, pills: s }) // pt — часы страницы в момент замера (скорость считаем по ним: без задержки ответа evaluate)
  const pre = [...log].reverse().find(l => l.t.includes('[phrase-voice] перед ходом'))
  const target = pre?.t.match(/перед ходом «(.*?)» \((\w+)\)/)
  if (target && target[2] !== 'say') {
    const p = s.find(x => x.cap && !x.spent && !x.rise && x.top + x.h / 2 > 812 * (Number(process.env.TAP_Y) || 0.35) && x.top + x.h / 2 < 812 * 0.6 && (target[2] === 'pick' ? x.cap === target[1] : true))
    const key = pre.at
    if (p && !tapped.has(key) && (target[2] === 'pick')) { tapped.add(key); await page.touchscreen.tap(187, p.top + p.h / 2) }
  }
  if (process.env.SAY !== '0' && target && target[2] === 'say' && !said.has(pre.at)) { const p = s.find(x => x.mode === 'say' && x.top + x.h / 2 > 812 * 0.4); if (p) { said.add(pre.at); await page.evaluate(w => window.__phraseSay(w), target[1].toLowerCase().replace(/[^a-z' ]/g, '')) } }
  if (!finishedAt && log.some(l => /круг 1.*ход 3\/3/.test(l.t))) { finishedAt = t; await shot('r1-last') }
  if (finishedAt && t - finishedAt > 1500) await shot('r1-after1500')
  if (log.some(l => l.t.includes('доезжают'))) await shot('coast')
  if (s.some(x => x.mode && x.mode !== 'pick')) await shot('r2-first')
  await sleep(45)
}
writeFileSync(`${OUT}/samples.json`, JSON.stringify(samples))
writeFileSync(`${OUT}/log.txt`, log.map(l => `${l.at - t0} ${l.t}`).join('\n'))
// треки: элемент пула подряд в замерах (пропал из замера — трек кончился); скорость по отрезкам ~500 мс, пока летит вниз (не rise); где трек кончился — у края или посреди экрана
const tracks = [], open = new Map()
for (const { t, pt, pills } of samples) {
  const seen = new Set()
  for (const p of pills) { seen.add(p.i); let tr = open.get(p.i); if (!tr || tr.cap !== p.cap) { tr = { i: p.i, cap: p.cap, pts: [] }; tracks.push(tr); open.set(p.i, tr) } tr.pts.push({ t, pt, ...p }) }
  for (const i of [...open.keys()]) if (!seen.has(i)) open.delete(i)
}
let vanished = 0
for (const tr of tracks) {
  const down = tr.pts.filter(p => !p.rise), v = []
  for (let a = 0; a < down.length; ) { let b = a; while (b < down.length - 1 && down[b].pt - down[a].pt < 500) b++; if (b === a) break; v.push(((down[b].top - down[a].top) / (down[b].pt - down[a].pt)) * 1000); a = b }
  const last = tr.pts.at(-1), mid = !last.rise && last.top < 780 && last.top > -60
  if (mid) vanished++
  console.log(`#${tr.i} «${tr.cap}» ${last.mode} t ${tr.pts[0].t}…${last.t} top ${tr.pts[0].top.toFixed(0)}→${last.top.toFixed(0)}${last.rise ? ' взлёт' : ''}${last.coast ? ' coast' : ''}${last.spent ? ' spent' : ''}${mid ? ' ИСЧЕЗЛА ПОСРЕДИ ЭКРАНА' : ''}: px/с ${v.map(x => x.toFixed(0)).join(' ')}`)
}
console.log('исчезли посреди экрана:', vanished)
console.log('--- журнал [phrases]/[conveyor] ---')
console.log(log.filter(l => /\[phrases\]|\[conveyor\]|перед ходом|\[race\] стадия|announce/.test(l.t)).map(l => `${l.at - t0} ${l.t.slice(0, 230)}`).join('\n'))
await ctx.close(); await browser.close()
