// Замер производительности «Встряхни память» на СБОРКЕ стенда (Playwright, 375×812, троттлинг CPU): полная игра голосом — Конвейер слов A (два молчания и чужое слово → придёт Мия) → «Допрос у Мии» →
// разворот → B → «Допрос» (одно слово пропущено → коробка остаётся, её снимают касаниями) → «Скажи» → экзамен (план EXAM: g — верно, x — чужое слово, s — молчание) → итог.
// В странице пишутся: время каждого кадра (rAF), длинные задачи (longtask), раз в 2 с — число вызовов requestAnimationFrame, анимации (всего / идущих / бесконечных с именами), узлы DOM игры и под игрой,
// JS-куча; драйвер на смене стадии снимает счётчики главного потока (CDP Performance.getMetrics: скрипт, стили, раскладка, слушатели, узлы). Журнал игры читается из window.__log (perfStand.js), не из консоли.
// Запуск: сборка и preview — см. vite.perf.config.mjs; затем
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome OUT=/tmp/perf NAME=n4 CPU=4 node _stand/race/perf-run.mjs
//   WEAK=1 — слабое устройство (lite), PROBE=1 — датчик [perf], UNDER=1 — подобие приложения под игрой, DEBUG=0 — без отладочного интерфейса (как у ученика), SHOTS=1 — снимки ключевых моментов (кадры при этом не считать).
// Сводка: node _stand/race/perf-report.mjs OUT/NAME.json [OUT2/NAME.json]
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'

