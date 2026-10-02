import { describe, it, expect, beforeEach } from 'vitest'
import {
  recallView, pickRecallWord, translationPool, quizOptions, recallOutcome, recallState, recallResult,
  recallColor, recallHoldMs, shownToday, markShown, canOffer, RECALL_GAP, RECALL_PER_DAY, LEVEL_COLOR,
} from './feedRecall.js'

// localStorage в node-окружении vitest нет — подставляем
beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
})

const entries = [{ w: 'I', t: 'я' }, { w: 'trying', t: 'пытаюсь' }, { w: 'to', t: 'к' }, { w: 'cook', t: 'готовить' }]
const view = (picked, dueOf = {}, extra = {}) => ({
  vacation: null,
  today: { picked },
  dueOf: new Map(Object.entries(dueOf)),
  ...extra,
})

describe('recallView', () => {
  it('нет выбора дня или отпуск — null', () => {
    expect(recallView(null)).toBe(null)
    expect(recallView(view([]))).toBe(null)
    expect(recallView(view([{ word: 'cook', step: 2 }], {}, { vacation: { since: '2026-10-01' } }))).toBe(null)
  })

  it('слова дня со сроком и шагом', () => {
    const rv = recallView(view([{ word: 'cook', step: 2 }], { cook: '2026-10-02' }))
    expect(rv.due.get('cook')).toEqual({ step: 2, due: '2026-10-02' })
  })
})

describe('pickRecallWord', () => {
  const rv = picked => recallView(view(picked.map(([word, step]) => ({ word, step })), Object.fromEntries(picked.map(([w, , d]) => [w, d]))))

  it('слова со сроком «сегодня» нет во фразе — молчим', () => {
    expect(pickRecallWord('I’m trying to cook', entries, rv([['dance', 2, '2026-10-02']]))).toBe(null)
    expect(pickRecallWord('I’m trying to cook', entries, null)).toBe(null)
  })

  it('слово без перевода не спрашиваем', () => {
    expect(pickRecallWord('I am trying', [{ w: 'trying', t: '' }], rv([['trying', 2, '2026-10-02']]))).toBe(null)
  })

  it('берёт слово фразы с его переводом и индексом', () => {
    const w = pickRecallWord('I am trying to cook', [{ w: 'I', t: 'я' }, { w: 'am', t: 'есть' }, { w: 'trying', t: 'пытаюсь' }], rv([['trying', 2, '2026-10-02']]))
    expect(w).toMatchObject({ key: 'trying', index: 2, tr: 'пытаюсь', step: 2 })
  })

  it('два слова: раньше срок, при равенстве — слабее', () => {
    const t = 'I am trying to cook'
    const e = [{ w: 'I', t: 'я' }, { w: 'am', t: 'есть' }, { w: 'trying', t: 'пытаюсь' }, { w: 'to', t: 'к' }, { w: 'cook', t: 'готовить' }]
    expect(pickRecallWord(t, e, rv([['trying', 2, '2026-10-02'], ['cook', 3, '2026-10-01']])).key).toBe('cook')
    expect(pickRecallWord(t, e, rv([['trying', 2, '2026-10-02'], ['cook', 1, '2026-10-02']])).key).toBe('cook')
    expect(pickRecallWord(t, e, rv([['trying', 1, '2026-10-02'], ['cook', 1, '2026-10-02']])).key).toBe('trying')
  })

  it('одно слово дважды — берёт первое вхождение', () => {
    const w = pickRecallWord('go go now', [{ w: 'go', t: 'идти' }, { w: 'go', t: 'идти' }, { w: 'now', t: 'сейчас' }], rv([['go', 1, '2026-10-02']]))
    expect(w.index).toBe(0)
  })
})

describe('translationPool и quizOptions', () => {
  it('пул — переводы всех модулей без повторов и пустых', () => {
    const pool = translationPool([{ wordTranslations: entries }, { wordTranslations: [{ w: 'x', t: 'я' }, { w: 'y', t: ' ' }] }, { wordTranslations: null }])
    expect(pool).toEqual(['я', 'пытаюсь', 'к', 'готовить'])
  })

  it('верный + два чужих, без повторов и без верного среди чужих', () => {
    const opts = quizOptions('пытаюсь', ['я', 'Пытаюсь', 'к', 'готовить'])
    expect(opts).toHaveLength(3)
    expect(opts).toContain('пытаюсь')
    expect(new Set(opts.map(o => o.toLowerCase())).size).toBe(3)
  })

  it('верный вариант встаёт на любое место', () => {
    const seen = new Set()
    for (let i = 0; i < 60; i++) seen.add(quizOptions('а', ['б', 'в', 'г']).indexOf('а'))
    expect(seen).toEqual(new Set([0, 1, 2]))
  })

  it('чужих меньше двух — null (молчим)', () => {
    expect(quizOptions('а', ['б'])).toBe(null)
    expect(quizOptions('а', ['а', 'А', 'б'])).toBe(null)
    expect(quizOptions('а', [])).toBe(null)
  })
})

