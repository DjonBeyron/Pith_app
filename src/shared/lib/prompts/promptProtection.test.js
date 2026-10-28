import { describe, it, expect } from 'vitest'
import {
  emptyState, normalizeState, startSession, onSlide, blockReason, pickNext,
  noteShown, noteAnswer, noteDismiss, noteLater, prune,
} from './promptBudget.js'
import * as R from './promptRules.js'

// Защита от надоедания: паузы после закрытий, подсказки навсегда, «Спроси позже», самовыключение, prune, иммутабельность
const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000
const T0 = 1_000_000_000_000
const LATE = T0 + R.MIN_MS_AFTER_OPEN + 1
const q = (id = 'q1') => ({ id, kind: 'question', reason: 'behavior' })
const hint = (id = 'h1') => ({ id, kind: 'hint', reason: 'ui_hint' })
const ctx = now => ({ now, busy: {} })
const base = () => startSession(emptyState(), T0)

describe('закрыл/смахнул', () => {
  it('первое закрытие паузы не даёт', () => {
    const s = noteDismiss(base(), q(), LATE)
    expect(s.dismissStreak.question).toBe(1)
    expect(s.pausedKinds.question).toBeUndefined()
  })
  it('второе подряд — вид на паузе 7 суток', () => {
    let s = noteDismiss(base(), q(), LATE)
    s = noteDismiss(s, q(), LATE + 1000)
    expect(s.pausedKinds.question).toBe(LATE + 1000 + 7 * DAY)
    expect(blockReason(s, q(), ctx(LATE + 6 * DAY))).toMatch(/на паузе/)
    expect(blockReason(s, q(), ctx(LATE + 1000 + 7 * DAY))).toBeNull()
  })
  it('третье подряд (и дальше) — 30 суток', () => {
    let s = base()
    for (let i = 0; i < 3; i++) s = noteDismiss(s, q(), LATE)
    expect(s.pausedKinds.question).toBe(LATE + 30 * DAY)
    s = noteDismiss(s, q(), LATE + DAY)
    expect(s.pausedKinds.question).toBe(LATE + DAY + 30 * DAY)
  })
  it('ответ между закрытиями сбрасывает счёт; пауза одного вида не трогает другой', () => {
    let s = noteDismiss(base(), q(), LATE)
    s = noteAnswer(s, q())
    s = noteDismiss(s, q(), LATE)
    expect(s.pausedKinds.question).toBeUndefined()
    s = noteDismiss(noteDismiss(base(), q(), LATE), q(), LATE)
    expect(blockReason(s, hint(), ctx(LATE))).toBeNull()
  })
})

describe('подсказки: игнор по id', () => {
  it('после 3 игнорирований подсказка снята навсегда; другая подсказка живёт', () => {
    let s = base()
    for (let i = 0; i < 3; i++) s = noteDismiss(s, hint('h1'), LATE)
    expect(s.hintIgnored.h1).toBe(3)
    // вид hint сам стоит на паузе 30 суток — проверяем именно причину «снята», она идёт раньше паузы
    expect(blockReason(s, hint('h1'), ctx(LATE + 40 * DAY))).toMatch(/снята навсегда/)
    expect(blockReason(s, hint('h2'), ctx(LATE + 40 * DAY))).toBeNull()
    expect(blockReason(s, hint('h1'), ctx(LATE + 400 * DAY))).toMatch(/снята навсегда/)
  })
  it('игнор считается только у подсказок', () => {
    expect(noteDismiss(base(), q(), LATE).hintIgnored).toEqual({})
  })
})

