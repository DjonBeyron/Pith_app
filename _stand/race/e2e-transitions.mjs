// E2E «стыки этапов» гонки (Playwright, 375×812, тап): играет проход A и B ВЕРНО (тап по пилюле с нужной подписью, строка журнала «[race] голос: повтор … на пилюле «X»»), пока не дойдёт до «Конвейера ситуаций», и проверяет по пробам каждые 80 мс:
//  • ТИШИНА: нет пилюль, плашки и стрелок дольше DEAD_MS — «тупёж» между этапами;
//  • НАЛОЖЕНИЕ: две плашки сразу; плашка поверх едущих слов; стрелки разворота вместе со словами или плашкой;
//  • РЕВЕРС В ПОСЛЕДНИЙ МОМЕНТ: от отъезда пилюль со стрелками до первого слова прохода B — не дольше REV_TO_WORD_MS (плашка этапа и три ноты — в этот промежуток).
// FAIL=1 — ученик молчит в проходе A (Мия вместо реверса), FAIL=2 — в проходе B (Мия после B: плашка «Допрос у Мии», пилюли снизу вниз на церемонии, круг Мии вниз): проверяет тот же набор.  Запуск: npx vite --port 5441 --strictPort; PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node _stand/race/e2e-transitions.mjs
import { chromium } from '@playwright/test'

