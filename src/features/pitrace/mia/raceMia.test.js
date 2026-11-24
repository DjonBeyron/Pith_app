import { describe, it, expect } from 'vitest'
import { reduceMia, miaInit, isMiaStage, miaShown, makeMiaBox, applyMia, MIA } from './raceMia.js'

const circle2 = (act = 'sprint', words = [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }]) => ({ type: 'student', act, sid: `${act}2`, words, step: { boost: { k: 1 } } })
const ann = (act = 'sprint') => ({ type: 'announce', act, sid: `${act}3-ann`, mia: 'ann' })
const round3 = (act = 'sprint', words = [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }]) => ({ type: 'student', act, sid: `${act}3`, mia: 'round', words, step: { boost: { k: 1 } } })
const circle1 = (act = 'sprint') => ({ type: 'student', act, sid: act, words: [{ text: 'a' }], step: { boost: { k: 1 } } })
const ev = (t, stage, extra = {}) => ({ t, stage, now: 1000, ...extra })
const ids = r => r.say.map(l => l.id)

describe('эпизод «Мия»: когда приходит', () => {
  it('стадии эпизода: церемония и круг с Мией', () => { expect(isMiaStage(ann())).toBe(true); expect(isMiaStage(round3())).toBe(true); expect(isMiaStage(circle2())).toBe(false) })
  it('ошибка в обычном круге Мию не зовёт: она приходит только на стадию-церемонию (вместо круга 2 — решает директор, miaRoute)', () => {
    for (const t of ['miss', 'fail']) { expect(reduceMia(miaInit(), ev(t, circle2(), { idx: 1 })).mia.phase).toBe('off'); expect(reduceMia(miaInit(), ev(t, circle1(), { idx: 1 })).mia.phase).toBe('off') }
  })
  it('церемония (вход на стадию …3-ann): коробка падает через DROP_AT, пять реплик (Мия, Пит-мяуканье, Пит, Мия, Мия; сценарий владельца 2026-11-24), ускорения ещё нет; круг с Мией (…3) ускоряет дорожку', () => {
    const r = reduceMia(miaInit(), ev('enter', ann()))
    expect(r.mia.phase).toBe('in'); expect(r.mia.act).toBe('sprint'); expect(r.mia.used).toEqual({ sprint: true }); expect(r.boost).toBeNull(); expect(r.mia.at).toBe(1000 + MIA.DROP_AT)
    expect(ids(r)).toEqual(['mia_push', 'pit_panic', 'pit_reply', 'mia_announce_2', 'mia_announce_3'])
    expect(r.say.map(l => l.delay)).toEqual([MIA.PUSH_AT, MIA.PANIC_AT, MIA.REPLY_AT, MIA.ANNOUNCE2_AT, MIA.ANNOUNCE3_AT]); expect(r.say.map(l => l.who)).toEqual(['mia', 'pit', 'pit', 'mia', 'mia'])
    expect(miaShown(r.mia)).toBe(true)
    const b = reduceMia(r.mia, ev('enter', round3())); expect(b.boost).toBe(MIA.BOOST); expect(b.mia).toMatchObject({ phase: 'in', act: 'sprint', fast: true }); expect(r.mia.fast).toBe(false); expect(b.say).toEqual([])
  })
  it('начало с круга Мии (отладка) — тот же вход: церемония запускается из фазы off', () => {
    const r = reduceMia(miaInit(), ev('enter', ann('catch'))); expect(r.mia.phase).toBe('in'); expect(r.mia.act).toBe('catch'); expect(ids(r)[0]).toBe('mia_push')
  })
  it('верные ответы и первый круг без Мии ничего не меняют', () => {
    expect(reduceMia(miaInit(), ev('win', circle2(), { idx: 0 })).mia.phase).toBe('off')
    expect(reduceMia(miaInit(), ev('miss', { type: 'student', act: 'climb', sid: 'climb' }, { idx: 0 })).mia.phase).toBe('off')
  })
  it('ловушка: «fail» на ловушке в круге Мии — верно промолчать, серия растёт, колкость при верном', () => {
    const st = round3('sprint', [{ text: 'a', trap: true }])
    const m = reduceMia(miaInit(), ev('enter', ann())).mia
    const r = reduceMia(m, ev('fail', st, { idx: 0 })); expect(r.mia.streak).toBe(1); expect(r.mia.phase).toBe('in')
  })
  it('один раз на проход: после ухода Мия на тот же проход не возвращается (used), у другого прохода — своя церемония', () => {
    let m = reduceMia(miaInit(), ev('enter', ann())).mia
    m = reduceMia(m, ev('enter', circle1('catch'))).mia
    expect(m.phase).toBe('out'); expect(m.used).toEqual({ sprint: true })
    const c = reduceMia(m, ev('enter', ann('catch')))
    expect(c.mia.phase).toBe('in'); expect(c.mia.act).toBe('catch'); expect(c.mia.used).toEqual({ sprint: true, catch: true }); expect(ids(c)[0]).toBe('mia_push')
  })
})

