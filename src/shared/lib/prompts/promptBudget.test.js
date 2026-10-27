import { describe, it, expect } from 'vitest'
import {
  emptyState, startSession, onSlide, blockReason, canShow, pickNext,
  noteShown, noteAnswer, noteDismiss, noteLater,
} from './promptBudget.js'
import * as R from './promptRules.js'

const DAY = 24 * 60 * 60 * 1000
const T0 = 1_000_000_000_000
const q = (id, extra = {}) => ({ id, kind: 'question', reason: 'behavior', ...extra })
const hint = (id = 'h1') => ({ id, kind: 'hint', reason: 'ui_hint' })
const free = { audio: false, input: false, afterError: false, afterDontKnow: false }
const ctx = (now, busy = {}) => ({ now, busy: { ...free, ...busy } })

// Сессия, начатая в T0; время «после 20 с» — LATE
const LATE = T0 + R.MIN_MS_AFTER_OPEN + 1
const fresh = (sessions = 1) => {
  let s = emptyState()
  for (let i = 0; i < sessions; i++) s = startSession(s, T0)
  return s
}
const slides = (s, n) => { for (let i = 0; i < n; i++) s = onSlide(s, i); return s }

describe('promptRules', () => {
  it('числа плана A1', () => {
    expect(R.MIN_SLIDES_BETWEEN).toBe(5)
    expect(R.MAX_PER_SESSION_EARLY).toBe(2)
    expect(R.MAX_PER_SESSION).toBe(3)
    expect(R.EARLY_SESSIONS).toBe(3)
    expect(R.MIN_MS_AFTER_OPEN).toBe(20_000)
    expect(R.DISMISS_PAUSE_MS).toEqual({ 2: 7 * DAY, 3: 30 * DAY })
    expect(R.LATER_PAUSE_MS).toBe(3 * 60 * 60 * 1000)
    expect(R.LATER_LONG_MS).toBe(7 * DAY)
    expect(R.PRIORITY).toEqual(['explain_done', 'asked', 'behavior', 'ui_hint', 'game_offer', 'notify_ask'])
    expect(Object.keys(R.KINDS)).toEqual(['question', 'hint', 'offer', 'reminder'])
  })
})

describe('сессия и слайды', () => {
  it('startSession: счётчики сессии с нуля, паузы и статистика живут дальше', () => {
    let s = fresh()
    s = slides(s, 3)
    s = noteShown(s, q('a', { aboutPerson: true }), LATE)
    s = noteDismiss(s, q('a'), LATE)
    const n = startSession(s, T0 + DAY)
    expect(n).toMatchObject({ sessions: 2, sessionAt: T0 + DAY, slide: 0, lastSlide: null, shownSession: [], aboutPerson: 0 })
    expect(n.stats.question.shown).toBe(1)
    expect(n.dismissStreak.question).toBe(1)
  })
  it('onSlide считает смены слайда; нечисловой индекс игнорируется', () => {
    const s = fresh()
    expect(onSlide(onSlide(s, 4), 5).slide).toBe(2)
    expect(onSlide(s, undefined)).toBe(s)
  })
})

