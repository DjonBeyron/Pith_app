import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { sensitiveLevel, GAME_LEVEL_DECAY_MS } from './wordLaneConfig.js'
import { bindLevelVar, LVL_STEP } from './wordLaneMicLevel.js'
import WordLaneMic from './WordLaneMic.jsx'
import { createRmsLevel, LEVEL_DECAY_MS } from '../../../../shared/lib/vosk/sayVoskLevel.js'
import { createLevelSource } from '../../../../shared/lib/speech/sayLevelSource.js'
import { levelFromRms } from '../../../../shared/lib/speech/sayRealLevel.js'
import { isWeakDevice } from '../../../../shared/lib/deviceTier.js'

vi.mock('../../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: vi.fn(() => false) }))

// Нет jsdom: DOM-элемент подменяем объектом со style.setProperty/removeProperty, кадры rAF гоняем вручную, разметку смотрим через renderToStaticMarkup
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const fakeEl = () => {
  const props = {}
  const calls = []
  return { props, calls, style: { setProperty: (k, v) => { props[k] = v; calls.push(v) }, removeProperty: k => { delete props[k] } } }
}
const manualRaf = () => {
  let cb = null
  return { raf: fn => { cb = fn; return 1 }, caf: () => { cb = null }, frame: t => { const fn = cb; cb = null; fn?.(t) } }
}

describe('кривая отклика микрофона игры (sensitiveLevel)', () => {
  it('монотонна, шум комнаты — ноль, на тихой речи есть запас, не насыщается уже на 0,05', () => {
    let prev = -1
    for (let r = 0; r <= 0.3; r += 0.002) { const v = sensitiveLevel(r); expect(v).toBeGreaterThanOrEqual(prev); prev = v }
    expect(sensitiveLevel(0.004)).toBe(0)
    expect(sensitiveLevel(0)).toBe(0)
    expect(sensitiveLevel(0.02)).toBeGreaterThan(0.35)
    expect(sensitiveLevel(0.02)).toBeLessThan(0.6)
    expect(sensitiveLevel(0.05)).toBeLessThan(0.85) // раньше корень давал 0,84 и ниже 0,07 упирался в 1
    expect(sensitiveLevel(0.08)).toBeLessThan(0.95)
    expect(sensitiveLevel(0.1) - sensitiveLevel(0.05)).toBeGreaterThan(0.15) // между обычной и громкой речью динамика остаётся
  })
  it('громкий голос и крик — ровно 1, выше не уходит', () => {
    expect(sensitiveLevel(0.12)).toBe(1)
    expect(sensitiveLevel(0.5)).toBe(1)
    expect(sensitiveLevel(1)).toBe(1)
  })
  it('чувствительнее общей шкалы колец «Сказать фразу» на тихом голосе (как и раньше)', () => {
    expect(sensitiveLevel(0.02)).toBeGreaterThan(levelFromRms(0.02))
  })
})

describe('спад уровня игры: 120 мс линейно от пика; у «Сказать фразу» прежние 300', () => {
  const GAP = 23 // кусок звука 1024 кадра при 44,1 кГц
  const game = () => createRmsLevel({ now: () => 0, fromRms: sensitiveLevel })

  it('формула игры несёт свой спад: GAME_LEVEL_DECAY_MS = 120', () => {
    expect(GAME_LEVEL_DECAY_MS).toBe(120)
    expect(sensitiveLevel.decayMs).toBe(120)
  })
  it('куски тишины каждые 23 мс не растягивают хвост: за 120 мс после пика ровно ноль, на 60 мс — половина', () => {
    const l = game()
    l.push(0.1, 0)
    const top = l.read(0)
    for (let t = GAP; t <= 140; t += GAP) l.push(0.002, t)
    expect(l.read(60)).toBeCloseTo(top / 2, 5)
    expect(l.read(GAME_LEVEL_DECAY_MS)).toBe(0)
  })
  it('атака мгновенная: громкий кусок поднимает уровень в тот же момент, тихий не обрывает спад вниз', () => {
    const l = game()
    l.push(0.02, 0)
    l.push(0.1, 10)
    expect(l.read(10)).toBeCloseTo(sensitiveLevel(0.1), 5)
    l.push(0.02, 33)
    expect(l.read(33)).toBeCloseTo(sensitiveLevel(0.1) * (1 - 23 / 120), 5)
  })
  it('явный decayMs важнее свойства формулы; reset гасит сразу', () => {
    const l = createRmsLevel({ now: () => 0, fromRms: sensitiveLevel, decayMs: 60 })
    l.push(0.1, 0)
    expect(l.read(60)).toBe(0)
    l.push(0.1, 100); l.reset()
    expect(l.read(100)).toBe(0)
  })
  it('«Сказать фразу» не изменилась: без decayMs спад 300 мс, формула уровня общая', () => {
    expect(LEVEL_DECAY_MS).toBe(300)
    const l = createRmsLevel({ now: () => 0 })
    l.push(0.2, 0)
    const top = l.read(0)
    expect(top).toBeCloseTo(levelFromRms(0.2), 5)
    expect(l.read(150)).toBeCloseTo(top / 2, 5)
    expect(l.read(300)).toBe(0)
    // кусок тишины пересчитывает спад от текущего значения — как раньше (кусок «Сказать фразу» приходит раз в 128 мс)
    l.push(0.2, 1000); l.push(0, 1128)
    expect(l.read(1128)).toBeCloseTo(top * (1 - 128 / 300), 5)
  })
})

describe('--lvl на .wlMicBox: запись в DOM без React', () => {
  const setup = () => {
    const el = fakeEl()
    const rms = createRmsLevel({ now: () => 0, fromRms: sensitiveLevel })
    const fr = manualRaf()
    const levels = createLevelSource(t => rms.read(t), { raf: fr.raf, caf: fr.caf })
    return { el, rms, levels, fr }
  }

  it('атака в один кадр: кусок звука → следующий же кадр пишет --lvl этого куска', () => {
    const { el, rms, levels, fr } = setup()
    bindLevelVar(el, levels)
    fr.frame(0)
    expect(el.props['--lvl']).toBe('0.000')
    rms.push(0.05, 16)
    fr.frame(16)
    expect(el.props['--lvl']).toBe(sensitiveLevel(0.05).toFixed(3))
  })
  it('спад виден в DOM: через 120 мс после пика --lvl = 0', () => {
    const { el, rms, levels, fr } = setup()
    bindLevelVar(el, levels)
    rms.push(0.1, 0); fr.frame(0)
    expect(Number(el.props['--lvl'])).toBeGreaterThan(0.9)
    fr.frame(60)
    expect(Number(el.props['--lvl'])).toBeCloseTo(sensitiveLevel(0.1) / 2, 2)
    fr.frame(120)
    expect(el.props['--lvl']).toBe('0.000')
  })
  it('мелкие сдвиги (< LVL_STEP) не пишутся, нуль и единица — всегда; onLevel получает каждый кадр', () => {
    const { el, fr } = setup()
    let level = 0.5
    const lv2 = createLevelSource(() => level, { raf: fr.raf, caf: fr.caf })
    const seen = []
    bindLevelVar(el, lv2, v => seen.push(v))
    fr.frame(0); fr.frame(16)
    expect(el.calls).toEqual(['0.500'])
    level = 0.5 + LVL_STEP / 2; fr.frame(32)
    expect(el.calls).toEqual(['0.500'])
    level = 0.5 + LVL_STEP * 2; fr.frame(48)
    expect(el.calls.length).toBe(2)
    level = 1; fr.frame(64); level = 1; fr.frame(80)
    expect(el.calls.at(-1)).toBe('1.000')
    level = 0; fr.frame(96)
    expect(el.calls.at(-1)).toBe('0.000')
    expect(seen.length).toBe(7)
  })
  it('отписка убирает --lvl и останавливает кадры (подписчиков нет)', () => {
    const { el, levels, fr } = setup()
    const off = bindLevelVar(el, levels)
    fr.frame(0)
    expect(el.props['--lvl']).toBeDefined()
    expect(levels.size()).toBe(1)
    off()
    expect(el.props['--lvl']).toBeUndefined()
    expect(levels.size()).toBe(0)
  })
})

describe('WordLaneMic: подписи не изменились, слабое устройство получает lite', () => {
  const html = props => renderToStaticMarkup(createElement(WordLaneMic, { visible: true, ...props }))
  it('подписи режимов и честное сообщение игры', () => {
    expect(html({ mode: 'listening' })).toContain('Слушаю…')
    expect(html({ mode: 'starting' })).toContain('Включаю микрофон…')
    expect(html({ mode: 'done' })).toContain('Есть!')
    expect(html({ mode: 'listening', note: 'Услышал: «cat»' })).toContain('Услышал: «cat»')
    expect(read('./WordLaneMic.jsx')).toContain('Не слышу голос — говори ближе')
  })
  it('обычное устройство — без wlMic--lite; слабое — с ним', () => {
    expect(html({ mode: 'listening' })).not.toContain('wlMic--lite')
    isWeakDevice.mockReturnValueOnce(true)
    expect(html({ mode: 'listening' })).toContain('wlMic--lite')
  })
  it('CSS: кольца, кнопка и свечение считаются из --lvl; транзишена на transform у слушающей кнопки нет; на слабом кольца и свечение скрыты', () => {
    const css = read('../../../../styles/player/modules/word-lane-mic.css')
    expect(css).toContain('.wlMic--listening .wlMicRings i:nth-child(3) { transform: scale(calc(1 + var(--lvl, 0) * 1.4))')
    expect(css).toContain('.wlMic--listening .wlMicBtn { background: var(--wl-accent); color: var(--wl-ink); transform: scale(calc(1 + var(--lvl, 0) * 0.14)); transition: background 0.25s, color 0.25s; }')
    expect(css).toContain('.wlMic--listening .wlMicBtn::after { opacity: calc(var(--lvl, 0) * 0.8); }')
    expect(css).toMatch(/\.wlMic--lite\.wlMic--listening \.wlMicRings, \.wlMic--lite\.wlMic--listening \.wlMicBtn::after \{ display: none; \}/)
    expect(css).toMatch(/\.wlMicRings i \{[^}]*border: 1px solid/) // тонкие кольца (подробности — wordLanePillFill.test.js)
  })
})
