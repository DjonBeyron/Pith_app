import { describe, it, expect } from 'vitest'
import { createBoxFree, FREE_WINDOW_MS } from './miaBoxFree.js'

describe('снятие коробки с Пита', () => {
  it('два касания подряд в окне — коробка снята; третье уже «снята»', () => {
    const b = createBoxFree(); expect(b.hit(1000)).toBe('one'); expect(b.hit(1400)).toBe('free'); expect(b.isDone()).toBe(true); expect(b.hit(1500)).toBe('done')
  })
  it('одно касание: по таймеру окно истекло — «быстрее», счёт с нуля; раньше окна — нет', () => {
    const b = createBoxFree(); b.hit(0)
    expect(b.expired(FREE_WINDOW_MS - 10)).toBe(false); expect(b.expired(FREE_WINDOW_MS + 10)).toBe(true); expect(b.expired(FREE_WINDOW_MS + 20)).toBe(false)
    expect(b.hit(5000)).toBe('one') // после сброса нужны снова два
  })
  it('второе касание позже окна — считается первым (не снимает)', () => {
    const b = createBoxFree(); b.hit(0); expect(b.hit(FREE_WINDOW_MS + 500)).toBe('one'); expect(b.hit(FREE_WINDOW_MS + 700)).toBe('free')
  })
})

describe("Мия выпрыгивает одна, коробка остаётся на Пите (машина Мии)", async () => {
  const { reduceMia, miaInit } = await import('./raceMia.js')
  const keepState = () => ({ ...miaInit(), phase: 'in', act: 'boss', keep: true, solo: 'keep', reds: 6, total: 6 })
  it('stuck: Пит просит помочь; free: коробка отлетает без Мии (phase out, alone), keep снят, Пит благодарит; faster — «быстрее»', () => {
    const a = reduceMia(keepState(), { t: 'stuck', now: 1000 })
    expect(a.mia.solo).toBe('stuck'); expect(a.say.map(l => l.id)).toEqual(['boss_pit_stuck'])
    expect(reduceMia(a.mia, { t: 'faster' }).say.map(l => l.id)).toEqual(['boss_pit_faster'])
    const f = reduceMia(a.mia, { t: 'free', now: 9000 })
    expect(f.mia).toMatchObject({ phase: 'out', alone: true, keep: false, solo: null, why: 'freed' }); expect(f.say.map(l => l.id)).toEqual(['pit_back_1'])
  })
  it('try: Мия ушла — Пит говорит «Она ушла? Попробую выбраться» (состояние keep не меняется), вне keep — ничего', () => {
    const k = reduceMia(keepState(), { t: 'try', now: 1 })
    expect(k.say.map(l => l.id)).toEqual(['boss_pit_try']); expect(k.mia.solo).toBe('keep')
    expect(reduceMia({ ...keepState(), solo: null }, { t: 'try', now: 1 }).say).toHaveLength(0)
  })
  it('вне состояния stuck события ничего не делают (двойной free, free до выпрыгивания)', () => {
    const k = keepState(); expect(reduceMia(k, { t: 'free', now: 1 }).say).toHaveLength(0); expect(reduceMia(k, { t: 'faster' }).say).toHaveLength(0)
    const f = reduceMia(reduceMia(k, { t: 'stuck', now: 1 }).mia, { t: 'free', now: 2 }); expect(reduceMia(f.mia, { t: 'free', now: 3 }).say).toHaveLength(0)
  })
})

describe('Мия одна: прыжок и ожидание речи', async () => {
  const { soloLeave, SOLO } = await import('./miaMotion.js')
  it('soloLeave: присела, прыгнула, ушла (done на SOLO.END)', () => {
    expect(soloLeave(0).u).toBe(0); expect(soloLeave(SOLO.CROUCH + SOLO.JUMP / 2).u).toBeCloseTo(0.5, 2); expect(soloLeave(SOLO.END - 0.01).done).toBe(false); expect(soloLeave(SOLO.END).done).toBe(true); expect(soloLeave(0.15).sy).toBeLessThan(1)
  })
  it('очередь речи: idleIn считает играющую и отложенные реплики (0 — тишина)', async () => {
    const { createMiaSpeech } = await import('./miaSpeech.js')
    let t = 1000; const timers = []
    const sp = createMiaSpeech({ now: () => t, setTimer: (fn, ms) => { timers.push([fn, ms]); return timers.length }, clearTimer: () => {}, play: () => false, has: () => false, onSpeak: () => {}, onCaption: () => {} })
    expect(sp.idleIn()).toBe(0)
    sp.enqueue([{ id: 'mia_miss_1', who: 'mia', delay: 2900 }])
    expect(sp.idleIn()).toBeGreaterThan(2900)
  })
})