describe('blockReason: каждая причина по очереди', () => {
  it('чистая сессия после 20 с — можно', () => {
    expect(blockReason(fresh(), q('a'), ctx(LATE))).toBeNull()
    expect(canShow(fresh(), q('a'), ctx(LATE))).toBe(true)
  })
  it('вид выключен', () => {
    const s = { ...fresh(), offKinds: { question: true } }
    expect(blockReason(s, q('a'), ctx(LATE))).toMatch(/выключен/)
  })
  it('подсказка снята навсегда — только по id этой подсказки', () => {
    const s = { ...fresh(), hintIgnored: { h1: 3 } }
    expect(blockReason(s, hint('h1'), ctx(LATE))).toMatch(/снята навсегда/)
    expect(blockReason(s, hint('h2'), ctx(LATE))).toBeNull()
  })
  it('вид на паузе, пока pausedKinds[kind] > now', () => {
    const s = { ...fresh(), pausedKinds: { question: LATE + 1 } }
    expect(blockReason(s, q('a'), ctx(LATE))).toMatch(/на паузе/)
    expect(blockReason(s, q('a'), ctx(LATE + 1))).toBeNull()
    expect(blockReason(s, hint(), ctx(LATE))).toBeNull() // другой вид не задет
  })
  it('пауза «Спроси позже» общая для всех видов', () => {
    const s = { ...fresh(), laterUntil: LATE + 5 }
    expect(blockReason(s, q('a'), ctx(LATE))).toMatch(/Спроси позже/)
    expect(blockReason(s, hint(), ctx(LATE))).toMatch(/Спроси позже/)
    expect(blockReason(s, q('a'), ctx(LATE + 5))).toBeNull()
  })
  it('busy: звук, ввод, после ошибки, после «не знаю»', () => {
    const s = fresh()
    expect(blockReason(s, q('a'), ctx(LATE, { audio: true }))).toMatch(/звук/)
    expect(blockReason(s, q('a'), ctx(LATE, { input: true }))).toMatch(/вводит/)
    expect(blockReason(s, q('a'), ctx(LATE, { afterError: true }))).toMatch(/ошибка/)
    expect(blockReason(s, q('a'), ctx(LATE, { afterDontKnow: true }))).toMatch(/Не знаю/)
  })
  it('раньше 20 с после входа нельзя, ровно на 20-й секунде — можно', () => {
    const s = fresh()
    expect(blockReason(s, q('a'), ctx(T0 + 19_999))).toMatch(/20 с/)
    expect(blockReason(s, q('a'), ctx(T0 + 20_000))).toBeNull()
  })
  it('порядок: выключен раньше паузы, пауза раньше busy, busy раньше 20 с', () => {
    const s = { ...fresh(), offKinds: { question: true }, pausedKinds: { question: LATE + 9 }, laterUntil: LATE + 9 }
    expect(blockReason(s, q('a'), ctx(T0, { audio: true }))).toMatch(/выключен/)
    const p = { ...fresh(), pausedKinds: { question: LATE + 9 }, laterUntil: LATE + 9 }
    expect(blockReason(p, q('a'), ctx(T0, { audio: true }))).toMatch(/на паузе/)
    expect(blockReason({ ...p, pausedKinds: {} }, q('a'), ctx(T0, { audio: true }))).toMatch(/Спроси позже/)
    expect(blockReason(fresh(), q('a'), ctx(T0, { audio: true }))).toMatch(/звук/)
    expect(blockReason(fresh(), q('a'), ctx(T0))).toMatch(/20 с/)
  })
})

describe('лимит за сессию и интервалы', () => {
  it('первые 3 сессии — не больше 2 за сессию', () => {
    let s = fresh(1)
    s = noteShown(s, q('a'), LATE)
    s = noteShown(slides(s, 5), q('b'), LATE)
    expect(blockReason(slides(s, 9), q('c'), ctx(LATE))).toMatch(/за сессию/)
  })
  it('с 4-й сессии — до 3 за сессию', () => {
    let s = fresh(4)
    for (const id of ['a', 'b']) s = noteShown(slides(s, 5), q(id), LATE)
    expect(blockReason(slides(s, 5), q('c'), ctx(LATE))).toBeNull()
    s = noteShown(slides(s, 5), q('c'), LATE)
    expect(blockReason(slides(s, 9), q('d'), ctx(LATE))).toMatch(/за сессию/)
  })
  it('граница: 3-я сессия ещё ранняя, 4-я уже обычная', () => {
    const two = s => noteShown(slides(noteShown(s, q('a'), LATE), 5), q('b'), LATE)
    expect(blockReason(slides(two(fresh(3)), 5), q('c'), ctx(LATE))).toMatch(/за сессию/)
    expect(blockReason(slides(two(fresh(4)), 5), q('c'), ctx(LATE))).toBeNull()
  })
  it('вопрос «про человека» — раз в сессию; в новой сессии снова можно', () => {
    let s = noteShown(fresh(4), q('a', { aboutPerson: true }), LATE)
    s = slides(s, 5)
    expect(blockReason(s, q('b', { aboutPerson: true }), ctx(LATE))).toMatch(/про человека/)
    expect(blockReason(s, q('b'), ctx(LATE))).toBeNull() // обычный вопрос — можно
    expect(blockReason(startSession(s, LATE), q('b', { aboutPerson: true }), ctx(LATE + R.MIN_MS_AFTER_OPEN))).toBeNull()
  })
  it('не прошло 5 слайдов — нельзя; на 5-м — можно; первый показ сессии без ограничения', () => {
    const s0 = fresh(4)
    expect(blockReason(slides(s0, 0), q('a'), ctx(LATE))).toBeNull() // первый показ, слайдов 0
    const s = noteShown(slides(s0, 2), q('a'), LATE)
    expect(blockReason(slides(s, 4), q('b'), ctx(LATE))).toMatch(/5 слайдов/)
    expect(blockReason(slides(s, 5), q('b'), ctx(LATE))).toBeNull()
  })
})

