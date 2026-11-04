import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useRaceActs } from './useRaceActs.js'
import { buildRaceStages } from './raceStages.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'
import { normalizeLines } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { hasIntroLine, neededTexts, firstLines } from '../rehearsal/rehearsalPrepare.js'
import { nextPlan, readRehearsalCfg } from '../rehearsal/rehearsalCfg.js'

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const racePlan = (extra = {}) => normalizePlan({ ...fixturePlan('three'), game: 'race', ...extra })

// Директор гонки без React-рантайма (эффекты на сервере не идут): функции, которые директор игры зовёт в обработчиках
function probe(stageSid, over = {}, plan = racePlan()) {
  const out = {}
  const stages = buildRaceStages({ plan, rate: 1, lib: () => null }).stages
  const sayLine = vi.fn(), sayText = vi.fn()
  const stageObj = stages.find(s => s.sid === stageSid)
  function P() {
    Object.assign(out, useRaceActs({ plan, stages, stage: 'run', at: 0, stageObj, setS() {}, sayLine, sayText, cat: { busyLeft: () => 0 }, lines: normalizeLines(null), rate: 1, listenerRef: { current: null }, ...over }))
    return null
  }
  renderToStaticMarkup(createElement(P))
  return { rh: out, stages, sayLine, sayText }
}

