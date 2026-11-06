import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { roundKind, roundPlan, ROUND2_MIN_MS, STAGE_HOLD_MS } from './raceRound.js'
import { openingWords } from './raceBar.js'
import RaceRoundCharge from './RaceRoundCharge.jsx'
import { buildRaceStages } from './raceStages.js'
import { buildRaceActs } from './raceRecipe.js'
import { chargePlan } from './raceCharge.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'
import { extrasOf } from './raceWords.js'

vi.mock('../../shared/lib/deviceTier.js', () => ({ isWeakDevice: vi.fn(() => false) }))

// Зарядка бара посреди игры (CONCEPT_RACE.md, «Бар живёт весь разгон»): перед вторым кругом слова круга снова летят в бар без плашки, на объявлении этапа 2 бар морфится в плашку этапа 2.
const plan = (() => { const p = normalizePlan({ ...fixturePlan('three'), game: 'race' }); return { ...p, extraWords: extrasOf(p) } })()
const { stages } = buildRaceStages({ plan })
const at = sid => stages.findIndex(s => s.sid === sid)
// «Этап с плашкой и флагом charge» (бар сам становится плашкой): в игре с v3.3.118 такого нет (один этап «Вспомни на слух», проход B объявляется без плашки), но ветка 'stage' в raceRound.js жива — проверяем её на подставленной стадии
const withPlate = stages.map(s => (s.sid === 'catch-ann' ? { ...s, charge: true, round: { ...s.round, title: 'Вспомни на слух', task: 'задание этапа', brief: 'скажи слово' } } : s))

describe('какая зарядка у какой стадии', () => {
  it('sprint2-ann, catch-ann (проход B, «теперь наоборот») и catch2-ann — зарядка без плашки; объявление с плашкой и флагом charge — морф в плашку; первая стадия и обычные — без зарядки посреди игры', () => {
    expect(roundKind(stages, at('sprint2-ann'))).toBe('round2'); expect(roundKind(stages, at('catch2-ann'))).toBe('round2'); expect(roundKind(stages, at('catch-ann'))).toBe('round2')
    expect(stages[at('catch-ann')].round.title).toBe(''); expect(stages[at('catch-ann')].charge).toBeUndefined(); expect(stages[at('catch-ann')].line).toBe('race_catch_tap')
    expect(roundKind(withPlate, at('catch-ann'))).toBe('stage')
    expect(roundKind(stages, 0)).toBeNull() // начало игры — своя заставка (RaceCharge.jsx)
    expect(roundKind(stages, at('sprint'))).toBeNull(); expect(roundKind(stages, at('climb-ann'))).toBeNull(); expect(roundKind(stages, -1)).toBeNull()
  })
  it('стадия второго круга без плашки: у sprint2-ann нет названия и задания', () => {
    expect(stages[at('sprint2-ann')].round.title).toBe(''); expect(stages[at('sprint2-ann')].line).toBe('race_sprint_round2')
  })
  it('начало игры заряжает бар словами первого этапа (по сегменту на слово), а не всей памятью', () => {
    const acts = buildRaceActs(plan).acts, w = openingWords(acts)
    expect(w.map(x => x.text)).toEqual(acts[0].words.map(x => x.text)); expect(chargePlan(plan, 4000, w).segments.length).toBe(w.length)
    expect(openingWords([{ id: 'climb', words: ['a'] }])).toBeNull()
  })
})

describe('план зарядки', () => {
  const lines = null
  it('второй круг: слова второго круга летят в бар (сегмент на слово, в сумме 100 %), бар полный к концу, морфа и плашки нет', () => {
    const i = at('sprint2-ann'), words = stages[i + 1].words
    const p = roundPlan({ plan, stages, i, lines }); expect(p.kind).toBe('round2')
    expect(p.segments.length).toBe(words.length); expect(p.pills.length).toBe(words.length); expect(p.segments.at(-1).to).toBe(100)
    expect(p.totalMs).toBeGreaterThanOrEqual(ROUND2_MIN_MS); expect(p.segments.at(-1).at).toBe(p.totalMs) // последний сегмент — ровно к концу
    expect(p.o.morphAt).toBe(Infinity); expect(p.round.title).toBe('')
    expect(p.segments.map(s => s.color)).toEqual(p.pills.map(x => x.color)) // цвет сегмента = ступень слова
  })
  it('объявление с плашкой: слова круга, морф в плашку раньше её конца', () => {
    const i = at('catch-ann'), p = roundPlan({ plan, stages: withPlate, i, lines }); expect(p.kind).toBe('stage')
    expect(p.segments.length).toBe(stages[i + 1].words.length); expect(p.round.title).toBe('Вспомни на слух'); expect(p.round.task).toBeTruthy()
    expect(p.o.morphAt).toBeGreaterThanOrEqual(1000); expect(p.o.plateEnd - p.o.morphAt).toBeGreaterThan(STAGE_HOLD_MS - 1); expect(p.totalMs).toBe(Math.max(1000, Math.round(p.o.morphAt)))
  })
  it('проход B (catch-ann): слова прохода летят в бар без плашки и морфа', () => {
    const i = at('catch-ann'), p = roundPlan({ plan, stages, i, lines }); expect(p.kind).toBe('round2')
    expect(p.segments.length).toBe(stages[i + 1].words.length); expect(p.o.morphAt).toBe(Infinity); expect(p.round.title).toBe('')
  })
  it('воспроизводимо (одно семя — один план), у каждого показа свой поток; стадия без зарядки — null', () => {
    const i = at('sprint2-ann'), a = roundPlan({ plan, stages, i }), b = roundPlan({ plan, stages, i })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    const c = roundPlan({ plan, stages, i: at('catch-ann') }); expect(c.pills.map(x => x.x)).not.toEqual(a.pills.map(x => x.x).slice(0, c.pills.length))
    expect(roundPlan({ plan, stages, i: at('sprint') })).toBeNull()
  })
})

describe('разметка RaceRoundCharge', () => {
  const html = i => renderToStaticMarkup(createElement(RaceRoundCharge, { plan, stages, i, at: 1 }))
  it('второй круг: пилюли и бар без ореола и без плашки, data-round="2"', () => {
    const h = html(at('sprint2-ann'))
    expect(h).toContain('data-round="2"'); expect(h).not.toContain('raceChargeHalo'); expect(h).not.toContain('race-charge-plate'); expect(h).toContain('race-charge-pill'); expect(h).toContain('data-trail="true"')
  })
  it('объявление с плашкой: бар с ореолом (толщина перед плашкой), разметка заряда; проход B — как второй круг, без ореола', () => {
    const h = renderToStaticMarkup(createElement(RaceRoundCharge, { plan, stages: withPlate, i: at('catch-ann'), at: 1 })); expect(h).toContain('raceChargeHalo'); expect(h).not.toContain('data-round')
    expect(html(at('catch-ann'))).toContain('data-round="2"')
  })
  it('стадия без зарядки — пустая разметка', () => { expect(html(at('sprint'))).toBe('') })
})
