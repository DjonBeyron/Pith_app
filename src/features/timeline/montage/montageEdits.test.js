import { describe, it, expect } from 'vitest'
import { buildTimeline } from '../timelineModel.js'
import { buildMontage, clipByKey, groupBefore } from './montageModel.js'
import { applyEdits, makeEdit, setEdit, dropEdit, limitsFor, clampTo, snap, gapInfo, editsSummary, SNAP_MS, MAX_ADD_MS } from './montageEdits.js'
import { montageEvents } from './montageFixture.js'

const base = () => buildMontage(buildTimeline(montageEvents()))
const starts = m => Object.fromEntries(m.clips.map(c => [c.key, c.t]))
const edit = (b, key, to, mode = 'ripple') => makeEdit(b, key, mode, to)

describe('черновик правок: сдвиг со шлейфом (ripple)', () => {
  it('зазор 3,0 с → 1,0 с: клип и ВСЁ после него (клипы, пилюля, ответ, нота, конец игры) едут на −2,0 с; до клипа — ничего не меняется', () => {
    const b = base(), m = applyEdits(b, [edit(b, 'dictor:w1#1', 1000)])
    expect(starts(m)).toEqual({ 'pit:a#1': 1000, 'dictor:w1#1': 4050, 'pit:b#1': 7700, 'mia:m#1': 9700, 'pit:a#2': 11200, 'pit:c#1': 12500 })
    expect(clipByKey(m, 'dictor:w1#1')).toMatchObject({ gap: 1000, end: 5050, sound: 1000 }) // клип жёсткий: длина звука не меняется
    expect(m.pills[0]).toMatchObject({ t: 5100, end: 7200 }); expect(m.answers[0].t).toBe(7200); expect(m.notes[0].t).toBe(7200)
    expect(m.dur).toBe(14000); expect(m.stages[0]).toMatchObject({ t: 0, end: 14000 })
    expect(m.gaps.find(g => g.t === 3050)).toMatchObject({ end: 4050, ms: 1000, kind: 'dead', long: false }) // была долгая красная — стала короткой
    expect(editsSummary(b, m)).toMatchObject({ before: 16000, after: 14000, removed: 2000, count: 1, missing: 0 })
    expect([...m.moved.keys()]).toEqual(['dictor:w1#1', 'pit:b#1', 'mia:m#1', 'pit:a#2', 'pit:c#1'])
  })

  it('удлинение: тишина вставляется прямо перед клипом, игра становится длиннее', () => {
    const b = base(), m = applyEdits(b, [edit(b, 'mia:m#1', 1500)])
    expect(starts(m)).toMatchObject({ 'pit:b#1': 9700, 'mia:m#1': 12700, 'pit:a#2': 14200 }); expect(m.dur).toBe(17000)
    expect(editsSummary(b, m).removed).toBe(-1000)
  })

  it('«ждём игрока» вырезать нельзя: зазор 2,65 с с ожиданием 2,0 с короче 2,0 с не становится — режутся только куски «игра молчит»', () => {
    const b = base(), m = applyEdits(b, [edit(b, 'pit:b#1', 300)])
    expect(m.applied[0]).toMatchObject({ from: 2650, to: 2000 })
    expect(clipByKey(m, 'pit:b#1')).toMatchObject({ t: 9050, gap: 2000 })
    expect(groupBefore(m, clipByKey(m, 'pit:b#1')).pieces.map(p => [p.kind, p.ms])).toEqual([['player', 2000]]) // ожидание игрока целое: 2,0 с
    expect(m.pills[0].t).toBe(7050) // пилюля выезжает сразу после слова диктора
    expect(limitsFor(b, [], 'pit:b#1')).toMatchObject({ from: 2650, min: 2000, why: 'player', locked: 2000 })
  })

  it('наложение на ДРУГОГО говорящего разрешено и помечено (over); на свою предыдущую реплику — нельзя', () => {
    const b = base(), m = applyEdits(b, [edit(b, 'mia:m#1', -300)])
    expect(clipByKey(m, 'mia:m#1')).toMatchObject({ t: 10900, gap: -300, over: 'pit:b#1', clash: false }) // Мия начала, пока Пит ещё говорит
    expect(starts(m)['pit:a#2']).toBe(12400) // шлейф: всё после — на −0,8 с
    const own = limitsFor(b, [], 'pit:c#1')
    expect(own).toMatchObject({ from: 500, min: 0, why: 'same' }) // перед «В» — своя же реплика Пита: ближе чем встык не поставить
    expect(clampTo(own, -400)).toEqual({ to: 0, hit: 'min' })
    expect(limitsFor(b, [], 'mia:m#1')).toMatchObject({ min: -1450, why: 'order', max: 500 + MAX_ADD_MS }) // не раньше начала предыдущего клипа (+ шаг)
    expect(limitsFor(b, [], 'pit:a#1')).toMatchObject({ from: 1000, min: 0, why: 'start' })
  })

  it('несколько правок: порядок в списке не важен; убрать одну — остальные не ломаются', () => {
    const b = base(), e1 = edit(b, 'dictor:w1#1', 1000), e2 = edit(b, 'mia:m#1', 100), e3 = edit(b, 'pit:c#1', 0)
    const all = applyEdits(b, [e1, e2, e3])
    expect(starts(all)).toEqual(starts(applyEdits(b, [e3, e1, e2])))
    expect(all.dur).toBe(16000 - 2000 - 400 - 500)
    expect(starts(applyEdits(b, dropEdit([e1, e2, e3], 'mia:m#1')))).toEqual(starts(applyEdits(b, [e1, e3])))
    expect(all.clips.every(c => !c.clash)).toBe(true)
  })
})

