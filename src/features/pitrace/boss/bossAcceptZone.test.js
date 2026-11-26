// Экзамен: зона принятого слова — ОДНА на всё (владелец 2026-11-26, слабый Android: «успел сказать лишь в красной зоне, а пилюля улетела жёлтая»). Цвет рамки пилюли, треугольник шкалы, зона для Мии (счёт экзамена
// и строка журнала `[exam]`) и трофеи угла берутся одним вызовом из одного числа — где низ пилюли в кадре, когда она ВСТАЛА (а не в кадре зачёта, после которого она ехала вниз ещё LOCK_MS).
// Кадры шкалы (bossScaleDrive.js) идут на подставных узлах: браузера в тестах нет, WAAPI нет — шкала пишет положение сама (запасной путь), логика зачёта та же.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startScaleDrive } from './bossScaleDrive.js'
import { zoneAt } from './bossScale.js'
import { bossXp, peekBossSeen, peekBossZone } from './bossZoneNow.js'
import { wordTrophies } from './bossTrophies.js'
import { examWordLine } from './examLog.js'

const H = 1000
let frames = []
const tick = t => { const q = frames; frames = []; q.forEach(f => f(t)) }
const rect = (top, height) => ({ top, bottom: top + height, height, left: 0, right: 300, width: 300 })
const node = (box = rect(0, 0)) => {
  const attrs = new Map()
  return { style: { setProperty(k, v) { this[k] = v } }, dataset: {}, getBoundingClientRect: () => box, hasAttribute: k => attrs.has(k), getAttribute: k => attrs.get(k) ?? null, setAttribute: (k, v) => attrs.set(k, String(v)), removeAttribute: k => attrs.delete(k), toggleAttribute: (k, on) => (on ? attrs.set(k, '') : attrs.delete(k)) }
}

function mount(onZone) {
  let bottom = 10
  const pill = node(); pill.getBoundingClientRect = () => rect(bottom - 80, 80); pill.setAttribute('data-cap', 'помнить')
  const stage = { getBoundingClientRect: () => rect(0, H), querySelector: () => null }, field = { getBoundingClientRect: () => rect(0, H), querySelectorAll: () => [pill] }
  const line = node(), marks = [node(), node(), node()]
  const stop = startScaleDrive({ stage, field, box: { current: node(rect(0, H)) }, line: { current: line }, pillEl: { current: null }, dLine: { current: null }, marks: { current: marks }, clock: { current: { paused: false, onZone, demo: null } } })
  return { pill, line, to: y => { bottom = y }, mark: () => marks.find(e => e.style.opacity === '1'), stop: () => { stop(); tick(0) } }
}

beforeEach(() => { vi.stubGlobal('requestAnimationFrame', f => { frames.push(f); return frames.length }) })
afterEach(() => { vi.unstubAllGlobals() })

describe('зона принятого слова: цвет пилюли = треугольник = зона для Мии = трофеи угла', () => {
  // границы зон: 45 % и 80 % длины шкалы; зачёт (data-lock) — на lockAt, пилюля встаёт (заливка доехала) на stopAt
  for (const [lockAt, stopAt, want] of [[440, 449, 'fast'], [440, 451, 'mid'], [790, 799, 'mid'], [790, 801, 'slow'], [795, 812, 'slow'], [300, 310, 'fast'], [900, 915, 'slow']]) {
    it(`зачёт на ${lockAt / 10} %, пилюля встала на ${stopAt / 10} % → всё по месту остановки: ${want}`, () => {
      const zones = [], m = mount(z => zones.push(z))
      tick(0); m.to(lockAt - 5); tick(16); m.to(lockAt); tick(32)
      m.pill.setAttribute('data-lock', '1') // зачёт: пилюля ещё едет вниз, линия идёт за ней, зона не зафиксирована
      m.to((lockAt + stopAt) / 2); tick(48)
      expect(zones).toEqual([]); expect(m.pill.hasAttribute('data-bzf')).toBe(false)
      m.to(stopAt)
      expect(peekBossZone()).toBe(want); expect(zones).toEqual([]) // журнал спрашивает зону без действий: событие зоны не шлётся изнутри обработки зачёта
      const xp = bossXp()
      expect(m.line.style.transform).toBe(`translate3d(0, ${stopAt.toFixed(1)}px, 0)`); expect(m.mark().style.translate).toBe(`0 ${stopAt.toFixed(1)}px`); expect(zones).toEqual([want]) // зафиксировано в том же вызове, до кадра шкалы // пилюля встала: движок начисляет трофеи (useWordLaneFlow.win) ДО кадра шкалы — шкала фиксирует слово в этом же вызове
      m.pill.setAttribute('data-rise', '1'); tick(64); tick(80)
      expect(zoneAt(stopAt / H)).toBe(want)
      expect(zones).toEqual([want])                                   // зона для машины Мии: счёт экзамена и строка журнала — один раз
      expect(xp).toBe(wordTrophies({ ok: true, zone: want }))        // трофеи угла
      expect(m.pill.dataset.bz).toBe(want); expect(m.pill.hasAttribute('data-bzf')).toBe(true) // цвет рамки улетающей пилюли
      expect(m.mark().style.translate).toBe(`0 ${stopAt.toFixed(1)}px`) // треугольник — где пилюля встала
      expect(m.line.style.transform).toBe(`translate3d(0, ${stopAt.toFixed(1)}px, 0)`); expect(m.line.dataset.zone).toBe(want) // и линия там же
      expect(peekBossSeen()).toEqual({ pct: Math.round(stopAt / 10) })
      m.stop()
    })
  }
  it('трофеи зону не спрашивали (запасной путь): шкала фиксирует слово в кадре, где увидела вставшую пилюлю, — по тому же месту', () => {
    const zones = [], m = mount(z => zones.push(z))
    tick(0); m.to(790); tick(16); m.pill.setAttribute('data-lock', '1'); m.to(805); m.pill.setAttribute('data-rise', '1'); tick(32); tick(48)
    expect(zones).toEqual(['slow']); expect(m.pill.dataset.bz).toBe('slow'); expect(m.mark().style.translate).toBe('0 805.0px'); expect(bossXp()).toBe(wordTrophies({ ok: true, zone: 'slow' }))
    m.stop()
  })
  it('«не успел»: зоны нет, рамка не закрепляется, треугольник гаснет', () => {
    const zones = [], m = mount(z => zones.push(z))
    tick(0); m.to(700); tick(16); m.pill.setAttribute('data-fail', '1'); tick(32); tick(48)
    expect(zones).toEqual([]); expect(m.pill.hasAttribute('data-bzf')).toBe(false); expect(m.mark()).toBeUndefined()
    m.stop()
  })
  it('журнал `[exam]`: в строке слова — где встала линия, % длины шкалы', () => {
    const st = { offset: 0, words: [{ text: 'learn', translation: 'учиться' }], step: {} }, after = { zones: { 0: 'slow' }, won: { 0: true }, dug: {} }
    expect(examWordLine({ zones: { 0: 'slow' }, won: {}, dug: {} }, after, { t: 'win', idx: 0, stage: st }, null, { pct: 83 })).toContain('«learn»: зона красная (линия на 83 % шкалы), игроку +3')
    expect(examWordLine({ zones: { 0: 'slow' }, won: {}, dug: {} }, after, { t: 'win', idx: 0, stage: st }, null, null)).toContain('«learn»: зона красная, игроку +3')
  })
})
