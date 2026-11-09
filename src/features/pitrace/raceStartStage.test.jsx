import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildRaceStages } from './raceStages.js'
import { buildRaceActs } from './raceRecipe.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { START_STAGE_KEY, readStartStage, writeStartStage, actOfSid, fromStage, withStart } from './raceStartStage.js'
import useRaceStartStage, { startOptions, cfgWithStart } from './useRaceStartStage.js'
import { RaceAskScene } from './RaceAskPlate.jsx'
import { raceHasStart } from './raceTexts.js'
import { earlyStageLine } from './raceOpening.js'
import { reportRace } from './raceSim.js'
import { memoryOn } from './raceMemory.js'
import { initRace } from './raceState.js'
import { SIM_KEY } from '../rehearsal/rehearsalSim.js'

// «Начать с этапа» (отладка, admin): пункты из стадий, очередь стадий с выбранного этапа, нейтральное состояние, итог без памяти и XP, селектор только при отладке
const memory = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m } }
const plan = (extra = {}) => normalizePlan({ ...fixturePlan('three'), game: 'race', phrases: PHRASE_FIXTURE, ...extra })
const LABELS = ['Пинг-понг A, круг 2', 'Пинг-понг B', 'Пинг-понг B, круг 2', 'Фразы: Пойми', 'Фразы: Скажи / Узнай', 'Вершина', 'Спуск', 'Итог']

describe('пункты «Начать с»', () => {
  it('из стадий полной гонки: второй круг, проход B, круги фраз, вершина, спуск, итог; первая стадия — это «с начала»', () => {
    const opts = startOptions(plan())
    expect(opts.map(o => o.label)).toEqual(LABELS)
    expect(opts.map(o => o.sid)).toEqual(['sprint2-ann', 'catch-ann', 'catch2-ann', 'phrases-ann', 'phrases2-ann', 'climb-ann', 'descent-ann', 'summary'])
    expect(opts.map(o => actOfSid(o.sid))).toEqual(['sprint', 'catch', 'catch', 'phrases', 'phrases', 'climb', 'descent', 'summary'])
  })
  it('пункты — только этапы, которые есть у плана (нет этапа в рецепте — нет пункта); не гонка — пусто', () => {
    for (const id of ['one', 'two', 'none']) {
      const p = normalizePlan({ ...fixturePlan(id), game: 'race' }), acts = buildRaceActs(p, false, true).acts.map(a => a.id)
      expect(startOptions(p).every(o => acts.includes(actOfSid(o.sid)))).toBe(true)
    }
    expect(startOptions({ game: 'x' })).toEqual([])
  })
  it('выбор помнит localStorage pithy_race_start_stage_v1, по умолчанию — с начала', () => {
    const s = memory()
    expect(START_STAGE_KEY).toBe('pithy_race_start_stage_v1'); expect(readStartStage(s)).toBe('')
    writeStartStage('climb-ann', s); expect(readStartStage(s)).toBe('climb-ann')
    writeStartStage('', s); expect(s.m.has(START_STAGE_KEY)).toBe(false)
    expect(readStartStage({ getItem() { throw new Error('нет') } })).toBe('')
  })
})

