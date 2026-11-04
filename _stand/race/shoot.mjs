// Скриншоты стенда «Гонка с Питом» (Playwright, 375×812): ROUND=sprint|catch|climb|descent|full node _stand/race/shoot.mjs (ROUND=climb CLIMB=timeout — снять «время вышло»)
// Dev-сервер: npx vite --port 5411 --strictPort; PW_CHROMIUM_PATH=/opt/pw-browsers/chromium; OUT=каталог для картинок (по умолчанию /tmp/raceshots).
// Речь человека — очередь window.__sayQueue стенда (index.html): драйвер читает экран (подписи пилюль, лестницу, номер ступени) и «говорит» нужные слова; специально делает промахи, чтобы показать серию, проявление слова, соскальзывание и подсказку.
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:5411/_stand/race/index.html'
const OUT = process.env.OUT || '/tmp/raceshots'
const ROUND = process.env.ROUND || 'sprint'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const TR = { 'пытаюсь': 'trying', 'учиться': 'learn', 'я': "i'm", 'приятно': 'nice', 'встретить': 'meet', 'где': 'where', 'откуда': 'from', 'помнить': 'remember' }

async function open(query) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ['microphone'] })
  await ctx.addInitScript(() => localStorage.setItem('pithy_weak_device_v6', '0')) // headless Chromium без GPU считается «слабым» (lite): снимки — как на обычном телефоне
  const page = await ctx.newPage()
  page.on('pageerror', e => console.log('PAGEERROR', e.message))
  page.on('console', m => { const t = m.text(); if (/\[race\]/.test(t)) console.log('LOG', t) })
  await page.goto(`${BASE}?${query}`)
  await page.waitForSelector('[data-testid="rotate-start"]:not([disabled])', { timeout: 30000 })
  await page.click('[data-testid="rotate-start"]')
  await page.waitForSelector('[data-testid="wl"]', { timeout: 30000 })
  return { ctx, page }
}
const shot = async (page, name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name) }
const say = (page, text) => page.evaluate(t => window.__sayQueue.push(t), text)
const root = page => page.evaluate(() => { const r = document.querySelector('[data-testid="wl"]'); return r ? { act: r.dataset.act, sid: r.dataset.sid, phase: r.dataset.phase, streak: r.dataset.streak } : null })
const waitSid = (page, sid, timeout = 60000) => page.waitForFunction(s => document.querySelector('[data-testid="wl"]')?.dataset.sid === s, sid, { timeout, polling: 50 })
const waitAct = (page, act, timeout = 90000) => page.waitForFunction(a => document.querySelector('[data-testid="wl"]')?.dataset.act === a, act, { timeout, polling: 50 })

// «Разгон»: на каждую видимую пилюлю с подписью-переводом говорим английское слово; пилюля №missAt — чужое слово (промах), №skipAt — молчим (не успел)
async function sprint(page, { missAt = -1, skipAt = -1, shots = true } = {}) {
  const handled = new Set()
  let n = 0, gold = false, miss = false, fail = false, first = false
  const end = Date.now() + 90000
  while (Date.now() < end) {
    const r = await root(page)
    if (!r || r.act !== 'sprint') { if (n > 0) break; await sleep(100); continue }
    const pills = await page.evaluate(() => [...document.querySelectorAll('.wlPill[data-held][data-cap]:not([data-fail]):not([data-lock]):not([data-rise])')].map(el => { const b = el.getBoundingClientRect(); return { id: el.getAttribute('data-cap'), cap: el.getAttribute('data-cap'), top: b.top, bottom: b.bottom } })) // у пилюли пула один элемент на разные повторы: личность — подпись (слово в разгоне одно)
    for (const p of pills) {
      if (handled.has(p.id) || p.top < 4 || p.bottom > 700) continue
      if (shots && !first) { first = true; await shot(page, '10-sprint-pills'); }
      handled.add(p.id)
      if (n === skipAt) { console.log('skip', p.cap) } else await say(page, n === missAt ? 'table' : TR[p.cap] ?? 'nothing')
      n += 1
    }
    if (shots && !gold && (await root(page))?.streak === 'gold') { gold = true; await sleep(250); await shot(page, '11-sprint-streak-gold') }
    if (shots && !fail && (await page.$('.wlPill[data-reveal]'))) { fail = true; await sleep(700); await shot(page, '12-sprint-reveal') }
    miss ||= false
    await sleep(80)
  }
  console.log('sprint pills handled', n)
}

