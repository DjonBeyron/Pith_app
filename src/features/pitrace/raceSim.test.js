import { describe, it, expect, vi } from 'vitest'
import { scoreRace, reportRace, MEDAL_TITLES } from './raceSim.js'
import { initRace, reduceRace } from './raceState.js'
import { buildRaceStages } from './raceStages.js'
import { loadSim, SIM_KEY, XP_DAILY_CAP, dayKey } from '../rehearsal/rehearsalSim.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'

const plan = normalizePlan({ ...fixturePlan('three'), game: 'race', seed: 's' })
const { stages } = buildRaceStages({ plan })
const stage = sid => stages.find(s => s.sid === sid)
const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) } }
function play(events) { let s = initRace(); for (const [t, sid, info] of events) s = reduceRace(s, { t, stage: stage(sid), info }).state; return s }
const ENTER_ALL = [['enter', 'sprint'], ['enter', 'catch']]
const words = stage('catch').words
words[2] = { ...words[2], trap: true } // в игре с v3.3.118 ловушек в проходе B нет; редюсер и итог их по-прежнему понимают — подставляем одну
const iBad = words.findIndex(w => !w.trap) // верная пилюля, на которой ошибёмся
const catchGold = words.flatMap((w, i) => (w.trap ? [['fail', 'catch', { idx: i }]] : [['claim', 'catch', { idx: i, ms: 1000 + i * 100 }], ['win', 'catch', { idx: i }]])) // верные — сказано, ловушки — пропущены
const goldRun = () => play([
  ...ENTER_ALL, ...stage('sprint').words.flatMap((_, i) => [['claim', 'sprint', { idx: i, ms: 900 }], ['win', 'sprint', { idx: i }]]),
  ...catchGold,
  ...[1, 2, 3, 4].flatMap(k => [['enter', `climb-${k}`], ['win', `climb-${k}`]]),
  ['win', 'descent-s'],
])

describe('итог гонки и симуляция памяти', () => {
  it('золото везде: разгон и слух без ошибок (ловушки пропущены), вершина — золото, спуск верно; Пит говорит «золото»; в итоге метрики и слабые слова', () => {
    const r = scoreRace(plan, goldRun())
    const n = stage('sprint').words.length
    expect(r.sprint).toEqual({ hit: n, total: n }); expect(r.catchOk).toBe(words.length); expect(r.catchTotal).toBe(words.length)
    expect(r.metrics.accuracy).toEqual({ sprint: { hit: n, total: n }, catch: { hit: words.length, total: words.length } }); expect(r.metrics.avgMs).toBeGreaterThan(0)
    expect(r.metrics.traps.dodged).toBe(r.metrics.traps.total); expect(r.weak.every(w => w.score === 0)).toBe(true)
    expect(r.medal).toBe('gold'); expect(r.descent).toBe('ok'); expect(r.gold).toBe(true); expect(r.phraseDone).toBe(true)
    expect(MEDAL_TITLES.gold).toBe('золото')
  })
  it('промахи: слово разгона с промахом — к повтору (miss), верная пилюля слуха с провалом и «поверил чужому переводу» тоже, ступень вершины тоже; золота нет', () => {
    const iTrap = words.findIndex(w => w.trap)
    const s = play([
      ...ENTER_ALL, ['win', 'sprint', { idx: 0 }], ['miss', 'sprint', { idx: 1 }], ['fail', 'sprint', { idx: 1 }], ['win', 'sprint', { idx: 2 }],
      ['fail', 'catch', { idx: iBad }], ['miss', 'catch', { idx: iTrap, believed: true }], ['fail', 'catch', { idx: iTrap }],
      ['enter', 'climb-1'], ['win', 'climb-1'], ['enter', 'climb-2'], ['fail', 'climb-2'], ['enter', 'climb-2'], ['fail', 'climb-2'],
      ['fail', 'descent-s'],
    ])
    const r = scoreRace(plan, s)
    expect(r.sprint.hit).toBe(2); expect(r.sprint.total).toBe(stage('sprint').words.length)
    expect(r.catchOk).toBe(0); expect(r.catchTotal).toBe(words.length); expect(r.metrics.traps).toEqual({ dodged: 0, total: words.filter(w => w.trap).length }); expect(r.medal).toBe('none'); expect(r.descent).toBe('miss'); expect(r.gold).toBe(false); expect(r.phraseDone).toBe(false)
    expect(r.misses).toBeGreaterThanOrEqual(5)
    expect(r.weak.find(w => w.text === words[iTrap].text).score).toBeGreaterThanOrEqual(2) // «поверил» записан на слово, которое сказал Пит
    const trying = r.words.find(w => w.text === 'trying') // ступень 2 — слово trying: на ней 2 промаха
    expect(trying.miss).toBeGreaterThan(0)
  })
  it('память как у репетиции: слово без промахов — следующий шаг лесенки, с промахом — завтра; пишется в sessionStorage; XP за слова «к повтору»', () => {
    const store = memory(), now = Date.UTC(2026, 10, 3, 12)
    const res = reportRace({ plan, race: goldRun(), store, now, log: () => {} })
    const sim = loadSim(store)
    expect(Object.keys(sim.words).length).toBeGreaterThan(0)
    expect(res.xp).toBeGreaterThan(0); expect(res.xp).toBeLessThanOrEqual(XP_DAILY_CAP); expect(sim.xpToday).toBe(res.xp)
    expect(sim.phrases[plan.phrase].consolidatedAt).toBe(dayKey(now))
    const bad = memory()
    reportRace({ plan, race: play([...ENTER_ALL, ['fail', 'sprint', { idx: 0 }]]), store: bad, now, log: () => {} })
    const word = Object.entries(loadSim(bad).words)[0]
    expect(word[1].dueOn).toBe(dayKey(now + 86400000)) // промах — завтра
    expect(bad.getItem(SIM_KEY)).toBeTruthy()
  })
  it('в журнал отладки идёт одна строка [race] итог', () => {
    const log = vi.fn()
    reportRace({ plan, race: goldRun(), store: memory(), log })
    expect(log).toHaveBeenCalledTimes(1); expect(log.mock.calls[0][0]).toMatch(/^\[race\] итог .*разгон (\d+)\/\1, слух (\d+)\/\2, ответ в среднем \d+ мс, вершина золото, спуск верно/)
  })
  it('XP не больше потолка дня, общего с репетицией; повторный итог в тот же день добирает только остаток', () => {
    const store = memory(), now = Date.UTC(2026, 10, 3, 12)
    store.setItem(SIM_KEY, JSON.stringify({ xpDay: dayKey(now), xpToday: XP_DAILY_CAP - 1, words: {}, phrases: {} }))
    const r = reportRace({ plan, race: goldRun(), store, now, log: () => {} })
    expect(r.xp).toBeLessThanOrEqual(1)
  })
})
