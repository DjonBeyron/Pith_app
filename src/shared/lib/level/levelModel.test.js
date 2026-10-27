import { describe, it, expect } from 'vitest'
import { emptyLevel, observe, applySignal, describeLevel, pickTargetDifficulty } from './levelModel.js'
import { SIGMA_MIN, TARGET_OK, MARGIN_OK, MARGIN_FAIL, DIFF_TO_LEVEL } from './levelRules.js'

const run = (lv, signals) => signals.reduce((l, s, i) => applySignal(l, s, 1000 + i), lv)
const rep = (s, n) => Array.from({ length: n }, () => s)
const at = (level, ear = level, vocab = level, sigma = 0.1) => ({
  ear: { level: ear, sigma, n: 5 }, vocab: { level: vocab, sigma, n: 5 }, updatedAt: 0,
})

describe('observe', () => {
  it('отношение запасов даёт равновесие TARGET_OK', () => {
    expect(MARGIN_FAIL / MARGIN_OK).toBeCloseTo(TARGET_OK / (1 - TARGET_OK), 6)
  })

  it('верный ответ выше уровня тянет вверх, неверный на уровне — вниз', () => {
    const ax = { level: 0.5, sigma: 0.3, n: 0 }
    expect(observe(ax, { at: 0.75, ok: true }).level).toBeGreaterThan(0.5)
    expect(observe(ax, { at: 0.5, ok: false }).level).toBeLessThan(0.5)
  })

  it('односторонне: верно на лёгком и неверно на сложном уровень не двигают', () => {
    const ax = { level: 0.5, sigma: 0.3, n: 0 }
    expect(observe(ax, { at: 0.25, ok: true }).level).toBe(0.5)
    expect(observe(ax, { at: 0.9, ok: false }).level).toBe(0.5)
  })

  it('sigma убывает, не ниже минимума; n растёт; вход не меняется', () => {
    let ax = { level: 0.5, sigma: 0.35, n: 0 }
    const frozen = JSON.stringify(ax)
    const next = observe(ax, { at: 0.5, ok: true })
    expect(JSON.stringify(ax)).toBe(frozen)
    expect(next.sigma).toBeLessThan(0.35)
    expect(next.n).toBe(1)
    for (let i = 0; i < 200; i++) ax = observe(ax, { at: ax.level, ok: i % 2 === 0 })
    expect(ax.sigma).toBeCloseTo(SIGMA_MIN, 6)
    expect(ax.level).toBeGreaterThanOrEqual(0)
    expect(ax.level).toBeLessThanOrEqual(1)
  })

  it('на материале «по уровню» с долей верных 85% уровень почти стоит', () => {
    let ax = { level: 0.5, sigma: SIGMA_MIN, n: 50 }
    for (let i = 0; i < 100; i++) ax = observe(ax, { at: 0.5, ok: i % 20 < 17 }) // 85% верных
    expect(Math.abs(ax.level - 0.5)).toBeLessThan(0.08)
  })
})