// «Слушай и лови»: слово называет Пит ДО пилюль (в стенде — гудок), драйвер знает ответ из window.__race и говорит его через ~3,4 с после выезда пилюль (когда открылась последняя);
// первый заход — чужое слово из словаря (провал, заход повторится), потом верное; дальше два захода сразу верно
async function catchRound(page, { wrongFirst = true } = {}) {
  const sets = await page.evaluate(() => window.__race.catches.map(c => ({ text: c.text, decoys: c.decoys })))
  const fresh = () => page.waitForFunction(() => document.querySelectorAll('.wlPill[data-held][data-cap]:not([data-fail]):not([data-reveal])').length >= 3, null, { timeout: 20000, polling: 30 })
  for (let i = 0; i < sets.length; i++) {
    await waitSid(page, `catch-${i}`)
    await sleep(350)
    const early = await page.evaluate(() => document.querySelectorAll('.wlPill[data-held][data-cap]').length) // слово Пита уже звучит, пилюль на экране ещё нет
    console.log(`catch-${i}: пилюль сразу после начала захода ${early} (ожидается 0)`)
    if (i === 0) await shot(page, '19-catch-word-first')
    await fresh()
    await sleep(1800); if (i === 0) await shot(page, '20-catch-pills')
    await sleep(1600) // слово Пита уже прозвучало
    if (i === 0 && wrongFirst) {
      const wrong = (await page.evaluate(() => window.__race.sprint.map(w => w.text))).find(w => w !== sets[0].text)
      await say(page, wrong); await sleep(900); await shot(page, '21-catch-wrong')
      await sleep(1500); await fresh() // заход повторяется с тем же словом
      await sleep(3400)
    }
    await say(page, sets[i].text); await sleep(650)
    if (i < 2) await shot(page, i === 0 ? '22-catch-win' : '23-catch-win-2')
    await sleep(1400)
  }
}

// «Вершина»: ступени 1–2 берём (снимки сальто и приземления), на 3-й — чужое слово (соскок вниз), потом берём всё до верха. CLIMB=timeout: берём две ступени и молчим — ждём, пока выйдет общее время
async function climb(page, { timeout = false } = {}) {
  const words = await page.evaluate(() => window.__race.climb)
  const target = () => page.evaluate(() => { const t = document.querySelector('.raceIsland[data-target]'); return t ? Number(t.style.getPropertyValue('--k')) : 0 })
  await page.waitForSelector('.raceClimb', { timeout: 60000 }); await sleep(700); await shot(page, '30-climb-start')
  if (process.env.SIDS) await page.evaluate(() => { let last = ''; const t0 = performance.now(); setInterval(() => { const sid = document.querySelector('[data-testid="wl"]')?.dataset.sid; if (sid !== last) { last = sid; console.log('[race] sid ' + sid + ' +' + Math.round(performance.now() - t0)) } }, 50) }) // SIDS=1: когда меняются стадии
  let slipped = false
  const end = Date.now() + 170000
  while (Date.now() < end) {
    if (await page.$('[data-testid="race-top-plate"]')) { await sleep(600); await shot(page, '36-climb-top'); break }
    if (await page.$('[data-testid="race-time-up"]')) { await sleep(500); await shot(page, '37-climb-time-up'); break }
    const r = await root(page)
    if (r?.act !== 'climb') { await sleep(150); continue }
    const k = await target()
    if (!k) { await sleep(150); continue }
    await waitSid(page, `climb-${k}`, 8000).catch(() => {}) // говорим только когда идёт стадия именно этой ступени (раньше речь пропадает)
    await sleep(300) // пилюля уже стоит
    if (timeout && k === 3) { await sleep(2000); continue } // молчим: общий таймер дойдёт до нуля
    if (k === 3 && !slipped) { await say(page, 'table'); await sleep(250); await shot(page, '34-climb-slip-mid'); await sleep(900); await shot(page, '35-climb-slipped'); slipped = true; await sleep(800); continue }
    console.log('say k=' + k, new Date().toISOString().slice(11, 23)); await say(page, words.slice(0, k).join(' ').toLowerCase())
    if (k === 2) { await sleep(330); await shot(page, '31-climb-salto-mid'); await sleep(700); await shot(page, '32-climb-landed') } else await sleep(500)
    await sleep(400)
  }
}

// «Спуск»: Пит читает с подсветкой, потом человек говорит всю фразу
async function descent(page) {
  const chunks = await page.evaluate(() => window.__race.chunks)
  await waitSid(page, 'descent-d'); await sleep(900); await shot(page, '40-descent-read')
  await waitSid(page, 'descent-s'); await sleep(1500); await shot(page, '41-descent-answer')
  await say(page, chunks.join(' ').toLowerCase()); await sleep(900); await shot(page, '42-descent-win')
}

async function full(page) {
  await sleep(1200); await shot(page, '01-start')
  await waitAct(page, 'sprint'); await sprint(page, { missAt: 4, shots: true })
  await waitAct(page, 'catch'); await catchRound(page)
  await waitAct(page, 'climb'); await climb(page)
  await waitAct(page, 'descent', 120000); await descent(page)
  await page.waitForSelector('[data-testid="race-summary"]', { timeout: 60000 }); await sleep(900); await shot(page, '50-summary')
}

const { ctx, page } = await open(`only=${ROUND === 'full' ? '' : ROUND}&seed=r1`)
try {
  if (ROUND === 'sprint') { await sleep(1500); await shot(page, '09-sprint-start'); await sprint(page, { missAt: 4 }) }
  else if (ROUND === 'catch') await catchRound(page)
  else if (ROUND === 'climb') await climb(page, { timeout: process.env.CLIMB === 'timeout' })
  else if (ROUND === 'descent') await descent(page)
  else await full(page)
  await sleep(2000)
  await shot(page, '99-end')
  const lines = await page.evaluate(async () => (await import('/src/shared/lib/debug.js')).getPlayerLines())
  console.log(lines.filter(l => l.includes('[race]')).join('\n')) // журнал гонки: то, что получит «Скачать отладку»
} finally { await ctx.close(); await browser.close() }