describe('эпизод «Мия»: пока она на коробке', () => {
  const arrive = () => reduceMia(reduceMia(miaInit(), ev('miss', round3(), { idx: 0 })).mia, ev('enter', ann())).mia
  it('верный: первая реплика сразу, дальше раз в три верных; два подряд — «подозрительно хорошо»', () => {
    let m = arrive()
    let r = reduceMia(m, ev('win', round3(), { idx: 1 })); expect(ids(r)).toEqual(['mia_ok_1']); expect(r.mia.streak).toBe(1); m = r.mia
    r = reduceMia(m, ev('win', round3(), { idx: 2 })); expect(ids(r)).toEqual(['mia_streak2']); expect(r.mia.streak).toBe(2)
  })
  it('ошибка сбрасывает серию и даёт колкость по кругу трёх вариантов', () => {
    let m = arrive(); const seen = []
    for (let i = 0; i < 4; i++) { const r = reduceMia(m, ev(i % 2 ? 'fail' : 'miss', round3(), { idx: 1 })); m = r.mia; seen.push(ids(r)[0]); expect(m.streak).toBe(0) } // v3.3.348: на miss (пилюля ещё едет) Мия молчит, колкость — на fail
    expect(seen).toEqual([undefined, 'mia_miss_1', undefined, 'mia_miss_2'])
  })
  const end3 = (act = 'sprint') => ({ type: 'announce', act, sid: `${act}3-end`, mia: 'end', round: { kind: 'mia', title: '', task: '' } })
  const play = (m, results, stage = round3('sprint', [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }])) => { let st = reduceMia(m, ev('enter', stage)).mia; results.forEach((t, idx) => { st = reduceMia(st, ev(t, stage, { idx })).mia }); return st }
  it('три верных подряд Мию больше не отпускают (v3.3.297): круг идёт дальше, коробка остаётся на Пите, ускорение не снимается', () => {
    let m = arrive(); let r
    for (const k of [1, 2, 3]) { r = reduceMia(m, ev('win', round3(), { idx: k })); m = r.mia }
    expect(m.phase).toBe('in'); expect(m.streak).toBe(3); expect(r.boost).toBeNull(); expect(ids(r)).not.toContain('mia_leave')
  })
  it('ошибка между верными обнуляет серию (счёт серии для колкостей)', () => {
    let m = arrive()
    for (const t of ['win', 'win', 'miss', 'win', 'win']) m = reduceMia(m, ev(t, round3(), { idx: 1 })).mia
    expect(m.phase).toBe('in'); expect(m.streak).toBe(2)
  })
  it('конец круга с Мией (стадия …3-end): все слова верны — Мия уходит с коробкой («вы победили», две реплики Пита); ловушка — верно промолчать', () => {
    const r = reduceMia(play(arrive(), ['win', 'win', 'win', 'win']), ev('enter', end3()))
    expect(r.mia).toMatchObject({ phase: 'out', why: 'win' }); expect(r.mia.solo).toBeNull(); expect(ids(r)).toEqual(['mia_leave', 'pit_back_1', 'pit_back_2']); expect(r.log).toContain('все верно')
    const trap = round3('sprint', [{ text: 'a' }, { text: 'b', trap: true }]); const t = reduceMia(reduceMia(reduceMia(arrive(), ev('enter', trap)).mia, ev('win', trap, { idx: 0 })).mia, ev('fail', trap, { idx: 1 })).mia
    expect(reduceMia(t, ev('enter', end3())).mia).toMatchObject({ phase: 'out', why: 'win' })
  })
  it('конец круга: хоть одно слово не названо верно — коробка остаётся на Пите, Мия выпрыгивает одна (solo keep), Пит просит помочь; снятие коробки — как в финале', () => {
    const r = reduceMia(play(arrive(), ['win', 'miss', 'win', 'fail']), ev('enter', end3()))
    expect(r.mia).toMatchObject({ phase: 'in', solo: 'keep' }); expect(ids(r)).toEqual(['boss_mia_keep']); expect(r.log).toContain('Пит остаётся в коробке')
    const s = reduceMia(r.mia, ev('stuck')).mia; expect(s.solo).toBe('stuck')
    expect(reduceMia(s, ev('free')).mia).toMatchObject({ phase: 'out', alone: true, solo: null })
  })
  it('круг кончился без победы: следующая стадия — Мия отпускает Пита сама', () => {
    const r = reduceMia(arrive(), ev('enter', circle1('catch')))
    expect(r.mia.phase).toBe('out'); expect(r.mia.why).toBe('end'); expect(r.boost).toBe(1); expect(ids(r)).toEqual(['mia_end', 'pit_end'])
  })
  it('повторный вход в ту же стадию (пауза и «Продолжить») Мию не трогает; после ухода фаза не сбрасывается (анимация ухода не обрывается)', () => {
    const m = arrive()
    expect(reduceMia(m, ev('enter', ann())).mia).toMatchObject({ phase: 'in', act: 'sprint' }); expect(reduceMia(m, ev('enter', round3())).mia).toMatchObject({ phase: 'in', streak: 0 })
    const out = reduceMia(m, ev('enter', circle1('catch'))).mia
    const next = reduceMia(out, ev('enter', { type: 'student', act: 'phrases', sid: 'phrases' }))
    expect(next.mia).toBe(out); expect(next.mia.phase).toBe('out')
  })
})

describe('applyMia: ускорение ступени и номер пачки реплик', () => {
  it('приход ставит step.boost.k, уход возвращает 1; key растёт только с репликами', () => {
    const mb = makeMiaBox(), st = round3()
    let v = applyMia(mb, reduceMia(mb.m, ev('enter', ann())), ann())
    expect(v.key).toBe(1); expect(v.mia.phase).toBe('in'); expect(mb.step).toBeNull()
    applyMia(mb, reduceMia(mb.m, ev('enter', st)), st)
    expect(st.step.boost.k).toBe(MIA.BOOST); expect(mb.step).toBe(st.step)
    v = applyMia(mb, reduceMia(mb.m, ev('enter', circle1('catch'))), circle1('catch'))
    expect(st.step.boost.k).toBe(1); expect(mb.step).toBeNull(); expect(v.key).toBe(2)
    v = applyMia(mb, reduceMia(mb.m, ev('enter', { type: 'student', act: 'phrases', sid: 'phrases' })), null)
    expect(v.key).toBe(2); expect(v.mia.phase).toBe('out')
  })
})
