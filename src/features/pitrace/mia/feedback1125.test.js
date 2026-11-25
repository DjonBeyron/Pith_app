import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { plateEndAt, plateShowAt, plateOn, OFFSCREEN_IDS } from './useMiaPlate.js'
import { reduceMia, miaInit } from './raceMia.js'
import { miaColorOn } from './miaTint.js'
import { ARR, SOLO } from './miaMotion.js'
import { jumpAfterPush, JUMP_PAD_MS } from './miaCircleEnd.js'
import { nudgeInit, nudgeStep, createTimers, NUDGE_IDLE_MS, NUDGE_MAX, FREE_WATCHDOG_MS } from './miaBoxFree.js'

// Комментарии владельца из журнала игры 2026-11-25 (v3.3.365, iPhone) к «Допросу у Мии»:
//  • «Плашку «Допрос Мии» нужно показать позже, когда она уже выскочила из-за экрана»;
//  • «Цвет дорожек с этапа (допрос Мии) меняется слишком рано, нужно когда она отпрыгивает за экран в конце»;
//  • «Помоги её приподнять, если бездействовать, реплика повторяется».
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const end = { type: 'announce', act: 'sprint', sid: 'sprint3-end', mia: 'end' }
const inRound = (o = {}) => ({ ...miaInit(), phase: 'in', act: 'sprint', fast: true, rtotal: 3, rwon: { 0: true }, ...o })

describe('плашка «Допрос у Мии» — когда Мия уже на коробке', () => {
  it('срок показа — конец прыжка из-за края: падение коробки + срок прыжка + длина прыжка (а прыжок ждёт конец реплики из-за края)', () => {
    expect(plateShowAt(1000, undefined)).toBe(1000 + (ARR.JUMP + ARR.JUMP_LEN) * 1000)
    expect(plateShowAt(1000, 5.2)).toBe(plateEndAt(1000, 5.2) + ARR.JUMP_LEN * 1000)
    const m = jumpAfterPush({ ...miaInit(), phase: 'in', act: 'sprint', at: 1000 }, { id: 'mia_push', ms: 6000 }, 2000) // длинная реплика из-за края: прыжок и плашка сдвигаются за её конец
    expect(plateShowAt(m.at, m.jump)).toBe(2000 + 6000 + JUMP_PAD_MS + ARR.JUMP_LEN * 1000)
  })
  it('«Допрос»: пока Мия говорит за кадром и летит — плашки НЕТ; приземлилась — плашка стоит до конца церемонии', () => {
    expect(plateOn({ boss: false, ann: true, started: true, jumped: false, landed: false })).toBe(false) // раньше здесь плашка была
    expect(plateOn({ boss: false, ann: true, started: true, jumped: true, landed: false })).toBe(false)  // прыжок ещё идёт
    expect(plateOn({ boss: false, ann: true, started: true, jumped: true, landed: true })).toBe(true)
    expect(plateOn({ boss: false, ann: false, started: true, jumped: true, landed: true })).toBe(false) // церемония кончилась (круг, пауза)
    expect(plateOn({ boss: false, ann: true, started: false, jumped: true, landed: true })).toBe(true)  // реплика из-за края не прозвучала — плашка всё равно выйдет с Мией
  })
  it('экзамен «Шкала памяти» не тронут: плашка — пока Мия говорит за кадром, до прыжка', () => {
    expect(plateOn({ boss: true, ann: true, started: true, jumped: false, landed: false })).toBe(true)
    expect(plateOn({ boss: true, ann: true, started: true, jumped: true, landed: true })).toBe(false)
    expect(plateOn({ boss: true, ann: true, started: false, jumped: false, landed: false })).toBe(false)
    expect(OFFSCREEN_IDS).toEqual(['mia_push', 'boss_mia_hush'])
  })
  it('хук: таймеры от событий машины (m.at, m.jump), переставляются при сдвиге прыжка; плашку читает директор', () => {
    const src = read('./useMiaPlate.js')
    expect(src).toContain('plateShowAt(at, jump) - now'); expect(src).toContain('[ann, seq, at, jump]'); expect(src).toContain("boss = stage?.script === 'boss'")
    expect(read('../useRaceActs.js')).toContain('miaPlate.go ? plateText(')
  })
})

