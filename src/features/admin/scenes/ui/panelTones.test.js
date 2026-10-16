import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PANEL_TONES, panelHue, NEUTRAL_TONE } from './panelTones.js'
import { TYPE_COLOR } from '../../../canvas/nodeTypes.js'
import { parseHex, contrastRatio } from './colorContrast.js'

// Оттенки блоков: каждая панель сборщика имеет оттенок, цвет — цвет ноды, текст заголовка читается (≥ 4.5:1) в обеих темах.
const ROOT = new URL('..', import.meta.url).pathname
const css = readFileSync(new URL('../../../../styles/admin-scenes-tones.css', import.meta.url), 'utf8')

function jsx(dir) {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return jsx(p)
    return /\.jsx$/.test(n) && !/\.test\./.test(n) ? [p] : []
  })
}
// id всех <Panel … id="…"> / id={`…${x}…`} в исходниках окна
function panelIds() {
  const out = new Set()
  for (const f of jsx(ROOT)) {
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(/<Panel\b[^>]*?\bid=(?:"([^"]+)"|\{`([^`]+)`\})/gs)) out.add((m[1] ?? m[2]).replace(/\$\{[^}]*\}/g, 'x'))
  }
  return [...out]
}

describe('оттенки блоков сборщика', () => {
  it('нашлись панели окна (тест не зелёный впустую)', () => {
    const ids = panelIds()
    for (const id of ['location', 'slots', 'characters', 'vars', 'timeline', 'task', 'options', 'preview', 'budget', 'lint', 'side', 'slots.local', 'characters.x.voice', 'timeline.x']) expect(ids).toContain(id)
  })
  it('у каждого Panel id есть запись в карте (оттенок или явный neutral)', () => {
    const missing = panelIds().filter(id => !Object.prototype.hasOwnProperty.call(PANEL_TONES, id.split('.')[0]))
    expect(missing).toEqual([])
  })
  it('вложенные берут оттенок родителя; неизвестная панель — нейтральная', () => {
    expect(panelHue('characters.a.voice')).toBe('characters')
    expect(panelHue('timeline.3')).toBe('timeline')
    expect(panelHue('slots.common')).toBe('slots')
    expect(panelHue('brand-new')).toBe(NEUTRAL_TONE)
    expect(panelHue(undefined)).toBe(NEUTRAL_TONE)
  })
  it('в карте — реальные типы нод; в CSS есть токен и правило для каждого оттенка, цвет = цвет ноды', () => {
    const dark = css.split('.fsWin[data-theme="light"]')[0]
    for (const [hue, node] of Object.entries(PANEL_TONES)) {
      if (node === 'neutral') continue
      expect(TYPE_COLOR[node], `${hue} → ${node}`).toBeTruthy()
      const m = new RegExp(`--scb-tone-${hue}:\\s*(#[0-9a-f]{6})`, 'i').exec(dark)
      expect(m?.[1], `--scb-tone-${hue}`).toBe(TYPE_COLOR[node])
      expect(css).toContain(`.scbPanel[data-hue="${hue}"] { --scb-tone: var(--scb-tone-${hue}); }`)
    }
    expect(css).toContain('--scb-tone-neutral')
  })
  it('контраст текста заголовка на тонированной шапке ≥ 4.5:1 в тёмной и светлой теме', () => {
    const themes = { dark: { panel: '#14171c', text: '#e8e8ea', mix: 1 }, light: { panel: '#ffffff', text: '#161a20', mix: 0.72 } }
    const mixc = (a, b, t) => '#' + a.map((v, i) => Math.round(v * t + b[i] * (1 - t)).toString(16).padStart(2, '0')).join('')
    for (const [name, th] of Object.entries(themes)) {
      for (const [hue, node] of Object.entries(PANEL_TONES)) {
        if (node === 'neutral') continue
        const base = parseHex(TYPE_COLOR[node])
        const tone = parseHex(mixc(base, [0, 0, 0], th.mix))
        const bg = mixc(tone, parseHex(th.panel), 0.09)
        expect(contrastRatio(th.text, bg), `${name}/${hue}`).toBeGreaterThanOrEqual(4.5)
      }
    }
    expect(css).toContain('72%, #000')
  })
  it('ошибка линтера перекрывает оттенок (красная полоса и заливка)', () => {
    expect(css).toMatch(/data-tone="error"\] > \.scbPanelHead \{[^}]*border-left-color: var\(--fs-error\)/)
  })
})