const BASE = process.env.BASE || 'http://localhost:5441/_stand/race/index.html'
const FAIL = !!process.env.FAIL, SECS = Number(process.env.SECS || 160)
const DEAD_MS = 1500, REV_TO_WORD_MS = 4500
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, permissions: ['microphone'] })
await ctx.addInitScript(() => {
  localStorage.setItem('pithy_weak_device_v6', '0'); localStorage.setItem('pithy_debug', '1'); localStorage.setItem('pithy_debug_console', '1')
  window.__s = []; window.__m = []
  new MutationObserver(ms => { for (const m of ms) if (m.attributeName === 'data-up') window.__m.push({ t: Math.round(performance.now()), v: m.target.getAttribute('data-up'), sid: m.target.dataset.sid }) }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-up'] })
  setInterval(() => {
    const wl = document.querySelector('[data-testid="wl"]')
    const pills = [...document.querySelectorAll('.wlPill[data-held]:not([data-rise]):not([data-fail]):not([data-coast])')], coast = document.querySelectorAll('.wlPill[data-coast]').length
    window.__s.push({ t: Math.round(performance.now()), sid: wl?.dataset.sid ?? null, up: wl?.hasAttribute('data-up') ?? false, words: pills.filter(p => !p.hasAttribute('data-arrow')).length, arrows: pills.filter(p => p.hasAttribute('data-arrow')).length, coast, tr: getComputedStyle(document.querySelector('.wlLanes i'), '::before').transform.replace('matrix(', '').slice(0, 24), ry: parseFloat(document.querySelector('.wlLanes i')?.style.getPropertyValue('--run-y')) || 0, ay: (() => { const a = document.querySelector('.wlPill[data-arrow]'); return a ? Math.round(a.getBoundingClientRect().top) : null })(), plates: document.querySelectorAll('.wlTurn:not(.wlTurn--leave):not([data-out])').length })
  }, 80)
})
const page = await ctx.newPage()
const log = []
page.on('console', m => { const t = m.text(); if (t.startsWith('[PLAYER]')) log.push({ t: Date.now(), s: t.slice(9) }) })
page.on('pageerror', e => console.log('PAGEERROR', e.message))
const sleep = ms => new Promise(r => setTimeout(r, ms))
await page.goto(`${BASE}?seed=r1&ask=tap&only=stages`)
await page.waitForSelector('[data-testid="rotate-start"]:not([disabled])', { timeout: 30000 }); await sleep(800)
await page.click('[data-testid="rotate-start"]'); await page.waitForSelector('[data-testid="wl"]', { timeout: 15000 })
const t0 = Date.now(), done = new Set()
while (Date.now() - t0 < SECS * 1000) {
  const sid = await page.evaluate(() => document.querySelector('[data-testid="wl"]')?.dataset.sid ?? null)
  if (sid?.startsWith('phrases2')) { await sleep(1500); break } // круг «Пойми» (phrases1) вырезан: останавливаемся на входе в единственный круг фраз
  const pre = [...log].reverse().find(l => /\[race\] голос: повтор/.test(l.s))
  if (pre && !done.has(pre.t)) {
    const cap = pre.s.match(/на пилюле «(.*?)»/)?.[1]
    const pills = await page.evaluate(() => [...document.querySelectorAll('.wlPill[data-held]:not([data-fail]):not([data-lock]):not([data-rise]):not([data-arrow])')].map(el => { const r = el.getBoundingClientRect(); return { cap: el.dataset.cap, x: r.x + r.width / 2, y: r.y + r.height / 2, top: r.top, bottom: r.bottom } }))
    const p = pills.find(x => x.cap === cap && x.y > 160 && x.y < 700)
    if (process.env.DBG) console.log('driver', sid, cap, JSON.stringify(pills.map(x => [x.cap, Math.round(x.x), Math.round(x.y)])), p ? 'tap' : 'нет пилюли')
    if (p && !((process.env.FAIL === '1' && sid === 'sprint') || (process.env.FAIL === '2' && sid === 'catch'))) { done.add(pre.t); await page.touchscreen.tap(p.x, p.y) } else if (p) done.add(pre.t) // FAIL: в проходе A молчим
  }
  if (process.env.SHOTS && sid === (process.env.SHOTSID || 'catch-rev')) await page.screenshot({ path: `${process.env.SHOTS}/rev${String(Date.now() - t0).padStart(7, '0')}.png` })
  await sleep(50)
}
if (process.env.DBG) console.log(log.filter(l => /reverse|dodge/i.test(l.s)).slice(0, 40).map(l => l.s.slice(0, 200)).join('\n'))
if (process.env.DUMP) { const { writeFileSync } = await import('node:fs'); writeFileSync(process.env.DUMP, log.map(l => `${l.t - t0} ${l.s}`).join('\n')) }
const S = await page.evaluate(() => window.__s)
if (process.env.TRACE) console.log('data-up изменения:', JSON.stringify(await page.evaluate(() => window.__m)))
if (process.env.LOGRE) { const re = new RegExp(process.env.LOGRE), t1 = log[0]?.t ?? 0; for (const l of log) if (re.test(l.s)) console.log(`LOG +${l.t - t1} ${l.s.slice(0, 160)}`) } // LOGRE=регулярка — строки журнала игры с временем (диагностика задержек)
await ctx.close(); await browser.close()

const bad = []
const at = (a, b) => S.filter(s => s.t >= a && s.t < b)
let deadFrom = null
for (const s of S) {
  const live = s.words || s.plates || s.arrows || s.coast
  if (s.sid == null || (s.sid === 'sprint-ann' && !s.plates) || /3(-intro)?(-ann)?$/.test(s.sid)) { deadFrom = null; continue } // церемония и круг Мии, загрузка: загрузка и отсчёт тремя нотами после заставки (звук, не тишина)
  if (!live && deadFrom == null) deadFrom = s
  if (live && deadFrom != null) { if (s.t - deadFrom.t > DEAD_MS) bad.push(`ТИШИНА ${s.t - deadFrom.t} мс (sid ${deadFrom.sid} → ${s.sid}) с t=${deadFrom.t}`); deadFrom = null }
  if (s.plates > 1) bad.push(`НАЛОЖЕНИЕ плашек (${s.plates}) на t=${s.t}, sid ${s.sid}`)
  if (s.plates && s.words > 0 && !/^(phrases|climb)/.test(s.sid ?? '')) bad.push(`ПЛАШКА поверх слов на t=${s.t}, sid ${s.sid}`)
  if (s.arrows && s.coast) bad.push(`ИНФО: стрелки при доезжающих пилюлях прошлой ступени на t=${s.t}`) // допустимо: старые пилюли доезжают сами
  if (s.arrows && (s.words || s.plates)) bad.push(`СТРЕЛКИ вместе со ${s.words ? 'словами' : 'плашкой'} на t=${s.t}, sid ${s.sid}`)
}
const g0 = S.findIndex(s => s.arrows > 0), revEnd = g0 < 0 ? null : S.slice(g0).find((s, i, a) => s.arrows === 0 && a[i - 1]?.arrows > 0), firstB = S.find(s => s.sid === 'catch' && s.words > 0)
if (revEnd && firstB) { const gap = firstB.t - revEnd.t; console.log(`реверс → первое слово B: ${gap} мс (стрелки ушли на t=${revEnd.t}, слово B на t=${firstB.t})`); if (gap > REV_TO_WORD_MS) bad.push(`РЕВЕРС не в последний момент: ${gap} мс до первого слова B`) }
else if (process.env.FAIL !== '1') bad.push('разворот не найден (нет стрелок или слов B)')
if (process.env.FAIL === '2') { // Мия после B: стрелки второй раз (снизу вниз), круг Мии (catch3) идёт вниз
  const back = S.filter(s => s.arrows > 0 && /^catch3/.test(s.sid ?? '')), m3 = S.filter(s => s.sid === 'catch3' && s.words > 0)
  console.log(`Мия после B: проб со стрелками на церемонии ${back.length}, проб со словами круга Мии ${m3.length}, data-up в круге Мии: ${m3.some(s => s.up)}`)
  if (!back.length) bad.push('Мия после B: стрелок на церемонии нет'); if (m3.some(s => s.up)) bad.push('Мия после B: круг Мии идёт вверх (data-up)')
  const pl = S.find(s => s.sid === 'catch3-ann' && s.plates); if (!pl) bad.push('Мия после B: плашки «Допрос у Мии» нет (она идёт на церемонии, пока Мия говорит за кадром)')
}
if (process.env.TRACE) { const g = S.findIndex(x => x.arrows > 0); console.log('t(мс от выезда) | пилюля top | сдвиг узора --run-y'); for (let i = Math.max(0, g - 6); i < Math.min(S.length, g + 60); i += 2) console.log(`${S[i].t - S[g].t} | ${S[i].ay} | ${S[i].ry} ${S[i].up ? 'up' : ''} ${S[i].tr}`) }
const sids = []; for (const s of S) if (s.sid !== sids.at(-1)?.sid) sids.push({ sid: s.sid, t: s.t })
console.log('стадии:', sids.map(x => `${x.sid}@${x.t}`).join(' '))
const real = bad.filter(x => !x.startsWith('ИНФО'))
console.log(`инфо: ${bad.length - real.length} проб со стрелками при доезжающих пилюлях`)
console.log(real.length ? `ПРОБЛЕМЫ (${real.length}):\n${[...new Set(real)].slice(0, 30).join('\n')}` : 'OK: тишины, наложений и опоздавшего реверса нет')
process.exit(real.length ? 1 : 0)