describe('цвет дорожек Мии держится, пока она не отпрыгнула за экран', () => {
  it('круг с ошибками: на стадии-конце цвет ОСТАЁТСЯ (Мия ещё на коробке, говорит «…до встречи»); скорость конвейера возвращается сразу', () => {
    const r = reduceMia(inRound(), { t: 'enter', stage: end, now: 1000, keepMs: 3800 })
    expect(r.mia).toMatchObject({ phase: 'in', solo: 'keep', fast: true, soloAt: 4800 }); expect(r.boost).toBe(1); expect(r.say.map(c => c.id)).toEqual(['boss_mia_keep'])
    expect(miaColorOn(r.mia, end, false, false)).toBe(true) // было false: дорожки серели за ≈ 4 с до прыжка Мии (журнал владельца: конец круга 19:12:13.3, прыжок 19:12:17.0)
  })
  it('Мия оттолкнулась (событие try, RaceMia: SOLO.TRY_AT после начала ухода) — цвет возвращается; дальше stuck / free его не включают', () => {
    const k = reduceMia(inRound(), { t: 'enter', stage: end, now: 1000 }).mia
    const t = reduceMia(k, { t: 'try', stage: end, now: 5000 })
    expect(t.mia.fast).toBe(false); expect(t.mia.solo).toBe('keep'); expect(t.say.map(c => c.id)).toEqual(['boss_pit_try']); expect(miaColorOn(t.mia, end, false, false)).toBe(false)
    const s = reduceMia(t.mia, { t: 'stuck', stage: end, now: 9000 }); expect(miaColorOn(s.mia, end, false, false)).toBe(false)
    expect(SOLO.TRY_AT).toBeLessThanOrEqual(SOLO.CROUCH) // try — момент толчка, а не конец полёта
    expect(read('../RaceMia.jsx')).toContain('c.sl >= SOLO.TRY_AT'); expect(read('../RaceMia.jsx')).toContain('cbRef.current.onTry?.()')
  })
  it('все слова верны: цвет возвращается с началом её прыжка с коробкой (фаза out) — как было', () => {
    const r = reduceMia(inRound({ rwon: { 0: true, 1: true, 2: true } }), { t: 'enter', stage: end, now: 1000 })
    expect(r.mia).toMatchObject({ phase: 'out', why: 'win', fast: false }); expect(miaColorOn(r.mia, end, false, false)).toBe(false)
  })
  it('экзамен: события снятия коробки (и повтор просьбы) по-прежнему ничего не делают', () => {
    const b = { ...inRound(), act: 'boss', solo: 'keep' }
    for (const t of ['try', 'stuck', 'nudge', 'faster', 'free']) { const r = reduceMia(b, { t, now: 1 }); expect(r.mia).toBe(b); expect(r.say).toEqual([]) }
  })
})