describe('applySignal: последовательности', () => {
  it('серия верных ответов на лёгком, потом на среднем — уровень словаря вверх', () => {
    const l = run(emptyLevel(), rep({ type: 'answer', ok: true, difficulty: 3 }, 6))
    expect(l.vocab.level).toBeGreaterThan(0.6)
    expect(l.ear.level).toBe(0.5) // ответ в уроке — ось словаря
  })

  it('серия неверных — вниз', () => {
    const l = run(emptyLevel(), rep({ type: 'answer', ok: false, difficulty: 1 }, 6))
    expect(l.vocab.level).toBeLessThan(0.3)
  })

  it('scene_task_answer идёт на ухо, axis both — на обе оси', () => {
    const ear = applySignal(emptyLevel(), { type: 'answer', ok: false, value: 'scene_task_answer' }, 1)
    expect(ear.ear.level).toBeLessThan(0.5)
    expect(ear.vocab.level).toBe(0.5)
    const both = applySignal(emptyLevel(), { type: 'answer', ok: false, axis: 'both' }, 1)
    expect(both.ear.level).toBeLessThan(0.5)
    expect(both.vocab.level).toBeLessThan(0.5)
  })

  it('один быстрый пролист (шум) почти не двигает уровень', () => {
    const settled = at(0.5)
    const hard = applySignal(settled, { type: 'quick_skip', difficulty: 3 }, 1)
    const easy = applySignal(settled, { type: 'quick_skip', difficulty: 1 }, 1)
    expect(Math.abs(hard.ear.level - 0.5)).toBeLessThan(0.02)
    expect(Math.abs(easy.ear.level - 0.5)).toBeLessThan(0.02)
  })

  it('пролист лёгкого и сложного трактуются противоположно', () => {
    const lv = emptyLevel()
    const easy = applySignal(lv, { type: 'quick_skip', difficulty: 1 }, 1)
    const hard = applySignal(lv, { type: 'quick_skip', difficulty: 3 }, 1)
    expect(easy.ear.level).toBeGreaterThan(0.5)
    expect(hard.ear.level).toBeLessThan(0.5)
  })

  it('пролист слайда «в тон» уровню — неоднозначно, ничего не меняется', () => {
    const lv = emptyLevel()
    expect(applySignal(lv, { type: 'quick_skip', difficulty: 2 }, 1)).toEqual(lv)
    expect(applySignal(lv, { type: 'quick_skip' }, 1)).toEqual(lv)
  })

  it('серия пролистов сложного уровень снижает, лёгкого — поднимает', () => {
    expect(run(emptyLevel(), rep({ type: 'quick_skip', difficulty: 3 }, 8)).ear.level).toBeLessThan(0.45)
    expect(run(emptyLevel(), rep({ type: 'quick_skip', difficulty: 1 }, 8)).ear.level).toBeGreaterThan(0.52)
  })

  it('досмотр сложного — вверх; признаки «тяжело» — вниз', () => {
    expect(applySignal(emptyLevel(), { type: 'watched', difficulty: 3 }, 1).ear.level).toBeGreaterThan(0.5)
    expect(applySignal(emptyLevel(), { type: 'hard_sign' }, 1).ear.level).toBeLessThan(0.5)
  })

  it('голос сложности: 1 — вверх, 3 — вниз, мусор — без изменений', () => {
    expect(applySignal(emptyLevel(), { type: 'difficulty_vote', value: 1 }, 1).ear.level).toBeGreaterThan(0.5)
    expect(applySignal(emptyLevel(), { type: 'difficulty_vote', value: '3' }, 1).ear.level).toBeLessThan(0.5)
    const lv = emptyLevel()
    expect(applySignal(lv, { type: 'difficulty_vote', value: 9 }, 1)).toEqual(lv)
  })

  it('pit_answer: too_easy — вверх по обеим осям, too_fast — ухо вниз, fine — только sigma', () => {
    const up = applySignal(emptyLevel(), { type: 'pit_answer', value: 'too_easy' }, 1)
    expect(up.ear.level).toBeGreaterThan(0.5)
    expect(up.vocab.level).toBeGreaterThan(0.5)
    const down = applySignal(emptyLevel(), { type: 'pit_answer', value: 'too_fast' }, 1)
    expect(down.ear.level).toBeLessThan(0.5)
    expect(down.vocab.level).toBe(0.5)
    const fine = applySignal(emptyLevel(), { type: 'pit_answer', value: 'fine' }, 1)
    expect(fine.ear.level).toBe(0.5)
    expect(fine.ear.sigma).toBeLessThan(0.35)
  })

  it('итог Старта: доля верных двигает словарь', () => {
    expect(applySignal(emptyLevel(), { type: 'start_result', ok: 1 }, 1).vocab.level).toBeGreaterThan(0.6)
    expect(applySignal(emptyLevel(), { type: 'start_result', ok: 0.1 }, 1).vocab.level).toBeLessThan(0.4)
  })

  it('неизвестный сигнал — без изменений; updatedAt = now', () => {
    const lv = emptyLevel()
    expect(applySignal(lv, { type: 'nope' }, 5)).toEqual(lv)
    expect(applySignal(lv, { type: 'hard_sign' }, 777).updatedAt).toBe(777)
  })

  it('иммутабельность: исходный уровень не меняется', () => {
    const lv = emptyLevel()
    const frozen = JSON.stringify(lv)
    Object.freeze(lv.ear); Object.freeze(lv.vocab); Object.freeze(lv)
    const out = applySignal(lv, { type: 'answer', ok: true, difficulty: 3 }, 1)
    expect(JSON.stringify(lv)).toBe(frozen)
    expect(out).not.toBe(lv)
    expect(out.vocab).not.toBe(lv.vocab)
  })
})

describe('describeLevel / pickTargetDifficulty', () => {
  it('слова и уверенность', () => {
    expect(describeLevel(at(0.2, 0.5, 0.9, 0.1))).toEqual({ ear: 'средний', vocab: 'высокий', confident: true })
    expect(describeLevel(emptyLevel()).confident).toBe(false)
    expect(describeLevel(at(0.1, 0.1, 0.1)).ear).toBe('низкий')
  })

  it('ближайшая ступень к ear.level', () => {
    expect(pickTargetDifficulty(at(0.1), 0)).toBe(1)
    expect(pickTargetDifficulty(at(0.5), 0)).toBe(2)
    expect(pickTargetDifficulty(at(0.9), 1)).toBe(3)
  })

  it('каждый 5-й слайд — на ступень выше, но не выше 3', () => {
    const lv = at(0.25)
    expect([0, 1, 2, 3, 4, 5, 9].map(i => pickTargetDifficulty(lv, i))).toEqual([1, 1, 1, 1, 2, 1, 2])
    expect(pickTargetDifficulty(at(0.75), 4)).toBe(3)
    expect(DIFF_TO_LEVEL[3]).toBe(0.75)
  })
})
