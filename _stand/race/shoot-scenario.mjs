// Сценарий «Встряхни память» от старта до входа в экзамен (Playwright, 375×812, голосом): Конвейер слов A (две ошибки — чтобы пришла Мия) → «Допрос у Мии» → разворот → B → «Конвейер ситуаций» («Скажи» с демо) → вход в экзамен.
// Снимает трассу сцены («[scene] {json}» из журнала игры) в OUT/journal.txt (её читает scripts/timeline-from-log.mjs) и печатает таблицу «реплика → начало / конец → тишина до следующей» с самыми длинными тишинами.
// MIA=win — в «Допросе» все слова верны (Мия уходит с коробкой); MIA=keep — одно слово пропущено (коробка остаётся, её снимают двумя касаниями). LEN=1.3 — реплики длиннее на 30 % (гудок 65 мс на букву × LEN).
// Запуск: npx vite --port 5461 --host 127.0.0.1; PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node _stand/race/shoot-scenario.mjs  (OUT=каталог, SECS=потолок, ASK=voice|tap)
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.BASE || 'http://127.0.0.1:5461/_stand/race/index.html'
const OUT = process.env.OUT || '/tmp/scenario'
const MIA = process.env.MIA || 'win'
const ASK = process.env.ASK || 'voice'
const LEN = process.env.LEN || '1'
const SECS = Number(process.env.SECS || 260)
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ['microphone'] })
await ctx.addInitScript(() => { localStorage.setItem('pithy_weak_device_v6', '0'); localStorage.setItem('pithy_debug', '1'); localStorage.setItem('pithy_debug_console', '1') })
const page = await ctx.newPage()
const log = []
page.on('console', m => { const t = m.text(); if (t.startsWith('[PLAYER]')) log.push({ at: Date.now(), t: t.slice(9) }) })
page.on('pageerror', e => console.log('PAGEERROR', e.message))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const shots = new Set()
const shot = async name => { if (shots.has(name)) return; shots.add(name); await page.screenshot({ path: `${OUT}/${name}.png` }) }
await page.goto(`${BASE}?seed=r1&ask=${ASK}&only=stages&lines=1&meaning=1&len=${LEN}`)
await page.waitForSelector('[data-testid="rotate-start"]:not([disabled])', { timeout: 30000 })
await sleep(800)
await page.click('[data-testid="rotate-start"]')
await page.waitForSelector('[data-testid="wl"]', { timeout: 15000 })
const t0 = Date.now()
const done = new Set()
let again = null, skipA = 2, skipMia = MIA === 'keep' ? 1 : 0, bossAt = 0, hits = 0, lastSid = null
while (Date.now() - t0 < SECS * 1000) {
  const st = await page.evaluate(() => ({ sid: document.querySelector('[data-testid="wl"]')?.dataset.sid ?? null, hit: !!document.querySelector('[data-testid="race-mia-hit"]'), plate: document.querySelector('.wlTurn:not(.wlTurn--leave)')?.textContent ?? '' }))
  const sid = st.sid
  if (sid !== lastSid) { lastSid = sid; console.log(`${String(Date.now() - t0).padStart(7)} стадия ${sid}`) }
  if (sid === 'phrases-ann' && st.plate) await shot('phrases-plate')
  if (sid === 'phrases2') { const y = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('.wlPill[data-held]')].map(el => el.getBoundingClientRect().top))); const said = log.filter(l => /перед ходом/.test(l.t)).length; if (y > 220 && !said) await shot('phrases-demo'); if (y > 260 && said === 1) await shot('phrases-say-pass1'); if (y > 260 && said === 2) await shot('phrases-say-pass2') }
  if (/3-end$/.test(sid ?? '')) { const dt = Date.now() - (shots.endAt ??= Date.now()); if (dt > 600) await shot('mia-end-1'); if (dt > 2600) await shot('mia-end-2'); if (dt > 4800) await shot('mia-end-3'); if (st.hit) await shot('mia-end-box') }
  if (/3-ann$/.test(sid ?? '')) { const dt = Date.now() - (shots.annAt ??= Date.now()); if (dt > 5200) await shot('mia-ceremony') }
  if (sid === 'catch-rev') await shot('reverse')
  if (st.hit && hits < 2 && log.some(l => /boss_pit_stuck/.test(l.t))) { if (!shots.stuckAt) shots.stuckAt = Date.now(); if (Date.now() - shots.stuckAt > 2500) { const r = await page.evaluate(() => { const b = document.querySelector('[data-testid="race-mia-hit"]').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } }); await page.touchscreen.tap(r.x, r.y); await sleep(250); await page.touchscreen.tap(r.x, r.y); hits = 2 } }
  if (sid?.startsWith('boss')) { bossAt ||= Date.now(); if (Date.now() - bossAt > 9000) break }
  if (sid === 'summary') break
  const pre = [...log].reverse().find(l => /\[race\] голос: повтор|\[phrase-voice\] перед ходом/.test(l.t))
  if (pre && !done.has(pre.at)) {
    const pills = await page.evaluate(() => [...document.querySelectorAll('.wlPill[data-held]:not([data-fail]):not([data-lock]):not([data-rise])')].map(el => { const r = el.getBoundingClientRect(); return { top: r.top, h: r.height, cap: el.getAttribute('data-cap') } }).filter(p => p.top > 80 && p.top < 640))
    const ph = pre.t.match(/перед ходом «(.*?)» \((\w+)/)
    if (ph) {
      if (ph[2] === 'say') { if (pills.length) { done.add(pre.at); await sleep(900); await page.evaluate(w => window.__phraseSay(w), ph[1].toLowerCase().replace(/[^a-z' ]/g, '')) } }
      else { const p = pills.find(x => x.top > 812 * 0.3); if (p) { done.add(pre.at); await page.touchscreen.tap(187, p.top + p.h / 2) } }
    } else if (pills.length) {
      done.add(pre.at)
      if (sid === 'sprint' && skipA > 0) skipA--
      else if (/3$/.test(sid ?? '') && skipMia > 0) skipMia--
      else {
        const sprint = !/говорит слово/.test(pre.t)
        const w = sprint ? pre.t.match(/слово «(.*?)»/)?.[1] : pre.t.match(/на пилюле «(.*?)»/)?.[1]
        if (ASK === 'tap') await page.touchscreen.tap(187, pills[0].top + pills[0].h / 2)
        else { again = { at: pre.at, w: (w ?? '').toLowerCase(), n: 0, t: 0 }; await page.evaluate(x => { window.__sayQueue.length = 0; window.__sayQueue.push(x) }, again.w) }
      }
    }
  } else if (again && pre?.at === again.at && again.n < 10 && Date.now() - again.t > 300) { // слово могло попасть в окно речи Пита / Мии (микрофон «не слушает») — повторяем, пока пилюля едет
    again.n++; again.t = Date.now()
    const left = await page.evaluate(() => document.querySelectorAll('.wlPill[data-held]:not([data-fail]):not([data-lock]):not([data-rise])').length)
    if (left) await page.evaluate(x => { if (!window.__sayQueue.length) window.__sayQueue.push(x) }, again.w)
  }
  await sleep(60)
}
writeFileSync(`${OUT}/journal.txt`, log.map(l => l.t).join('\n'))
// Таблица реплик: начало / конец (по событиям трассы) и тишина до следующей
const ev = log.filter(l => l.t.startsWith('[scene] ')).map(l => { try { return JSON.parse(l.t.slice(8)) } catch { return null } }).filter(Boolean)
const base = ev.find(e => e.k === 'stage-in')?.t ?? ev[0]?.t ?? 0
const sound = [], open = new Map()
let stage = ''
for (const e of ev) {
  if (e.k === 'stage-in') stage = e.sid ?? ''
  if (e.k === 'line-start' || e.k === 'word-start' || e.k === 'count') { const row = { stage, who: e.who ?? (e.k === 'count' ? 'ноты' : 'pit'), id: e.id ?? e.word ?? e.what ?? e.k, text: e.text ?? '', a: e.t, b: e.t + (e.ms ?? 0), est: true }; sound.push(row); open.set(`${e.k.split('-')[0]}:${row.who}:${row.id}`, row) }
  if (e.k === 'line-end' || e.k === 'word-end' || e.k === 'count-end') { const key = `${e.k.split('-')[0]}:${e.who ?? (e.k === 'count-end' ? 'ноты' : 'pit')}:${e.id ?? e.word ?? ''}`; const row = e.k === 'count-end' ? [...sound].reverse().find(r => r.who === 'ноты' && r.est) : open.get(key); if (row) { row.b = e.t; row.est = false } }
}
sound.sort((x, y) => x.a - y.a)
const sec = t => ((t - base) / 1000).toFixed(2).padStart(7)
const rows = sound.map((r, i) => { const nx = sound[i + 1]; return { ...r, gap: nx ? Math.round(nx.a - r.b) : null } })
const table = rows.map(r => `${sec(r.a)} ${sec(r.b)}  ${String(r.gap ?? '').padStart(6)}  ${r.stage.padEnd(18)} ${String(r.who).padEnd(5)} ${r.id}${r.text ? ` «${r.text}»` : ''}`).join('\n')
writeFileSync(`${OUT}/lines.txt`, `начало  конец    тишина  стадия             кто   реплика\n${table}\n`)
console.log(`\nначало  конец    тишина  стадия             кто   реплика\n${table}`)
console.log('\nСамые длинные тишины:\n' + [...rows].filter(r => r.gap != null).sort((x, y) => y.gap - x.gap).slice(0, 12).map(r => `${String(r.gap).padStart(6)} мс после ${r.who} ${r.id} (${r.stage})`).join('\n'))
await ctx.close(); await browser.close()
