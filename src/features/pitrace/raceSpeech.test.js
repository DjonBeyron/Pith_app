import { describe, it, expect } from 'vitest'
import { createRaceSpeech, AFTER_GOOD_GAP_MS, END_GUARD_MS, LOCK_MS } from './raceSpeech.js'
import { GOOD_DELAY_MS, GOOD_ARM_MS } from './raceGood.js'
import { PRE_SAY_GAP_MS } from './raceStageKit.js'
import { halfTravelMs, spawnEarly } from '../player/modules/rotate-phone/wordLaneConveyorSpeed.js'

// Часы и таймеры — вручную: run(ms) двигает время и срабатывает таймеры по порядку
function rig({ praiseOk = true } = {}) {
  let t = 0, seq = 0
  const timers = new Map()
  const events = []
  const handlers = {}
  const setTimer = (fn, ms) => { const id = ++seq; timers.set(id, { at: t + ms, fn }); return id }
  const clearTimer = id => timers.delete(id)
  const run = ms => {
    const end = t + ms
    for (;;) {
      const next = [...timers.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
      if (!next) break
      timers.delete(next[0]); t = next[1].at; next[1].fn()
    }
    t = end
  }
  const sp = createRaceSpeech({
    now: () => t, setTimer, clearTimer, log: s => events.push(`${Math.round(t)} ${s}`),
    say: { praise: (id, h) => { events.push(`${Math.round(t)} КОМАНДА похвала ${id}`); Object.assign(handlers, h); return praiseOk } },
  })
  // «гейт перевода»: когда holdMs() стал 0 после запрета — отмечаем время
  const open = () => sp.holdMs() === 0
  return { sp, run, now: () => t, events, handlers, open }
}

describe('секвенсор речи гонки: порядок и отступы', () => {
  it('зачёт с похвалой: похвала через 500 мс после взлёта, перевод через 350 мс после РЕАЛЬНОГО конца похвалы', () => {
    const r = rig()
    expect(r.sp.holdMs()).toBe(0) // первая пилюля: перевод сразу
    r.run(1000); r.sp.claim('race_good_1')
    expect(r.sp.holdMs()).toBe(LOCK_MS)
    r.run(120); r.sp.riseStart() // взлёт через 120 мс после зачёта
    r.run(GOOD_DELAY_MS - 1)
    expect(r.events.some(e => e.includes('КОМАНДА'))).toBe(false)
    r.run(1)
    expect(r.events.filter(e => e.includes('КОМАНДА'))).toHaveLength(1)
    expect(r.events.find(e => e.includes('КОМАНДА')).startsWith(`${1000 + 120 + GOOD_DELAY_MS} `)).toBe(true)
    r.handlers.onSpeak({ ms: 1400 }); r.run(1400)
    r.handlers.onEnd() // speech-end: реальный конец
    expect(r.sp.holdMs()).toBe(LOCK_MS)
    r.run(AFTER_GOOD_GAP_MS - 1); expect(r.open()).toBe(false)
    r.run(1); expect(r.open()).toBe(true) // перевод разрешён ровно через 350 мс после конца
    r.sp.translation(900)
    expect(r.sp.phase()).toBe('idle')
  })

  it('зачёт без похвалы: перевод через PRE_SAY_GAP_MS после взлёта', () => {
    const r = rig()
    r.sp.claim(null); r.run(80); r.sp.riseStart()
    r.run(PRE_SAY_GAP_MS - 1); expect(r.open()).toBe(false)
    r.run(1); expect(r.open()).toBe(true)
    expect(r.events.some(e => e.includes('КОМАНДА'))).toBe(false)
  })

  it('не успел: перевод через PRE_SAY_GAP_MS после ухода пилюли', () => {
    const r = rig()
    r.run(500); r.sp.pillGone('missed')
    expect(r.open()).toBe(false)
    r.run(PRE_SAY_GAP_MS - 1); expect(r.open()).toBe(false)
    r.run(1); expect(r.open()).toBe(true)
  })

  it('«не успел», пока похвала ещё впереди, отступ не сокращает: ждём конец похвалы', () => {
    const r = rig()
    r.sp.claim('race_good_2'); r.sp.riseStart(); r.run(GOOD_DELAY_MS) // похвала пошла
    r.sp.pillGone('missed'); r.run(PRE_SAY_GAP_MS + 10)
    expect(r.open()).toBe(false)
  })

  it('похвала длиннее оценки: перевод ждёт реальный конец, а не оценку', () => {
    const r = rig()
    r.sp.claim('race_good_3'); r.sp.riseStart(); r.run(GOOD_DELAY_MS)
    r.handlers.onSpeak({ ms: 1000 })
    r.run(1000 + 600) // оценка вышла, страховка (оценка + 800) ещё нет
    expect(r.open()).toBe(false)
    r.handlers.onEnd() // реально закончила на оценка + 600
    r.run(AFTER_GOOD_GAP_MS - 1); expect(r.open()).toBe(false)
    r.run(1); expect(r.open()).toBe(true)
  })

  it('speech-end потерян: страховка «оценка + 800 мс», затем отступ 350 мс', () => {
    const r = rig()
    r.sp.claim('race_good_4'); r.sp.riseStart(); r.run(GOOD_DELAY_MS)
    r.handlers.onSpeak({ ms: 1200 })
    r.run(1200 + END_GUARD_MS - 1); expect(r.sp.phase()).toBe('praise')
    r.run(1); expect(r.sp.phase()).toBe('gap')
    expect(r.events.some(e => e.includes('страховка'))).toBe(true)
    r.run(AFTER_GOOD_GAP_MS); expect(r.open()).toBe(true)
  })

  it('взлёта нет: отсчёт от зачёта через GOOD_ARM_MS (страховка)', () => {
    const r = rig()
    r.sp.claim('race_good_1')
    r.run(GOOD_ARM_MS - 1); expect(r.events.some(e => e.includes('КОМАНДА'))).toBe(false)
    r.run(1 + GOOD_DELAY_MS); expect(r.events.some(e => e.includes('КОМАНДА'))).toBe(true)
  })

  it('похвалу сказать не вышло (Пит занят): считается оконченной, перевод через 350 мс', () => {
    const r = rig({ praiseOk: false })
    r.sp.claim('race_good_1'); r.sp.riseStart(); r.run(GOOD_DELAY_MS)
    expect(r.sp.phase()).toBe('gap')
    r.run(AFTER_GOOD_GAP_MS); expect(r.open()).toBe(true)
  })

  it('выезд пилюли: перевод разрешён только после speech-end похвалы, пока заперт — spawnEarly ложно', () => {
    const r = rig()
    r.sp.claim('race_good_1'); r.sp.riseStart(); r.run(GOOD_DELAY_MS)
    r.handlers.onSpeak({ ms: 1500 }); r.run(700)
    // похвала ещё звучит: пилюля не может выехать (движок видит pitMs = LOCK_MS)
    expect(spawnEarly(r.sp.holdMs(), 1)).toBe(false)
    r.handlers.onEnd(); r.run(AFTER_GOOD_GAP_MS)
    expect(r.sp.holdMs()).toBe(0)
    r.sp.translation(1200) // перевод пошёл: дальше выезд считает движок за halfTravelMs до конца речи
    expect(spawnEarly(1200, 1)).toBe(false)
    expect(spawnEarly(halfTravelMs(1) + 80, 1)).toBe(true)
  })

  it('reset (пауза): всё сброшено, похвала не звучит', () => {
    const r = rig()
    r.sp.claim('race_good_1'); r.sp.riseStart(); r.sp.reset('пауза'); r.run(5000)
    expect(r.events.some(e => e.includes('КОМАНДА'))).toBe(false)
    expect(r.sp.holdMs()).toBe(0)
  })

  it('журнал [speech] с временами от зачёта', () => {
    const r = rig()
    r.sp.claim('race_good_1'); r.run(100); r.sp.riseStart()
    expect(r.events.every(e => e.includes('[speech]') || e.includes('КОМАНДА'))).toBe(true)
    expect(r.events.some(e => /\[speech\] \+100 мс/.test(e))).toBe(true)
  })
})