describe('очередь стадий со старта с этапа', () => {
  const opts = startOptions(plan())
  for (const tap of [false, true]) {
    for (const o of opts) {
      it(`${tap ? 'пальцами' : 'голосом'}: «${o.label}» — первой идёт её плашка, предыдущих этапов нет`, () => {
        const p = withStart(plan(), o)
        const { stages } = buildRaceStages({ plan: p, tap, ru: true })
        const head = stages[0].switchTo === 'ru' ? stages[1] : stages[0] // проход B голосом: сначала переключение слуха на русскую модель
        expect(head.sid).toBe(o.sid)
        expect(stages.map(s => s.idx)).toEqual(stages.map((_, i) => i))
        const full = buildRaceStages({ plan: plan(), tap, ru: true }).stages
        const before = full.slice(0, full.findIndex(s => s.sid === o.sid)).filter(s => !s.switchTo).map(s => s.sid)
        for (const sid of before) expect(stages.some(s => s.sid === sid)).toBe(false)
        if (stages[0].type === 'announce') expect(stages[0]).toMatchObject({ charge: true, count: 'after' }) // первая плашка — как у начала игры (бар заставки, три ноты)
      })
    }
  }
  it('голосом с прохода B — переключение слуха на русскую модель остаётся первым', () => {
    const { stages } = buildRaceStages({ plan: withStart(plan(), { sid: 'catch2-ann', label: 'x' }), tap: false, ru: true })
    expect(stages.slice(0, 2).map(s => s.sid)).toEqual(['catch-sw', 'catch2-ann'])
  })
  it('второй круг прохода A: слова вписаны (как будто все слабые), рецепт без актов до этапа', () => {
    const p = withStart(plan(), { sid: 'sprint2-ann', label: 'x' })
    const { stages } = buildRaceStages({ plan: p, tap: false, ru: true })
    const r2 = stages.find(s => s.sid === 'sprint2')
    expect(r2.words.length).toBeGreaterThanOrEqual(2); expect(r2.step.reps).toHaveLength(r2.words.length)
    expect(buildRaceActs(withStart(plan(), { sid: 'climb-ann', label: 'x' }), false, true).acts.map(a => a.id)).toEqual(['climb', 'descent', 'summary'])
    expect(fromStage([{ id: 'sprint' }, { id: 'catch' }], undefined).map(a => a.id)).toEqual(['sprint', 'catch'])
  })
  it('старт с этапа — без стартовой фразы, сразу реплика первой плашки', () => {
    const p = withStart(plan(), { sid: 'climb-ann', label: 'Вершина' })
    expect(raceHasStart(p)).toBe(false); expect(raceHasStart(plan())).toBe(true)
    expect(earlyStageLine(p, buildRaceStages({ plan: p, tap: false, ru: true }).stages)).toBe('race_climb')
  })
})

describe('итог при старте с этапа: память и XP не пишутся', () => {
  it('reportRace не трогает память сессии, XP 0, строка в журнале; memoryOn — нет', () => {
    const p = { ...withStart(plan(), { sid: 'summary', label: 'Итог' }), source: 'lesson' }
    const store = memory(), log = []
    const res = reportRace({ plan: p, race: initRace(), store, now: Date.now(), log: l => log.push(l) })
    expect(res.xp).toBe(0); expect(store.m.has(SIM_KEY)).toBe(false)
    expect(log[0]).toBe('[race] старт с этапа «Итог» (отладка): память и XP не пишутся')
    expect(memoryOn(p)).toBe(false); expect(memoryOn({ ...plan(), source: 'lesson' })).toBe(true)
    reportRace({ plan: plan(), race: initRace(), store, now: Date.now(), log: () => {} }); expect(store.m.has(SIM_KEY)).toBe(true) // обычный старт пишет
  })
  it('cfgWithStart: без этапа — тот же cfg', () => {
    const cfg = { plan: plan() }
    expect(cfgWithStart(cfg, null)).toBe(cfg)
    expect(cfgWithStart(cfg, { sid: 'climb-ann', label: 'Вершина' }).plan).toMatchObject({ startAt: 'climb-ann', startLabel: 'Вершина', debugStart: true })
  })
})

describe('селектор на плашке — только при отладке', () => {
  const Probe = ({ store, p }) => { const { start } = useRaceStartStage(p, store); return createElement(RaceAskScene, { choice: 'voice', onPick() {}, onCancel() {}, start }) }
  const html = store => renderToStaticMarkup(createElement(Probe, { store, p: plan() }))
  it('без флага отладки селектора нет', () => {
    expect(html(memory())).not.toContain('race-ask-start')
    expect(renderToStaticMarkup(createElement(RaceAskScene, { choice: 'voice', onPick() {}, onCancel() {} }))).not.toContain('race-ask-start')
  })
  it('pithy_wl_debug_v1 = 1 — «Начать с:», «с начала» и этапы; запомненный этап выбран', () => {
    const out = html(memory({ pithy_wl_debug_v1: '1', [START_STAGE_KEY]: 'climb-ann' }))
    expect(out).toContain('data-testid="race-ask-start-select"'); expect(out).toContain('Начать с:'); expect(out).toContain('с начала')
    for (const l of LABELS) expect(out).toContain(l)
    expect(out).toMatch(/<option value="climb-ann" selected="">/)
  })
})