describe('черновик правок: только этот клип (solo)', () => {
  it('двигается один клип, остальные стоят, длина игры та же', () => {
    const b = base(), m = applyEdits(b, [edit(b, 'mia:m#1', 100, 'solo')])
    expect(starts(m)).toEqual({ ...starts(b), 'mia:m#1': 11300 }); expect(m.dur).toBe(16000)
    expect(clipByKey(m, 'pit:a#2').gap).toBe(900) // тишина после Мии выросла на те же 0,4 с
    expect([...m.moved.keys()]).toEqual(['mia:m#1'])
  })

  it('пределы: до упора в своих соседей (следующая реплика того же говорящего), ожидание игрока не пересечь', () => {
    const b = base()
    expect(limitsFor(b, [], 'pit:b#1', 'solo')).toMatchObject({ min: 2000, why: 'player', max: 2650 + (13200 - 11200) }) // вправо — до следующей реплики Пита
    expect(limitsFor(b, [], 'mia:m#1', 'solo').max).toBe(500 + (16000 - 12700)) // у Мии дальше реплик нет — до конца игры
    expect(clampTo(limitsFor(b, [], 'pit:b#1', 'solo'), 99999)).toEqual({ to: 4650, hit: 'max' })
  })
})

describe('черновик правок: привязка, список, неизменность оригинала', () => {
  it('привязка к шагу 50 мс; с шагом 0 (Shift) — свободно', () => {
    expect(SNAP_MS).toBe(50); expect(snap(1234)).toBe(1250); expect(snap(1224)).toBe(1200); expect(snap(-70)).toBe(-50); expect(snap(1234, 0)).toBe(1234)
  })

  it('правка хранит якоря: кто до, кто после, стадия, исходный и новый зазор, что внутри не двигается', () => {
    const b = base()
    expect(edit(b, 'pit:b#1', 2000)).toEqual({
      key: 'pit:b#1', mode: 'ripple', from: 2650, to: 2000, who: 'pit', id: 'b', text: 'Б', at: 9700, sid: 'sprint', stage: 'Конвейер слов — круг',
      prev: { who: 'dictor', id: 'w1', text: 'w1' }, locked: 2000, inside: [{ kind: 'player', ms: 2000 }],
    })
    expect(edit(b, 'pit:a#1', 0).prev).toBeNull(); expect(edit(b, 'pit:zzz#1', 0)).toBeNull()
    expect(gapInfo(b, 'dictor:w1#1')).toMatchObject({ from: 3000, flex: 3000, locked: 0 })
  })

  it('список: правка того же клипа заменяется на месте; «вернул как было» — правка исчезает', () => {
    const b = base(), a = edit(b, 'dictor:w1#1', 1000), c = edit(b, 'mia:m#1', 100)
    let list = setEdit(setEdit([], a), c)
    expect(list.map(e => e.key)).toEqual(['dictor:w1#1', 'mia:m#1'])
    list = setEdit(list, edit(b, 'dictor:w1#1', 500))
    expect(list.map(e => [e.key, e.to])).toEqual([['dictor:w1#1', 500], ['mia:m#1', 100]])
    expect(setEdit(list, edit(b, 'dictor:w1#1', 3000)).map(e => e.key)).toEqual(['mia:m#1'])
    expect(setEdit([], edit(b, 'mia:m#1', 500))).toEqual([])
  })

  it('оригинал прохождения НИКОГДА не меняется: applyEdits возвращает новый монтаж, исходный и список правок — те же до байта', () => {
    const b = base(), snapBase = JSON.stringify(b), edits = [edit(b, 'dictor:w1#1', 1000), edit(b, 'mia:m#1', -300), edit(b, 'pit:c#1', 100, 'solo')], snapEdits = JSON.stringify(edits)
    Object.freeze(edits); edits.forEach(Object.freeze)
    const m = applyEdits(b, edits)
    expect(JSON.stringify(b)).toBe(snapBase); expect(JSON.stringify(edits)).toBe(snapEdits)
    expect(m.base).toBe(b); expect(m.clips).not.toBe(b.clips); expect(m.clips[1]).not.toBe(b.clips[1])
    const none = applyEdits(b, [])
    expect(starts(none)).toEqual(starts(b)); expect(none.dur).toBe(b.dur); expect(none.moved.size).toBe(0)
    expect(starts(applyEdits(b, dropEdit(edits, 'dictor:w1#1').filter(e => e.key === 'x')))).toEqual(starts(b)) // все правки убраны — игра как была
  })

  it('правка из другой игры (такого клипа нет) не применяется и не ломает остальные; мусор в списке пропускается', () => {
    const b = base(), m = applyEdits(b, [{ key: 'pit:nope#1', mode: 'ripple', from: 1000, to: 0 }, edit(b, 'dictor:w1#1', 1000), null, { key: 'mia:m#1', to: NaN }])
    expect(m.missing.map(e => e.key)).toEqual(['pit:nope#1', 'mia:m#1']); expect(m.applied.map(e => e.key)).toEqual(['dictor:w1#1']); expect(m.dur).toBe(14000)
    const other = buildMontage(buildTimeline(montageEvents().map(e => (e.t >= 6050 ? { ...e, t: e.t + 1000 } : e)))) // в другой игре та же тишина длиннее: 4,0 с
    expect(applyEdits(other, [edit(b, 'dictor:w1#1', 1000)]).applied[0]).toMatchObject({ from: 4000, to: 1000 }) // цель — «сделать 1,0 с», а не «убрать 2,0 с»
  })
})