describe('«…помоги её приподнять»: при бездействии Пит повторяет просьбу', () => {
  it('правило: после NUDGE_IDLE_MS тишины без касаний — повтор, не больше NUDGE_MAX раз; речь и касания отодвигают его', () => {
    expect(NUDGE_IDLE_MS).toBeGreaterThanOrEqual(8000); expect(NUDGE_IDLE_MS).toBeLessThanOrEqual(10000); expect(NUDGE_MAX).toBe(2)
    let st = nudgeInit(0), r
    r = nudgeStep(st, { now: 3600, busy: true }); st = r.st; expect(r.say).toBe(false); expect(st.idleFrom).toBe(3600) // Пит ещё говорит первую просьбу: тишина считается от её конца
    r = nudgeStep(st, { now: 3600 + NUDGE_IDLE_MS - 1 }); st = r.st; expect(r.say).toBe(false)
    r = nudgeStep(st, { now: 3600 + NUDGE_IDLE_MS }); st = r.st; expect(r.say).toBe(true); expect(st.n).toBe(1)
    r = nudgeStep(st, { now: st.idleFrom + 3000, touchedAt: st.idleFrom + 2900 }); st = r.st; expect(r.say).toBe(false); expect(st.idleFrom).toBe(3600 + NUDGE_IDLE_MS + 2900) // коснулся коробки — отсчёт заново
    r = nudgeStep(st, { now: st.idleFrom + NUDGE_IDLE_MS, touchedAt: st.idleFrom }); st = r.st; expect(r.say).toBe(true); expect(st.n).toBe(2)
    r = nudgeStep(st, { now: st.idleFrom + 10 * NUDGE_IDLE_MS }); expect(r.say).toBe(false) // третьего раза нет: дальше сторож
  })
  it('по времени (реплика ≈ 3,6 с): повторы на ≈ 12,6 и ≈ 25,2 с, оба договорены до сторожа (30 с)', () => {
    const LINE = 3600, starts = []
    let st = nudgeInit(0), busyUntil = LINE
    for (let now = 0; now < FREE_WATCHDOG_MS; now += 240) { const r = nudgeStep(st, { now, busy: now < busyUntil }); st = r.st; if (r.say) { starts.push(now); busyUntil = now + LINE } }
    expect(starts).toHaveLength(NUDGE_MAX)
    expect(starts[0]).toBeGreaterThanOrEqual(LINE + NUDGE_IDLE_MS - 240); expect(starts[0]).toBeLessThan(LINE + NUDGE_IDLE_MS + 500) // шаг опроса 240 мс
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(LINE + NUDGE_IDLE_MS - 240) // не чаще раза в ≈ 9 с тишины
    expect(starts[1] + LINE).toBeLessThan(FREE_WATCHDOG_MS)
  })
  it('машина: nudge в состоянии stuck — снова boss_pit_stuck (состояние не меняется); вне stuck — ничего', () => {
    const k = { ...inRound(), solo: 'keep' }, s = reduceMia(k, { t: 'stuck', stage: end, now: 1 }).mia
    const n = reduceMia(s, { t: 'nudge', stage: end, now: 2 }); expect(n.say.map(c => c.id)).toEqual(['boss_pit_stuck']); expect(n.mia).toBe(s)
    expect(reduceMia(k, { t: 'nudge', stage: end, now: 2 }).say).toEqual([])
    expect(reduceMia(reduceMia(s, { t: 'free', stage: end, now: 3 }).mia, { t: 'nudge', stage: end, now: 4 }).say).toEqual([])
  })
  it('привод: опрос после onStuck, касание отодвигает повтор; на паузе игры просьбы и сторож молчат', () => {
    const src = read('./useMiaBoxFree.js')
    expect(src).toContain("miaEvent({ t: 'nudge', stage: running })"); expect(src).toContain('touchedAt.current = performance.now()'); expect(src).toContain('busy: mspeech.pending() > 0')
  })
})

describe('пауза игры: таймеры «Пит в коробке» сняты (журнал владельца: под окном комментария сторож «снял» коробку)', () => {
  const clock = () => { let t = 0, id = 0; const q = new Map(); return { set: (fn, ms) => { q.set(++id, { fn, at: t + ms }); return id }, clear: i => q.delete(i), go(ms) { t += ms; for (const [i, x] of [...q]) if (x.at <= t && q.delete(i)) x.fn() } } }
  it('пауза → сторож не срабатывает: clear() снимает сторожа, опрос и окно касания; после «Продолжить» сторож заводится заново и ждёт полные 30 с', () => {
    const c = clock(), tm = createTimers(c.set, c.clear), fired = []
    tm.later(() => fired.push('сторож'), FREE_WATCHDOG_MS); tm.later(() => fired.push('опрос'), 240)
    c.go(200); tm.clear(); expect(tm.size()).toBe(0) // пауза на 0,2 с
    c.go(FREE_WATCHDOG_MS * 3); expect(fired).toEqual([]) // под паузой прошло 90 с — ничего
    tm.later(() => fired.push('сторож'), FREE_WATCHDOG_MS) // «Продолжить»
    c.go(FREE_WATCHDOG_MS - 1); expect(fired).toEqual([]); c.go(1); expect(fired).toEqual(['сторож'])
  })
  it('хук: все таймеры идут через один набор и снимаются при смене running (пауза, выход из стадии); после паузы в состоянии stuck — завод заново', () => {
    const src = read('./useMiaBoxFree.js')
    expect(src).toContain('return () => timers.clear()'); expect(src).toContain('}, [running, mb, timers])'); expect(src).not.toContain('setTimeout(')
    expect(src).toContain("if (running?.mia === 'end' && mb.m.solo === 'stuck') armRef.current?.('после паузы')")
  })
  it('машина: повторный вход в стадию-конец, когда Пит уже в коробке (keep / stuck), конец заново не играет', () => {
    for (const solo of ['keep', 'stuck']) { const m = { ...inRound(), solo }, r = reduceMia(m, { t: 'enter', stage: end, now: 9 }); expect(r.mia).toBe(m); expect(r.say).toEqual([]); expect(r.boost).toBeNull() }
  })
  it('RaceMia на паузе: кадр пустой (часы эпизода стоят, поза уже нарисована)', () => {
    expect(read('../RaceMia.jsx')).toContain('if (c.paused && L && c.still) return')
  })
})
