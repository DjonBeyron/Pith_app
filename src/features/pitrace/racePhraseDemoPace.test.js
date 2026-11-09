import { describe, it, expect } from 'vitest'
import { DEMO_ENTER_Y, DEMO_RISE_Y, DEMO_SPEED_MIN, DEMO_SPEED_MAX, DEMO_PAD_MAX_MS, HEAD_Y, headTopY, riseYFor, paceSpeed, travelMs, missPct, scriptMs, gapsLeft, padFor } from './racePhraseDemoPace.js'
import { demoPlan } from './racePhraseDemo.js'
import { WIDE_H } from '../player/modules/rotate-phone/wordLaneTimeline.js'

// Темп демо-пилюли «Скажи» (racePhraseDemoPace.js): где голова Пита, к какой точке пилюля приходит к взлёту, оценка разбора по шагам скрипта, скорость и добавка к паузам
const OWN = { race_demo_1: 1515, race_demo_2: 1280, race_demo_3: 1149, race_demo_more: 1489 } // журнал владельца v3.3.174, «Nice to meet you»
const WORDS = ['Nice', 'to', 'meet', 'you'], VOICE = { Nice: 600, to: 340, meet: 360, you: 679 }

describe('темп демо-пилюли', () => {
  it('выезд — вплотную к верхнему краю (целиком за кадром); голова Пита на 375×812 — 82 % (кончики ушей), центр пилюли у головы — 76 % (низ с кольцом на макушке)', () => {
    expect(DEMO_ENTER_Y + WIDE_H / 2).toBeLessThan(0); expect(DEMO_ENTER_Y + WIDE_H / 2).toBeGreaterThan(-1)
    expect(headTopY({ width: 375, bottom: 812 }, 812)).toBeCloseTo(82.2, 1)
    expect(headTopY({ width: 375, bottom: 700 }, 700)).toBeCloseTo(79.4, 1) // экран короче (панель браузера) — голова выше, пилюля остановится раньше
    expect(headTopY(null, 812)).toBe(HEAD_Y); expect(headTopY({ width: 0, bottom: 0 }, 812)).toBe(HEAD_Y)
    expect(DEMO_RISE_Y).toBe(riseYFor(HEAD_Y)); expect(Math.round(DEMO_RISE_Y)).toBe(76); expect(DEMO_RISE_Y + WIDE_H / 2).toBeLessThan(HEAD_Y)
  })
  it('оценка разбора по шагам скрипта повторяет журнал владельца (≈ 9 с от первой реплики до взлёта); неизвестные длины — по средним', () => {
    const plan = demoPlan(4)
    const ms = scriptMs(plan, 0, WORDS, { lineMs: id => OWN[id], wordMs: w => VOICE[w] })
    expect(Math.abs(ms - (35236 - 26211))).toBeLessThan(250)
    expect(scriptMs(plan, 0, WORDS)).toBeGreaterThan(7000) // ничего не известно: реплики по 1,3 с, слова по 450 мс
    expect(scriptMs(plan, 0, WORDS, { lineMs: () => 0, wordMs: w => VOICE[w] })).toBeLessThan(ms - 3000) // неозвученные реплики — подпись 650 мс
    expect(scriptMs(plan, plan.length - 3, WORDS, { lineMs: id => OWN[id] })).toBe(30) // после последнего слова — только доезд заливки
  })
  it('скорость = путь / время, в пределах [0,2; 0,6] конвейера; travelMs / missPct — обратные', () => {
    expect(paceSpeed(82, 9500)).toBeCloseTo(0.332, 2)
    expect(paceSpeed(82, 60000)).toBe(DEMO_SPEED_MIN); expect(paceSpeed(82, 1000)).toBe(DEMO_SPEED_MAX); expect(paceSpeed(10, 0)).toBe(DEMO_SPEED_MAX)
    expect(travelMs(82, paceSpeed(82, 9500))).toBeCloseTo(9500, -2); expect(missPct(26, 1000, 1)).toBeCloseTo(0); expect(missPct(26, 1000, 0.5)).toBeCloseTo(13)
  })
  it('разбор короче пути даже на верхней скорости — добавка к оставшимся паузам (не больше DEMO_PAD_MAX_MS); паузы — после реплик и слов, кроме последнего слова', () => {
    const plan = demoPlan(3) // реплика, слово ×3, вся, взлёт, «теперь ты»
    expect(gapsLeft(plan, 0)).toBe(5); expect(gapsLeft(plan, 4)).toBe(1); expect(gapsLeft(plan, 5)).toBe(0)
    expect(gapsLeft(demoPlan(4), 0)).toBe(7)
    expect(padFor(82, 9000, 5)).toBe(0)
    const pad = padFor(82, 3000, 5); expect(pad).toBe(Math.round((travelMs(82, DEMO_SPEED_MAX) - 3000) / 5))
    expect(padFor(82, 500, 1)).toBe(DEMO_PAD_MAX_MS); expect(padFor(82, 500, 0)).toBe(0)
  })
})