describe('useRaceActs: директор гонки поверх директора репетиции', () => {
  it('без плана гонки возвращает то же, что useRehearsalActs: нет rh.race, обычные failLine / rec', () => {
    const plan = normalizePlan(fixturePlan('three'))
    const out = {}
    const stages = []
    function P() { Object.assign(out, useRaceActs({ plan, stages, stage: 'run', at: 0, stageObj: null, setS() {}, sayLine() {}, sayText() {}, cat: { busyLeft: () => 0 }, lines: null, rate: 1, listenerRef: { current: null } })); return null }
    renderToStaticMarkup(createElement(P))
    expect(out.race).toBeUndefined(); expect(out.on).toBe(true); expect(out.failLine({ act: 'build' })).toBeNull()
  })
  it('разгон: серия 3 — «ну, погнали», серия 5 — «огонь»; промах обнуляет серию', () => {
    const { rh, sayLine } = probe('sprint')
    for (let i = 0; i < 5; i++) rh.rec('win', { idx: i })
    expect(sayLine.mock.calls.map(c => c[0])).toEqual(['race_sprint_streak', 'race_sprint_fire'])
    rh.rec('miss', { idx: 5 }); rh.rec('win', { idx: 6 }); rh.rec('win', { idx: 7 }); rh.rec('win', { idx: 8 })
    expect(sayLine.mock.calls.map(c => c[0]).filter(x => x === 'race_sprint_streak')).toHaveLength(2) // после промаха серия набирается заново
  })
  it('на «не успел» директор игры реплик не говорит (failLine пуст): «ой, соскользнул» «Вершины» и «мимо» слуха говорит редюсер', () => {
    const { rh, stages } = probe('sprint')
    for (const sid of ['sprint', 'descent-s', 'climb-1']) expect(rh.failLine(stages.find(s => s.sid === sid))).toBe('')
  })
  it('слух: провал захода — «мимо, слушай ещё»; верное слово — без реплики', () => {
    const a = probe('catch-0'); a.rh.rec('fail', undefined)
    expect(a.sayLine.mock.calls.map(c => c[0])).toEqual(['race_catch_miss'])
    const b = probe('catch-0'); b.rh.rec('win', undefined)
    expect(b.sayLine).not.toHaveBeenCalled()
  })
  it('вершина: nextIdx идёт на ступень k + 1 после попадания, остаётся после промаха на первой ступени; «ой, соскользнул» на промахе, а на 2-м промахе ступени Пит говорит слово голосом вместо него', () => {
    const win = probe('climb-1'); win.rh.rec('win')
    expect(win.stages[win.rh.nextIdx(win.stages.findIndex(s => s.sid === 'climb-1') + 1)].sid).toBe('climb-2')
    const p = probe('climb-2'); const i2 = p.stages.findIndex(s => s.sid === 'climb-2')
    p.rh.rec('fail') // стоим на земле: цель — ступень 1 (директор не видел win), ступень не растёт
    expect(p.stages[p.rh.nextIdx(i2 + 1)].sid).toBe('climb-1')
    const h = probe('climb-1')
    h.rh.rec('fail'); expect(h.sayText).not.toHaveBeenCalled(); expect(h.sayLine.mock.calls.map(c => c[0])).toEqual(['race_climb_slip'])
    h.rh.rec('fail'); expect(h.sayText).toHaveBeenCalledWith("I'm") // подсказка: новое слово ступени голосом
    expect(h.sayLine.mock.calls.map(c => c[0])).toEqual(['race_climb_slip']) // на подсказке соскальзывание без реплики: говорит слово
  })
  it('вершина: сказал не то (miss) — соскальзывание и директор сам перезапускает стадию ступени (setS на нужный индекс с новой отметкой времени); на «Спуске» и слухе miss ничего не перезапускает', () => {
    const setS = vi.fn()
    const h = probe('climb-2', { setS })
    h.rh.rec('win') // стоим на 1-м острове (директор видит win ступени 1 как событие текущей стадии)
    h.rh.rec('miss')
    expect(h.sayLine.mock.calls.map(c => c[0])).toEqual(['race_climb_slip'])
    expect(setS).toHaveBeenCalledTimes(1)
    const next = setS.mock.calls[0][0]({ idx: 99, at: 0, stage: 'run' })
    expect(next).toMatchObject({ stage: 'run', hint: [], leaving: -1 }); expect(h.stages[next.idx].sid).toMatch(/^climb-\d$/); expect(next.at).toBeGreaterThanOrEqual(0)
    const c = probe('catch-0', { setS }); c.rh.rec('miss'); expect(setS).toHaveBeenCalledTimes(1)
  })
  it('вершина: ловушка — на промахе директор спрашивает у слушателя, что услышано; двойник слова ступени 4 — «мимо, это двойник» (озвучки нет) вместо «соскользнул», подсказка голосом не нужна; прочее слово — обычный промах', () => {
    const run = heard => {
      const h = probe('climb-4', { listenerRef: { current: { heard: () => heard } }, setS() {} })
      for (let i = 0; i < 3; i++) h.rh.rec('win') // стоим на ступени 3
      h.rh.rec('miss', {})
      return h
    }
    const trap = run('earn')
    expect(trap.sayLine.mock.calls).toEqual([['race_trap_short', { caption: 'это earn, а нужно learn' }]]); expect(trap.sayText).not.toHaveBeenCalled()
    const plain = run('table')
    expect(plain.sayLine.mock.calls.map(c => c[0])).toEqual(['race_climb_slip'])
    expect(read('./useRaceActs.js')).toContain('listenerRef?.current?.heard?.()')
  })
  it('вершина: общий таймер — директор следит за временем (эффект), а по концу ведёт на плашку climb-time; проводка в коде', () => {
    const src = read('./useRaceActs.js')
    expect(src).toContain("apply({ t: 'timeout', stage: running })"); expect(src).toContain('climbStageIdx(stages, box.s.climb)'); expect(src).toContain('leftMs({ t0: clT0, wins: clWins }')
  })
  it('вступление race_start — в полной гонке; у одного раунда его нет; первые реплики, тексты и «Ещё заезд» держат game: race', () => {
    expect(hasIntroLine(racePlan())).toBe(true); expect(hasIntroLine(racePlan({ round: 'catch' }))).toBe(false)
    expect(firstLines(racePlan())).toEqual(['race_start', 'race_sprint']); expect(firstLines(racePlan({ round: 'climb' }))).toEqual(['race_climb'])
    expect(neededTexts(racePlan())).toEqual(expect.arrayContaining(['learn', 'earn', 'to learn']))
    expect(neededTexts(racePlan()).length).toBeGreaterThan(neededTexts(normalizePlan(fixturePlan('three'))).length) // добор «Разгона»
    const next = nextPlan(racePlan()); expect(next.game).toBe('race'); expect(next.run).toBe(1); expect(next.phrase).not.toBe(racePlan().phrase)
    expect(readRehearsalCfg(racePlan()).title).toBe('Гонка с Питом')
    expect(nextPlan(normalizePlan(fixturePlan('three'))).game).toBeUndefined()
  })
  it('проводка: игра зовёт директор гонки, спуск включает setRateBoost 1,1, итог — reportRace; журнал — строки [race]', () => {
    const src = read('./useRaceActs.js')
    expect(src).toContain("setRateBoost(descent ? DESCENT_RATE : 1)"); expect(src).toContain('reportRace({ plan, race: box.s })'); expect(src).toContain("pLog(`[race] ${r.log}`)")
    expect(src).toContain("res.gold ? 'race_done_gold' : 'race_done'")
    expect(read('../rehearsal/useRehearsalActs.js')).toContain("running?.type !== 'summary' || race") // итог гонки не считает директор репетиции
  })
})