describe('«Спроси позже»', () => {
  it('пауза 3 часа, закрытием не считается', () => {
    const s = noteLater(base(), q(), LATE)
    expect(s.laterStreak).toBe(1)
    expect(s.laterUntil).toBe(LATE + 3 * HOUR)
    expect(s.dismissStreak).toEqual({})
    expect(blockReason(s, q(), ctx(LATE + 3 * HOUR - 1))).toMatch(/Спроси позже/)
    expect(blockReason(s, q(), ctx(LATE + 3 * HOUR))).toBeNull()
  })
  it('третье подряд — 7 суток и счёт с нуля', () => {
    let s = base()
    s = noteLater(s, q(), LATE)
    s = noteLater(s, q(), LATE + 4 * HOUR)
    expect(s.laterStreak).toBe(2)
    s = noteLater(s, q(), LATE + 8 * HOUR)
    expect(s.laterUntil).toBe(LATE + 8 * HOUR + 7 * DAY)
    expect(s.laterStreak).toBe(0)
  })
  it('ответ между «позже» обрывает серию', () => {
    let s = noteLater(noteLater(base(), q(), LATE), q(), LATE)
    s = noteAnswer(s, q())
    s = noteLater(s, q(), LATE + 5 * HOUR)
    expect(s.laterUntil).toBe(LATE + 8 * HOUR)
  })
})

describe('самовыключение вида', () => {
  const run = (shown, dismissed) => {
    let s = base()
    for (let i = 0; i < shown; i++) s = noteShown(s, q(), LATE)
    for (let i = 0; i < dismissed; i++) s = noteDismiss(s, q(), LATE)
    return s
  }
  it('≥10 показов и доля закрытий ≥ 0.7 — вид выключен, шторки не показываются', () => {
    const s = run(10, 7)
    expect(s.offKinds.question).toBe(true)
    expect(blockReason(s, q(), ctx(LATE + 365 * DAY))).toMatch(/выключен/)
    const next = startSession(s, LATE) // новая сессия: лимит за сессию не мешает
    expect(pickNext(next, [q(), hint()], ctx(LATE + 365 * DAY)).id).toBe('h1')
  })
  it('доля меньше 0.7 или показов меньше 10 — не выключается', () => {
    expect(run(10, 6).offKinds.question).toBeUndefined()
    expect(run(9, 9).offKinds.question).toBeUndefined()
    expect(run(20, 13).offKinds.question).toBeUndefined()
    expect(run(20, 14).offKinds.question).toBe(true)
  })
})

describe('prune и normalizeState', () => {
  it('prune снимает истёкшие паузы, живые и счётчики оставляет', () => {
    let s = { ...base(), pausedKinds: { question: LATE - 1, hint: LATE + 1 }, laterUntil: LATE - 1, dismissStreak: { question: 2 }, hintIgnored: { h1: 3 } }
    s = prune(s, LATE)
    expect(s.pausedKinds).toEqual({ hint: LATE + 1 })
    expect(s.laterUntil).toBe(0)
    expect(s.dismissStreak).toEqual({ question: 2 })
    expect(s.hintIgnored).toEqual({ h1: 3 })
    expect(prune({ ...s, laterUntil: LATE + 5 }, LATE).laterUntil).toBe(LATE + 5)
  })
  it('normalizeState: мусор → пустое состояние, годное сохраняется', () => {
    expect(normalizeState(null)).toEqual(emptyState())
    expect(normalizeState('x')).toEqual(emptyState())
    expect(normalizeState({ sessions: 'много', pausedKinds: { a: 'b', c: 5 }, shownSession: [1, { id: 'a' }], offKinds: { q: 1 } }))
      .toEqual({ ...emptyState(), pausedKinds: { c: 5 }, shownSession: [{ id: 'a' }] })
    const s = noteDismiss(noteShown(base(), q(), LATE), q(), LATE)
    expect(normalizeState(JSON.parse(JSON.stringify(s)))).toEqual(s)
  })
})

describe('иммутабельность', () => {
  it('ни одна функция не меняет входное состояние', () => {
    const s = { ...base(), stats: { question: { shown: 9, dismissed: 8 } } }
    const frozen = JSON.stringify(s)
    const deep = o => { Object.values(o).forEach(v => v && typeof v === 'object' && deep(v)); return Object.freeze(o) }
    deep(s)
    const a = q('a')
    const outs = [
      startSession(s, LATE), onSlide(s, 1), noteShown(s, a, LATE), noteAnswer(s, a), noteDismiss(s, a, LATE),
      noteDismiss(s, hint(), LATE), noteLater(s, a, LATE), prune(s, LATE),
    ]
    outs.forEach(o => expect(o).not.toBe(s))
    expect(JSON.stringify(s)).toBe(frozen)
  })
})
