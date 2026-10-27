import { describe, it, expect } from 'vitest'
import { signalFromEvent } from './levelSignals.js'

const DIFF = { easy: 1, mid: 2, hard: 3 }
const ctx = { difficultyOf: id => DIFF[id] ?? null }

describe('signalFromEvent: пролистывание', () => {
  it('быстрее 2 с — quick_skip со сложностью слайда from', () => {
    expect(signalFromEvent('feed_swipe', { from: 'hard', to: 'easy', dir: 'next', ms_prev: 900 }, ctx))
      .toEqual({ type: 'quick_skip', difficulty: 3 })
  })
  it('быстрый пролист слайда без известной сложности — null', () => {
    expect(signalFromEvent('feed_swipe', { from: 'x', to: 'easy', ms_prev: 500 }, ctx)).toBeNull()
  })
  it('8 с и дольше — watched со сложностью слайда', () => {
    expect(signalFromEvent('feed_swipe', { from: 'mid', to: 'easy', ms_prev: 8000 }, ctx))
      .toEqual({ type: 'watched', difficulty: 2 })
    expect(signalFromEvent('feed_swipe', { from: 'x', to: 'easy', ms_prev: 20000 }, ctx))
      .toEqual({ type: 'watched', difficulty: null })
  })
  it('между 2 и 8 с — сигнала нет; без ms_prev — тоже', () => {
    expect(signalFromEvent('feed_swipe', { from: 'mid', to: 'easy', ms_prev: 5000 }, ctx)).toBeNull()
    expect(signalFromEvent('feed_swipe', { from: 'mid', to: 'easy' }, ctx)).toBeNull()
  })
})

describe('signalFromEvent: признаки трудности', () => {
  it('feed_slow включён → hard_sign, выключен → null', () => {
    expect(signalFromEvent('feed_slow', { module_id: 'hard', on: true }, ctx)).toEqual({ type: 'hard_sign', difficulty: 3 })
    expect(signalFromEvent('feed_slow', { module_id: 'hard', on: false }, ctx)).toBeNull()
  })
  it('feed_reveal и feed_phrase_open → hard_sign', () => {
    expect(signalFromEvent('feed_reveal', { module_id: 'easy' }, ctx)).toEqual({ type: 'hard_sign', difficulty: 1 })
    expect(signalFromEvent('feed_phrase_open', { module_id: 'mid' }, ctx)).toEqual({ type: 'hard_sign', difficulty: 2 })
    expect(signalFromEvent('feed_reveal', { module_id: 'нет' }, ctx)).toEqual({ type: 'hard_sign', difficulty: null })
  })
})

describe('signalFromEvent: ответы', () => {
  it('scene_task_answer → answer по оси ear', () => {
    expect(signalFromEvent('scene_task_answer', { scene_id: 's', ok: true }, ctx)).toEqual({ type: 'answer', axis: 'ear', difficulty: null, ok: true })
    expect(signalFromEvent('scene_task_answer', { ok: false }, ctx).ok).toBe(false)
  })
  it('lesson_answer и feed_recall_answer → answer по оси vocab', () => {
    expect(signalFromEvent('lesson_answer', { lesson_id: 'l', ok: false }, ctx)).toEqual({ type: 'answer', axis: 'vocab', difficulty: null, ok: false })
    expect(signalFromEvent('feed_recall_answer', { word: 'w', ok: true }, ctx)).toEqual({ type: 'answer', axis: 'vocab', difficulty: null, ok: true })
  })
  it('feed_catch_check: верно, только если угаданы все слова', () => {
    expect(signalFromEvent('feed_catch_check', { ok: 3, total: 3 }, ctx)).toMatchObject({ type: 'answer', axis: 'vocab', ok: true })
    expect(signalFromEvent('feed_catch_check', { ok: 2, total: 3 }, ctx)).toMatchObject({ type: 'answer', axis: 'vocab', ok: false })
    expect(signalFromEvent('feed_catch_check', { ok: 0, total: 0 }, ctx)).toBeNull()
  })
})

describe('signalFromEvent: голос и Пит', () => {
  it('голос сложности → difficulty_vote со значением и сложностью модуля', () => {
    expect(signalFromEvent('feed_difficulty_vote', { module_id: 'mid', value: 3 }, ctx)).toEqual({ type: 'difficulty_vote', difficulty: 2, value: 3 })
    expect(signalFromEvent('feed_difficulty_vote', { module_id: 'mid', value: 9 }, ctx)).toBeNull()
  })
  it('prompt_answer с id behavior:* → pit_answer', () => {
    for (const answer of ['too_fast', 'too_easy', 'fine']) {
      expect(signalFromEvent('prompt_answer', { kind: 'question', id: 'behavior:pace', answer }, ctx)).toEqual({ type: 'pit_answer', value: answer })
    }
  })
  it('prompt_answer других видов и неизвестные ответы → null', () => {
    expect(signalFromEvent('prompt_answer', { id: 'ui_hint:sound', answer: 'fine' }, ctx)).toBeNull()
    expect(signalFromEvent('prompt_answer', { id: 'behavior:pace', answer: 'другое' }, ctx)).toBeNull()
    expect(signalFromEvent('prompt_answer', { answer: 'fine' }, ctx)).toBeNull()
  })
})

describe('signalFromEvent: остальное', () => {
  it('прочие события и пустые props → null, без ctx не падает', () => {
    expect(signalFromEvent('feed_like', { module_id: 'mid', on: true }, ctx)).toBeNull()
    expect(signalFromEvent('feed_reveal', null, undefined)).toEqual({ type: 'hard_sign', difficulty: null })
    expect(signalFromEvent('feed_swipe', undefined, undefined)).toBeNull()
  })
})
