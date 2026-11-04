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
  it('разгон: на принятии слова Пит говорит мини-реплику успеха по плану (первое слово и далее раз в 3–4), «ну, погнали» и «огонь» не звучат', () => {
    const { rh, sayLine, stages } = probe('sprint')
    const st = stages.find(s => s.sid === 'sprint')
    for (let i = 0; i < st.words.length; i++) rh.claim({ idx: i })
    expect(sayLine.mock.calls.map(c => c[0])).toEqual(st.good.map(g => g.id))
    expect(sayLine.mock.calls.length).toBeGreaterThanOrEqual(2)
    for (let i = 0; i < 5; i++) rh.rec('win', { idx: i })
    expect(sayLine.mock.calls.map(c => c[0]).some(x => /streak|fire/.test(x))).toBe(false) // победа слов серию голосом не объявляет
  })
  it('разгон: второй круг — после первого с ошибкой директор идёт на объявление второго (слова вписаны), без ошибок — мимо него', () => {
    const { rh, stages } = probe('sprint')
    const i1 = stages.findIndex(s => s.sid === 'sprint')
    for (let i = 0; i < stages[i1].words.length; i++) rh.rec('win', { idx: i })
    const clean = rh.nextIdx(i1 + 1)
    expect(stages[clean].act).toBe('catch') // ошибок не было — второго круга нет
    const bad = probe('sprint')
    bad.rh.rec('fail', { idx: 0 })
    const go = bad.rh.nextIdx(i1 + 1)
    expect(bad.stages[go].sid).toBe('sprint2-ann')
    expect(bad.stages[go + 1].words.length).toBeGreaterThanOrEqual(2)
    expect(bad.stages[go + 1].words.some(w => w.idx === 0)).toBe(true)
  })
  it('на «не успел» директор игры реплик не говорит (failLine пуст): «ой, соскользнул» «Вершины» и «мимо» слуха говорит редюсер', () => {
    const { rh, stages } = probe('sprint')
    for (const sid of ['sprint', 'descent-s', 'climb-1']) expect(rh.failLine(stages.find(s => s.sid === sid))).toBe('')
  })
  it('слушай и лови: принятие слова пишет время ответа и говорит мини-реплику успеха; «не успел» и промах реплик не вызывают (редюсер молчит)', () => {
    const { rh, sayLine, stages } = probe('catch')
    const st = stages.find(s => s.sid === 'catch'), i = st.words.findIndex(w => !w.trap)
    rh.claim({ idx: i }, 1500)
    expect(sayLine.mock.calls.map(c => c[0])).toEqual([st.good[0].id])
    const t = probe('catch'); t.rh.rec('fail', { idx: 1 }); t.rh.rec('miss', { idx: 1 }); expect(t.sayLine).not.toHaveBeenCalled()
  })
  it('перед выездом пилюли Пит говорит: в разгоне — русский перевод (ru), в «Слушай и лови» — английское слово (hold: Пит занят); без озвучки — молча', () => {
    const sp = probe('sprint'); sp.rh.pre({ cap: 'учиться', say: 'learn' })
    expect(sp.sayText).toHaveBeenCalledWith('учиться', { ru: true })
    const ct = probe('catch'); ct.rh.pre({ cap: 'учиться', say: 'learn' })
    expect(ct.sayText).toHaveBeenCalledWith('learn', { hold: true })
    const none = probe('catch'); none.rh.pre({ cap: 'x' }); expect(none.sayText).not.toHaveBeenCalled()
  })
  it('слушай и лови: после первого круга с ошибкой директор идёт на объявление второго (catch2-ann, слова вписаны), без ошибок — мимо него; ловушка, на которую не поддался, ошибкой не считается', () => {
    const { rh, stages } = probe('catch')
    const i1 = stages.findIndex(s => s.sid === 'catch'), st = stages[i1]
    st.words.forEach((w, i) => rh.rec(w.trap ? 'fail' : 'win', { idx: i })) // верные пилюли — слово сказано, ловушки уехали («не успел» = пропущена) — всё верно
    expect(stages[rh.nextIdx(i1 + 1)].act).toBe('climb') // ошибок не было — второго круга нет
    const bad = probe('catch'); bad.rh.rec('miss', { idx: st.words.findIndex(w => w.trap), believed: true })
    const go = bad.rh.nextIdx(i1 + 1)
    expect(bad.stages[go].sid).toBe('catch2-ann'); expect(bad.stages[go + 1].sid).toBe('catch2'); expect(bad.stages[go + 1].words.length).toBeGreaterThanOrEqual(2)
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
    const c = probe('catch', { setS }); c.rh.rec('miss'); expect(setS).toHaveBeenCalledTimes(1)
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
