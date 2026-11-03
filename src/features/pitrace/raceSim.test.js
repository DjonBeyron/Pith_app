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
const ENTER_ALL = [['enter', 'sprint'], ['enter', 'catch-0'], ['enter', 'catch-1'], ['enter', 'catch-2']]
const goldRun = () => play([
  ...ENTER_ALL, ...Array.from({ length: 6 }, (_, i) => ['win', 'sprint', { idx: i }]),
  ['win', 'catch-0'], ['win', 'catch-1'], ['win', 'catch-2'],
  ...[1, 2, 3, 4].flatMap(k => [['enter', `climb-${k}`], ['win', `climb-${k}`]]),
  ['win', 'descent-s'],
])

describe('итог гонки и симуляция памяти', () => {
  it('золото везде: разгон 6/6, слух 3/3, вершина — золото, спуск верно; Пит говорит «золото»', () => {
    const r = scoreRace(plan, goldRun())
    expect(r.sprint).toEqual({ hit: 6, total: 6 }); expect(r.catchOk).toBe(3); expect(r.catchTotal).toBe(3)
    expect(r.medal).toBe('gold'); expect(r.descent).toBe('ok'); expect(r.gold).toBe(true); expect(r.phraseDone).toBe(true)
    expect(MEDAL_TITLES.gold).toBe('золото')
  })
  it('промахи: слово разгона с промахом — к повтору (miss), заход слуха с провалом и ступень вершины тоже; золота нет', () => {
    const s = play([
      ...ENTER_ALL, ['win', 'sprint', { idx: 0 }], ['miss', 'sprint', { idx: 1 }], ['fail', 'sprint', { idx: 1 }], ['win', 'sprint', { idx: 2 }],
      ['fail', 'catch-0'], ['win', 'catch-0'], ['win', 'catch-1'], ['fail', 'catch-2'],
      ['enter', 'climb-1'], ['win', 'climb-1'], ['enter', 'climb-2'], ['fail', 'climb-2'], ['enter', 'climb-2'], ['fail', 'climb-2'],
      ['fail', 'descent-s'],
    ])
    const r = scoreRace(plan, s)
    expect(r.sprint.hit).toBe(2); expect(r.sprint.total).toBe(6)
    expect(r.catchOk).toBe(2); expect(r.medal).toBe('none'); expect(r.descent).toBe('miss'); expect(r.gold).toBe(false); expect(r.phraseDone).toBe(false)
    expect(r.misses).toBeGreaterThanOrEqual(5)
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
    expect(log).toHaveBeenCalledTimes(1); expect(log.mock.calls[0][0]).toMatch(/^\[race\] итог .*разгон 6\/6, слух 3\/3, вершина золото, спуск верно/)
  })
  it('XP не больше потолка дня, общего с репетицией; повторный итог в тот же день добирает только остаток', () => {
    const store = memory(), now = Date.UTC(2026, 10, 3, 12)
    store.setItem(SIM_KEY, JSON.stringify({ xpDay: dayKey(now), xpToday: XP_DAILY_CAP - 1, words: {}, phrases: {} }))
    const r = reportRace({ plan, race: goldRun(), store, now, log: () => {} })
    expect(r.xp).toBeLessThanOrEqual(1)
  })
})