const E = process.env
const BASE = E.BASE || 'http://127.0.0.1:5476/_stand/race/index.html', OUT = E.OUT || '/tmp/perf', NAME = E.NAME || 'run'
const CPU = Number(E.CPU || 4), WEAK = E.WEAK === '1', SHOTS = E.SHOTS === '1', SECS = Number(E.SECS || 480), EXAM = E.EXAM || 'gxsggg'
mkdirSync(OUT, { recursive: true })
const args = ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info']
const browser = await chromium.launch({ executablePath: E.PW_CHROMIUM_PATH, args })
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ['microphone'] })
await ctx.addInitScript(([weak, start, lagOff, catVis]) => {
  if (lagOff) localStorage.setItem('pithy_lag_trace', '0') // LAG=0 — трассер лагов выключен (цена самого трассера: пара прогонов LAG=1 / LAG=0)
  if (start) localStorage.setItem('pithy_race_start_stage_v1', start) // START=boss-intro-ann — «начать с этапа» (как у админа): сразу экзамен
  localStorage.setItem('pithy_weak_device_v6', weak ? '1' : '0'); localStorage.setItem('pithy_debug', '1'); localStorage.setItem('pithy_debug_console', '0')
  if (weak) document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('weak-device', 'perf-no-textures')) // как в приложении (main.jsx → applyWeakDeviceClasses): стенд этот вызов не делает, а CSS-упрощения слабых устройств висят на классе
  const nraf = window.requestAnimationFrame.bind(window)
  let calls = 0
  window.requestAnimationFrame = cb => { calls++; return nraf(cb) }
  const P = window.__perf = { f: [], lt: [], sec: [], skip: [] }
  const tick = t => { P.f.push(Math.round(t * 10) / 10); nraf(tick) }
  nraf(tick)
  if (catVis) { // CATVIS=1 — покадровая видимость Пита (узел, rect, opacity / visibility / transform / translate головы), раз в 3 кадра; пишет только изменения; в P.cat
    P.cat = []; let n = 0, prev = ''
    const cv = () => { if (++n % 3 === 0) { const c = document.querySelector('.wlCat'), s = c?.querySelector('.wlCatSvg'), wl = document.querySelector('.wl'); let o = 'нет узла'
      if (c) { const r = (s ?? c).getBoundingClientRect(), cs = getComputedStyle(c), ss = s ? getComputedStyle(s) : null; o = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), cs.opacity, cs.visibility, ss?.opacity, ss?.visibility, ss?.transform, ss?.translate, c.className.replace(/\s+/g, '.'), c.dataset.dodge ?? ''].join('|') }
      const k = (wl?.dataset.sid ?? '') + '|' + (wl?.dataset.phase ?? '') + '|' + o; if (k !== prev) { prev = k; P.cat.push([Math.round(performance.now()), k]) } } nraf(cv) }
    nraf(cv)
  }
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) P.lt.push([Math.round(e.startTime), Math.round(e.duration)]) }).observe({ entryTypes: ['longtask'] }) } catch { /* нет longtask */ }
  setInterval(() => {
    const t0 = performance.now(), wl = document.querySelector('.wl'), an = document.getAnimations(), names = {}
    let run = 0, inf = 0
    for (const a of an) { if (a.playState !== 'running') continue; run++; let it; try { it = a.effect.getTiming().iterations } catch { it = 0 } if (it === Infinity) { inf++; const n = a.animationName || a.transitionProperty || '?'; names[n] = (names[n] || 0) + 1 } }
    const all = document.getElementsByTagName('*').length, inWl = wl ? wl.getElementsByTagName('*').length : 0
    P.sec.push({ t: Math.round(t0), sid: wl?.dataset.sid ?? null, raf: calls, an: an.length, run, inf, names, wl: inWl, out: all - inWl, heap: performance.memory?.usedJSHeapSize ?? 0, logN: window.__logN ?? 0 })
    P.skip.push([Math.round(t0), Math.round(performance.now()) + 1])
  }, 2000)
}, [WEAK, E.START ?? '', E.LAG === '0', E.CATVIS === '1'])
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await cdp.send('Performance.enable')
if (E.PAINT_RECTS === '1') { await cdp.send('DOM.enable'); await cdp.send('Overlay.enable'); await cdp.send('Overlay.setShowPaintRects', { result: true }) } // PAINT_RECTS=1 (вместе с SHOTS=1) — на снимках зелёным подсвечено то, что браузер перекрашивал: видно, какая область экрана красится каждый кадр
page.on('pageerror', e => console.log('PAGEERROR', e.message, String(e.stack).split('\n').slice(0, 4).join(' | ')))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const log = [], metrics = [], shots = new Set(), TRACE = (E.TRACE || '').split(',').filter(Boolean)
let tracing = null, AT = E.AT ? E.AT.split(':') : null
const shot = async name => { if (!SHOTS || shots.has(name)) return; shots.add(name); await page.screenshot({ path: `${OUT}/${NAME}-${name}.png` }) }
const snap = async sid => { const m = await cdp.send('Performance.getMetrics'); metrics.push({ sid, at: Date.now(), m: Object.fromEntries(m.metrics.map(x => [x.name, x.value])) }) }
await page.goto(`${BASE}?seed=r1&ask=voice&only=stages&lines=1&meaning=1&perf=1${E.PROBE === '1' ? '&probe=1' : ''}${E.UNDER === '1' ? '&under=1' : ''}${E.DEBUG === '0' ? '&debug=0' : ''}${E.QS ?? ''}`) // QS='&rudelay=9000' — доп. параметры стенда
await page.waitForSelector('[data-testid="rotate-start"]:not([disabled])', { timeout: 30000 })
if (E.CSS) await page.addStyleTag({ content: E.CSS }) // CSS='…' — пробные стили поверх сборки (опыты «что стоит времени»)
await sleep(800)
if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })
await snap('start')
await page.tap('[data-testid="rotate-start"]') // касание, а не клик мышью: от клика в Chromium остаётся «курсор», и каждый сдвиг слоёв под ним стоит проверки попадания (HitTest ≈ 40 мс/с при CPU 4×) — на телефоне курсора нет
await page.waitForSelector('[data-testid="wl"]', { timeout: 30000 })
const t0 = Date.now(), done = new Set(), miaSids = new Set()
let again = null, skipA = 2, wrongA = 1, skipB = 2, skipMia = 0, hits = 0, lastSid = null, bossN = 0, sidAt = 0, stuckAt = 0, endAt = 0
const pillsNow = () => page.evaluate(() => [...document.querySelectorAll('.wlPill[data-held]:not([data-fail]):not([data-lock]):not([data-rise])')].map(el => { const r = el.getBoundingClientRect(); return { top: r.top, h: r.height } }).filter(p => p.top > 80 && p.top < 640))
const say = w => page.evaluate(x => { window.__sayQueue.length = 0; window.__sayQueue.push(x) }, w)
while (Date.now() - t0 < SECS * 1000) {
  const st = await page.evaluate(() => ({ sid: document.querySelector('[data-testid="wl"]')?.dataset.sid ?? null, hit: !!document.querySelector('[data-testid="race-mia-hit"]'), lines: window.__log.splice(0) }))
  for (const l of st.lines) log.push(l)
  const sid = st.sid
  if (sid !== lastSid) {
    lastSid = sid; sidAt = Date.now(); console.log(`${String(Date.now() - t0).padStart(7)} стадия ${sid}`); await snap(sid)
    if (TRACE.includes(sid) && !tracing) { tracing = sid; if (E.TRACE_DELAY) await new Promise(r => setTimeout(r, Number(E.TRACE_DELAY))) /* TRACE_DELAY=мс — трасса начинается позже входа в стадию (поймать ПЕРЕХОД в следующую: TRACE=sprint-ann TRACE_DELAY=3000); драйвер это время не отвечает на пилюли */; await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.stack', 'v8.execute', 'disabled-by-default-v8.cpu_profiler', ...(E.TRACE_INV === '1' ? ['disabled-by-default-devtools.timeline.invalidationTracking'] : [])] }) /* TRACE_INV=1 — ещё и кто именно требует пересчёта стилей */; setTimeout(async () => { writeFileSync(`${OUT}/${NAME}-trace-${tracing}.json`, await browser.stopTracing()); tracing = null }, Number(E.TRACE_MS || 10000)) } // TRACE=sprint,boss — трасса Chromium первых 10 с стадии (разбор: что именно стоит времени)
    if (/3$/.test(sid ?? '') && !miaSids.has(sid)) { miaSids.add(sid); if (miaSids.size === 2) skipMia = 1 } // второй «Допрос»: одно слово пропущено — Мия уходит одна, коробка остаётся
  }
  if (AT && sid === AT[0] && Date.now() - sidAt > Number(AT[1])) { const src = readFileSync(AT[2], 'utf8'); AT = null; console.log('AT:', JSON.stringify(await page.evaluate(`(async () => { ${src} })()`), null, 1)) } // AT=sid:мс:файл — в стадии sid через мс выполнить в странице тело функции из файла и напечатать ответ (разовые замеры)
  if (E.STOP && sid === E.STOP) break
  if (SHOTS && sid) { const dt = Date.now() - sidAt; for (const ms of [700, 2500, 5000]) if (dt > ms) await shot(`${sid}-${ms}`) }
  if (sid === 'summary') { endAt ||= Date.now(); if (Date.now() - endAt > 6000) break }
  if (st.hit && hits < 2 && log.some(l => /boss_pit_stuck/.test(l[1]))) { stuckAt ||= Date.now(); if (Date.now() - stuckAt > 2500) { const r = await page.evaluate(() => { const b = document.querySelector('[data-testid="race-mia-hit"]').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } }); await page.touchscreen.tap(r.x, r.y); await sleep(250); await page.touchscreen.tap(r.x, r.y); hits = 2 } }
  let pre = null
  for (let i = log.length - 1; i >= 0 && i > log.length - 400; i--) if (/\[race\] голос: повтор|\[phrase-voice\] перед ходом/.test(log[i][1])) { pre = log[i]; break }
  if (pre && !done.has(pre[0])) {
    const pills = await pillsNow(), ph = pre[1].match(/перед ходом «(.*?)» \((\w+)/)
    if (ph) {
      if (ph[2] === 'say') { if (pills.length) { done.add(pre[0]); await sleep(900); await page.evaluate(w => window.__phraseSay(w), ph[1].toLowerCase().replace(/[^a-z' ]/g, '')) } }
      else { const p = pills.find(x => x.top > 812 * 0.3); if (p) { done.add(pre[0]); await page.touchscreen.tap(187, p.top + p.h / 2) } }
    } else if (pills.length) {
      done.add(pre[0])
      const boss = /^boss2?$/.test(sid ?? ''), k = boss ? (EXAM[bossN++] ?? 'g') : 'g'
      if (sid === 'sprint' && skipA > 0) skipA--
      else if (sid === 'catch' && skipB > 0) skipB-- // две ошибки в проходе B — придёт второй «Допрос»
      else if (/3$/.test(sid ?? '') && skipMia > 0) skipMia--
      else if (k === 's') { /* молчим: «не успел» */ }
      else if (k === 'x' || (sid === 'sprint' && wrongA-- > 0)) await say('banana')
      else {
        const t = pre[1], sprint = !/говорит слово/.test(t)
        const w = sid === 'boss2' ? (t.match(/в записи слова «(.*?)»/)?.[1] ?? t.match(/на пилюле «(.*?)»/)?.[1]) : sprint ? t.match(/слово «(.*?)»/)?.[1] : t.match(/на пилюле «(.*?)»/)?.[1]
        again = { at: pre[0], w: (w ?? '').toLowerCase(), n: 0, t: 0 }; await say(again.w)
      }
    }
  } else if (again && pre?.[0] === again.at && again.n < 10 && Date.now() - again.t > 300) { // слово могло попасть в окно речи Пита / Мии (микрофон «не слушает») — повторяем, пока пилюля едет
    again.n++; again.t = Date.now()
    const left = await page.evaluate(() => document.querySelectorAll('.wlPill[data-held]:not([data-fail]):not([data-lock]):not([data-rise])').length)
    if (left) await page.evaluate(x => { if (!window.__sayQueue.length) window.__sayQueue.push(x) }, again.w)
  }
  await sleep(80)
}
await snap('end')
const perf = await page.evaluate(() => window.__perf)
const tail = await page.evaluate(() => window.__log.splice(0)); for (const l of tail) log.push(l)
writeFileSync(`${OUT}/${NAME}.json`, JSON.stringify({ cfg: { CPU, WEAK, PROBE: E.PROBE === '1', UNDER: E.UNDER === '1', DEBUG: E.DEBUG !== '0', EXAM, finished: lastSid === 'summary', secs: Math.round((Date.now() - t0) / 1000) }, perf, log, metrics }))
console.log(`готово: ${OUT}/${NAME}.json, стадия в конце ${lastSid}, кадров ${perf.f.length}, строк журнала ${log.length}`)
await ctx.close(); await browser.close()
