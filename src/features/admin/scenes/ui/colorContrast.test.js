import { describe, it, expect } from 'vitest'
import { parseHex, luminance, contrastRatio, contrastInk, speakerColor, speakerVars, FALLBACK_SPEAKER } from './colorContrast.js'
import { PALETTE_PRESETS } from '../../../scene/v2/sceneConstants.js'

// Контраст цвета текста по фону (цвет говорящего = шерсть кота)
describe('colorContrast', () => {
  it('parseHex: #rgb, #rrggbb, мусор', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255])
    expect(parseHex('#f2a65a')).toEqual([242, 166, 90])
    expect(parseHex('f2a65a')).toEqual([242, 166, 90])
    expect(parseHex('red')).toBeNull()
    expect(parseHex('')).toBeNull()
    expect(parseHex(null)).toBeNull()
  })

  it('яркость и контраст по WCAG', () => {
    expect(luminance('#000000')).toBe(0)
    expect(luminance('#ffffff')).toBeCloseTo(1, 5)
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 1)
    expect(contrastRatio('#777', '#777')).toBe(1)
  })

  it('контрастный текст: белый на тёмном, тёмный на светлом', () => {
    expect(contrastInk('#000000')).toBe('#ffffff')
    expect(contrastInk('#ffffff')).toBe('#141414')
    expect(contrastInk('#3b3b45')).toBe('#ffffff') // чёрный кот
    expect(contrastInk('#e9d3b3')).toBe('#141414') // кремовый
  })

  it('все пресеты котов читаются: контраст текста ≥ 4.5 (AA) на цвете шерсти', () => {
    for (const [id, p] of Object.entries(PALETTE_PRESETS)) {
      const ink = contrastInk(p.fur)
      expect(contrastRatio(p.fur, ink), `${id} ${p.fur} / ${ink}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('speakerColor берёт шерсть, без палитры — запасной; speakerVars даёт переменные для A и B', () => {
    expect(speakerColor({ palette: { fur: '#3b3b45' } }, 'a')).toBe('#3b3b45')
    expect(speakerColor({ palette: { fur: 'oops' } }, 'b')).toBe(FALLBACK_SPEAKER.b)
    expect(speakerColor(null, 'a')).toBe(FALLBACK_SPEAKER.a)
    const vars = speakerVars({ a: { palette: PALETTE_PRESETS.ginger }, b: { palette: PALETTE_PRESETS.black } })
    expect(vars['--spk-a']).toBe(PALETTE_PRESETS.ginger.fur)
    expect(vars['--spk-a-ink']).toBe('#141414')
    expect(vars['--spk-b']).toBe(PALETTE_PRESETS.black.fur)
    expect(vars['--spk-b-ink']).toBe('#ffffff')
  })
})