describe('исход ответа', () => {
  it('верно и быстро — good / ok', () => {
    expect(recallOutcome(true, 2000)).toBe('good')
    expect(recallState('good')).toBe('ok')
  })

  it('верно, но долго — hard', () => {
    expect(recallOutcome(true, 20000)).toBe('hard')
    expect(recallState('hard')).toBe('hard')
  })

  it('ошибка — again (−1, не fail) / bad', () => {
    expect(recallOutcome(false, 1000)).toBe('again')
    expect(recallState('again')).toBe('bad')
  })
})

describe('recallResult', () => {
  it('берёт шаг и постоянную память из ответа сервера', () => {
    expect(recallResult({ outcome: 'good', step: 2, wasSettled: false, res: { ok: true, prev_step: 2, step: 3, settled_on: null } }))
      .toEqual({ from: 2, to: 3, perm: false })
    expect(recallResult({ outcome: 'good', step: 5, wasSettled: false, res: { ok: true, prev_step: 5, step: 5, settled: true, settled_on: '2026-10-02' } }))
      .toEqual({ from: 5, to: 5, perm: true })
  })

  it('сервер не ответил — считаем сами: +1, тот же шаг, −1', () => {
    expect(recallResult({ outcome: 'good', step: 2, wasSettled: false, res: null })).toEqual({ from: 2, to: 3, perm: false })
    expect(recallResult({ outcome: 'good', step: 5, wasSettled: false, res: null })).toEqual({ from: 5, to: 5, perm: true })
    expect(recallResult({ outcome: 'hard', step: 4, wasSettled: false, res: null })).toEqual({ from: 4, to: 4, perm: false })
    expect(recallResult({ outcome: 'hard', step: 5, wasSettled: true, res: null })).toEqual({ from: 5, to: 5, perm: true })
    expect(recallResult({ outcome: 'again', step: 1, wasSettled: false, res: null })).toEqual({ from: 1, to: 1, perm: false })
    expect(recallResult({ outcome: 'again', step: 5, wasSettled: true, res: null })).toEqual({ from: 5, to: 4, perm: false })
  })
})

describe('цвет и время плашки', () => {
  it('до ответа — ступень слова, после — ступень, в которую пришло; постоянная — фиолетовая', () => {
    expect(recallColor({ phase: 'quiz', step: 2 })).toBe(LEVEL_COLOR[1])
    expect(recallColor({ phase: 'quiz', step: 4 })).toBe(LEVEL_COLOR[2])
    expect(recallColor({ phase: 'quiz', step: 5, wasSettled: true })).toBe(LEVEL_COLOR.P)
    expect(recallColor({ phase: 'ok', step: 2, from: 2, to: 3 })).toBe(LEVEL_COLOR[2])
    expect(recallColor({ phase: 'ok', step: 5, from: 5, to: 5, perm: true })).toBe(LEVEL_COLOR.P)
    expect(recallColor(null)).toBe(null)
  })

  it('результат уходит через ≈3 с (ok — 3,4 с), смена ступени — дольше, чтобы доехала полоска', () => {
    expect(recallHoldMs({ phase: 'hard', step: 2, from: 2, to: 2 })).toBe(3000)
    expect(recallHoldMs({ phase: 'bad', step: 2, from: 2, to: 1 })).toBe(3000)
    expect(recallHoldMs({ phase: 'ok', step: 1, from: 1, to: 2 })).toBe(3400)
    expect(recallHoldMs({ phase: 'ok', step: 2, from: 2, to: 3 })).toBeGreaterThan(5000)
    expect(recallHoldMs({ phase: 'ok', step: 5, from: 5, to: 5, perm: true })).toBeGreaterThan(5000)
  })
})

describe('лимиты показа', () => {
  it('счётчик за день: на другой день с нуля', () => {
    expect(shownToday('2026-10-02')).toBe(0)
    markShown('2026-10-02')
    markShown('2026-10-02')
    expect(shownToday('2026-10-02')).toBe(2)
    expect(shownToday('2026-10-03')).toBe(0)
  })

  it('не чаще раза в 5 видео и не больше 3 в день', () => {
    expect(RECALL_GAP).toBe(5)
    expect(RECALL_PER_DAY).toBe(3)
    expect(canOffer({ swipes: 4, shown: 0 })).toBe(false)
    expect(canOffer({ swipes: 5, shown: 0 })).toBe(true)
    expect(canOffer({ swipes: 9, shown: 2 })).toBe(true)
    expect(canOffer({ swipes: 9, shown: 3 })).toBe(false)
  })
})
