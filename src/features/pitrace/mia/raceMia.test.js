import { describe, it, expect } from 'vitest'
import { reduceMia, miaInit, isSecondCircle, isMiaStage, miaShown, makeMiaBox, applyMia, MIA } from './raceMia.js'

const circle2 = (act = 'sprint', words = [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }]) => ({ type: 'student', act, sid: `${act}2`, words, step: { boost: { k: 1 } } })
const ann = (act = 'sprint') => ({ type: 'announce', act, sid: `${act}3-ann`, mia: 'ann' })
const round3 = (act = 'sprint', words = [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }]) => ({ type: 'student', act, sid: `${act}3`, mia: 'round', words, step: { boost: { k: 1 } } })
const circle1 = (act = 'sprint') => ({ type: 'student', act, sid: act, words: [{ text: 'a' }], step: { boost: { k: 1 } } })
const ev = (t, stage, extra = {}) => ({ t, stage, now: 1000, ...extra })
const ids = r => r.say.map(l => l.id)

describe('эпизод «Мия»: когда приходит', () => {
  it('второй круг = стадия sprint2 / catch2', () => {
    expect(isSecondCircle(circle2())).toBe(true); expect(isSecondCircle(circle2('catch'))).toBe(true)
    expect(isSecondCircle(circle1())).toBe(false); expect(isSecondCircle({ type: 'announce', act: 'sprint', sid: 'sprint2' })).toBe(false); expect(isSecondCircle(null)).toBe(false)
  })
  it('стадии эпизода: церемония и круг с Мией', () => { expect(isMiaStage(ann())).toBe(true); expect(isMiaStage(round3())).toBe(true); expect(isMiaStage(circle2())).toBe(false) })
  it('первая ошибка второго круга прерывает его: фаза pending и просьба прыгнуть на церемонию (go), реплик пока нет', () => {
    const r = reduceMia(miaInit(), ev('miss', circle2(), { idx: 1 }))
    expect(r.mia.phase).toBe('pending'); expect(r.mia.act).toBe('sprint'); expect(r.mia.used).toEqual({ sprint: true }); expect(r.go).toBe('sprint'); expect(r.say).toEqual([]); expect(miaShown(r.mia)).toBe(false)
  })
  it('церемония (вход на стадию …3-ann): Мия приходит, пять реплик (Мия, Пит, Мия), ускорения ещё нет; круг с Мией (…3) ускоряет дорожку', () => {
    const r = reduceMia(reduceMia(miaInit(), ev('miss', circle2(), { idx: 1 })).mia, ev('enter', ann()))
    expect(r.mia.phase).toBe('in'); expect(r.mia.act).toBe('sprint'); expect(r.mia.used).toEqual({ sprint: true }); expect(r.boost).toBeNull()
    expect(ids(r)).toEqual(['mia_push', 'mia_announce_1', 'pit_reply', 'mia_announce_2', 'mia_announce_3'])
    expect(r.say.map(l => l.delay)).toEqual([MIA.PUSH_AT, MIA.ANNOUNCE_AT, MIA.REPLY_AT, MIA.ANNOUNCE2_AT, MIA.ANNOUNCE3_AT]); expect(r.say.map(l => l.who)).toEqual(['mia', 'mia', 'pit', 'mia', 'mia'])
    expect(miaShown(r.mia)).toBe(true)
    const b = reduceMia(r.mia, ev('enter', round3())); expect(b.boost).toBe(MIA.BOOST); expect(b.mia).toBe(r.mia); expect(b.say).toEqual([])
  })
  it('начало с круга Мии (отладка): церемония запускается из фазы off без ошибки', () => {
    const r = reduceMia(miaInit(), ev('enter', ann('catch'))); expect(r.mia.phase).toBe('in'); expect(r.mia.act).toBe('catch'); expect(ids(r)[0]).toBe('mia_push')
  })
  it('«не успел» (fail) — тоже ошибка; верные ответы и первый круг Мию не зовут', () => {
    expect(reduceMia(miaInit(), ev('fail', circle2(), { idx: 0 })).mia.phase).toBe('pending')
    expect(reduceMia(miaInit(), ev('win', circle2(), { idx: 0 })).mia.phase).toBe('off')
    expect(reduceMia(miaInit(), ev('miss', circle1(), { idx: 0 })).mia.phase).toBe('off')
    expect(reduceMia(miaInit(), ev('miss', { type: 'student', act: 'climb', sid: 'climb' }, { idx: 0 })).mia.phase).toBe('off')
  })
  it('ловушка: «fail» на ловушке — верно промолчать, Мию не зовёт', () => {
    const st = circle2('sprint', [{ text: 'a', trap: true }])
    expect(reduceMia(miaInit(), ev('fail', st, { idx: 0 })).mia.phase).toBe('off')
  })
  it('один раз на проход: после ухода во втором круге того же прохода Мия не возвращается, у другого прохода — своя', () => {
    let m = reduceMia(reduceMia(miaInit(), ev('miss', circle2(), { idx: 0 })).mia, ev('enter', ann())).mia
    m = reduceMia(m, ev('enter', circle1('catch'))).mia
    expect(m.phase).toBe('out')
    expect(reduceMia(m, ev('miss', circle2(), { idx: 0 })).mia.phase).toBe('out')
    const c = reduceMia({ ...m, phase: 'off' }, ev('miss', circle2('catch'), { idx: 0 }))
    expect(c.mia.phase).toBe('pending'); expect(c.go).toBe('catch'); expect(c.mia.used).toEqual({ sprint: true, catch: true })
    expect(ids(reduceMia(c.mia, ev('enter', ann('catch'))))[0]).toBe('mia_push')
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
    for (let i = 0; i < 4; i++) { const r = reduceMia(m, ev(i % 2 ? 'fail' : 'miss', round3(), { idx: 1 })); m = r.mia; seen.push(ids(r)[0]); expect(m.streak).toBe(0) }
    expect(seen).toEqual(['mia_miss_1', 'mia_miss_2', 'mia_miss_3', 'mia_miss_1'])
  })
  it('три верных подряд: Мия уходит (пит возвращается), ускорение снимается', () => {
    let m = arrive(); let r
    for (const k of [1, 2, 3]) { r = reduceMia(m, ev('win', round3(), { idx: k })); m = r.mia }
    expect(m.phase).toBe('out'); expect(m.why).toBe('win'); expect(r.boost).toBe(1)
    expect(ids(r)).toEqual(['mia_leave', 'pit_back_1', 'pit_back_2']); expect(r.say.map(l => l.delay)).toEqual([0, MIA.BACK_AT, MIA.BACK2_AT]); expect(miaShown(m)).toBe(true)
  })
  it('ошибка между верными обнуляет серию: три подряд считаются заново', () => {
    let m = arrive()
    for (const t of ['win', 'win', 'miss', 'win', 'win']) m = reduceMia(m, ev(t, round3(), { idx: 1 })).mia
    expect(m.phase).toBe('in'); expect(m.streak).toBe(2)
    expect(reduceMia(m, ev('win', round3(), { idx: 1 })).mia.phase).toBe('out')
  })
  it('круг кончился без победы: следующая стадия — Мия отпускает Пита сама', () => {
    const r = reduceMia(arrive(), ev('enter', circle1('catch')))
    expect(r.mia.phase).toBe('out'); expect(r.mia.why).toBe('end'); expect(r.boost).toBe(1); expect(ids(r)).toEqual(['mia_end', 'pit_end'])
  })
  it('повторный вход в ту же стадию (пауза и «Продолжить») Мию не трогает; после ухода фаза не сбрасывается (анимация ухода не обрывается)', () => {
    const m = arrive()
    expect(reduceMia(m, ev('enter', ann())).mia).toBe(m); expect(reduceMia(m, ev('enter', round3())).mia).toBe(m)
    const out = reduceMia(m, ev('enter', circle1('catch'))).mia
    const next = reduceMia(out, ev('enter', { type: 'student', act: 'phrases', sid: 'phrases' }))
    expect(next.mia).toBe(out); expect(next.mia.phase).toBe('out')
  })
})

describe('applyMia: ускорение ступени и номер пачки реплик', () => {
  it('приход ставит step.boost.k, уход возвращает 1; key растёт только с репликами', () => {
    const mb = makeMiaBox(), st = round3(), c2 = circle2()
    applyMia(mb, reduceMia(mb.m, ev('miss', c2, { idx: 0 })), c2)
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
