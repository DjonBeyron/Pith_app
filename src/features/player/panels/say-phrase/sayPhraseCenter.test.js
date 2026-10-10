import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { RING_R0, RING_K, WAVE_MARGIN, CIRCLE_R } from '../../../../shared/lib/speech/sayRings.js'
import { MIC_SCALE } from '../../../../shared/lib/speech/sayMicState.js'

// Положение круга «Сказать фразу»: центр области между нижним краем надписи и нижним краем корпуса; размер круга в неактивном состоянии. Считаем по CSS-исходникам (переменные раскладки),
// чтобы правка любого числа ломала сторожа, а не тихо двигала круг. Сверено со снимками headless-Chromium на 320×568, 375×667, 390×844: центр круга ровно в середине области, якорь волн совпадает.
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const strip = c => c.replace(/\/\*[\s\S]*?\*\//g, '')
const layout = strip(read('../../../../styles/player/panels/say-phrase.css'))
const waves = strip(read('../../../../styles/player/panels/say-phrase-waves.css'))
const state = strip(read('../../../../styles/player/panels/say-phrase-state.css'))
const mic = strip(read('../../../../styles/player/panels/say-phrase-mic.css'))
const ringCss = strip(read('../../../../styles/player/panels/say-phrase-ring.css'))
const num = (s, re) => Number(s.match(re)[1])

const PAD_T = num(layout, /--say-pad-t: ([\d.]+)px/)
const PAD_B = num(layout, /--say-pad-b: ([\d.]+)px/)
const CAP = num(layout, /--say-cap-h: ([\d.]+)px/)
const BODY = num(layout, /\.sayBody \{[^}]*height: ([\d.]+)px/)
const D = num(layout, /\.sayMicBox \{[^}]*height: ([\d.]+)px/)
const ANCHOR = num(waves, /\.sayWaveAnchor \{[^}]*width: ([\d.]+)px/)
const AREA = BODY + PAD_B - CAP                       // область круга: от низа подписи до низа корпуса (.phraseInner)
const CENTER = CAP + AREA / 2                         // центр круга от верха тела

describe('say_phrase — круг по центру между подписью и низом', () => {
  it('центр = середина области: 26 + (206 + 12 − 26) / 2 = 122 px от верха тела; зазор от подписи до обводки (ready) равен зазору от обводки до низа корпуса', () => {
    expect([PAD_T, PAD_B, CAP, BODY, D]).toEqual([11, 12, 26, 206, 85])
    expect(CENTER).toBe(122)
    const outer = ANCHOR / 2                            // внешний край обводки в покое (ready, 100 %)
    expect(outer).toBeCloseTo(53.125, 3)
    const above = CENTER - outer - CAP
    const below = BODY + PAD_B - (CENTER + outer)
    expect(above).toBeCloseTo(below, 6)
    expect(above).toBeCloseTo(42.875, 3)
    const act = RING_R0                                 // и в записи (×1,15): обводка не касается ни подписи, ни низа
    expect(CENTER - act - CAP).toBeGreaterThanOrEqual(30)
    expect(BODY + PAD_B - CENTER - act).toBeGreaterThanOrEqual(30)
  })

  it('круг и якорь волн считаются одной формулой: область начинается под подписью, кончается низом корпуса, внутри — центровка (flex), без px-координат и без vh/vw/safe-area', () => {
    const stage = layout.match(/\.sayMicStage \{[^}]*\}/)[0]
    expect(stage).toMatch(/top: var\(--say-cap-h\)/)
    expect(stage).toMatch(/bottom: calc\(-1 \* var\(--say-pad-b\)\)/)
    expect(stage).toMatch(/align-items: center/)
    const clip = waves.match(/\.sayWaveClip \{[^}]*\}/)[0]
    // верх клипа −PAD_T + padding-top (PAD_T + CAP) = CAP от верха тела — как верх .sayMicStage; низ тот же
    expect(clip).toMatch(/top: calc\(-1 \* var\(--say-pad-t\)\)/)
    expect(clip).toMatch(/padding-top: calc\(var\(--say-pad-t\) \+ var\(--say-cap-h\)\)/)
    expect(clip).toMatch(/bottom: calc\(-1 \* var\(--say-pad-b\)\)/)
    expect(waves).toMatch(/\.sayWaveAnchor \{[^}]*margin: auto 0;/)
    expect(layout).toMatch(/\.sayMicBox \{ position: relative; flex: 1; height: 85px; \}/)
    for (const css of [layout, waves, mic, ringCss]) expect(css).not.toMatch(/\d(vh|vw|dvh|svh)\b|env\(/) // раскладка не зависит ни от экрана, ни от safe-area: одинакова на 320×568, 375×667, 390×844
    expect(state).not.toMatch(/\d(vh|vw)\b|env\(/)
  })

  it('потолок амплитуды при смещении вниз: центр в 133 px от верха клипа и в 96 px от низа — все волны (активация ×1,5, циклические ×1,45, эквалайзер до ×1,39) короче 96 − запас', () => {
    const clipH = PAD_T + BODY + PAD_B
    const fromTop = PAD_T + CENTER, fromBottom = clipH - fromTop
    expect([fromTop, fromBottom]).toEqual([133, 96])
    const scaleTo = (name) => num(waves.match(new RegExp(`@keyframes ${name}[\\s\\S]*?\\n\\}`))[0], /to\s*\{\s*transform: scale\(([\d.]+)\)/)
    for (const k of [scaleTo('sayActScale'), scaleTo('sayCycScale'), 1 + Math.max(...RING_K)]) expect(k * RING_R0).toBeLessThanOrEqual(Math.min(fromTop, fromBottom) - WAVE_MARGIN)
  })
})

describe('say_phrase — круг в неактивном состоянии (locked и off) на 10% меньше', () => {
  it('круг 0,85 → 0,765 (диаметр 85 → 65 px), кольцо 1 → 0,9, иконка внутри круга уменьшается вместе с ним; ready остаётся 1, active 1,15', () => {
    expect(MIC_SCALE.locked).toBeCloseTo(0.85 * 0.9, 10)
    expect(MIC_SCALE.off).toBe(MIC_SCALE.locked)
    expect(D * MIC_SCALE.locked).toBeCloseTo(65.025, 3)
    expect(MIC_SCALE.ready).toBe(1)
    expect(MIC_SCALE.active).toBe(1.15)
    for (const n of ['locked', 'off']) {
      const r = state.match(new RegExp(`\\.sayMicBox--${n} \\{[^}]*\\}`))[0]
      expect(num(r, /--mic-scale: ([\d.]+);/)).toBe(MIC_SCALE[n])
      expect(num(r, /--ring-scale: ([\d.]+);/)).toBe(0.9)
    }
    expect(CIRCLE_R * 2).toBeCloseTo(D * 1.15, 6)
    // размеры меняются плавно: transform с общей кривой --size-t у круга и у кольца (переходы между состояниями не скачут)
    expect(mic).toMatch(/\.sayPanel \.sayMicBtn \{[^}]*transform: scale\(var\(--mic-scale\)\);[^}]*transition: transform var\(--size-t\)/)
    expect(ringCss).toMatch(/\.sayRing \{[^}]*transform: scale\(var\(--ring-scale, 1\)\);\s*transition: transform var\(--size-t/)
  })
})