describe('pickNext: приоритет', () => {
  const list = [
    { id: 'n', kind: 'reminder', reason: 'notify_ask' },
    { id: 'g', kind: 'offer', reason: 'game_offer' },
    hint('u'),
    q('b'),
    q('x', { reason: 'asked' }),
    q('e', { kind: 'offer', reason: 'explain_done' }),
  ]
  it('берёт самую важную категорию', () => {
    expect(pickNext(fresh(), list, ctx(LATE)).id).toBe('e')
    expect(pickNext(fresh(), list.slice(0, 5), ctx(LATE)).id).toBe('x')
    expect(pickNext(fresh(), list.slice(0, 4), ctx(LATE)).id).toBe('b')
    expect(pickNext(fresh(), list.slice(0, 3), ctx(LATE)).id).toBe('u')
    expect(pickNext(fresh(), list.slice(0, 2), ctx(LATE)).id).toBe('g')
  })
  it('при равной категории — первый в списке; неизвестная категория — последняя', () => {
    expect(pickNext(fresh(), [q('p'), q('r')], ctx(LATE)).id).toBe('p')
    expect(pickNext(fresh(), [q('z', { reason: 'weird' }), q('r')], ctx(LATE)).id).toBe('r')
  })
  it('запрещённых пропускает и берёт следующего; никого нельзя — null', () => {
    const s = { ...fresh(), offKinds: { offer: true } }
    expect(pickNext(s, list, ctx(LATE)).id).toBe('x')
    expect(pickNext(fresh(), list, ctx(T0))).toBeNull()
    expect(pickNext(fresh(), [], ctx(LATE))).toBeNull()
  })
})

describe('noteShown / noteAnswer', () => {
  it('показ: shownSession, lastSlide, aboutPerson, stats', () => {
    const s = noteShown(slides(fresh(), 3), q('a', { aboutPerson: true }), LATE)
    expect(s.shownSession).toEqual([{ id: 'a', kind: 'question', at: LATE }])
    expect(s.lastSlide).toBe(3)
    expect(s.aboutPerson).toBe(1)
    expect(s.stats.question).toEqual({ shown: 1, dismissed: 0 })
    expect(noteShown(s, q('b'), LATE).aboutPerson).toBe(1)
  })
  it('ответ обнуляет закрытия подряд этого вида и «позже» подряд', () => {
    let s = noteDismiss(fresh(), q('a'), LATE)
    s = noteDismiss(s, hint(), LATE)
    s = noteLater(s, q('a'), LATE)
    s = noteAnswer(s, q('a'))
    expect(s.dismissStreak.question).toBe(0)
    expect(s.dismissStreak.hint).toBe(1)
    expect(s.laterStreak).toBe(0)
  })
})
