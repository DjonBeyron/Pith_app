import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { ROUND_PLATES } from './raceStagesPhrases.js'

// Круги «Фраз» видно сразу: плашки кругов разного цвета со значком перед подзадачей, у пилюль круга 2 своя рамка (race-phrase-rounds.css)
vi.mock('../player/modules/rotate-phone/wordLanePlateSound.js', () => ({ playPlate: () => true }))
const { default: WordLaneTurnPlate } = await import('../player/modules/rotate-phone/WordLaneTurnPlate.jsx')
const css = readFileSync(new URL('../../styles/player/modules/race-phrase-rounds.css', import.meta.url), 'utf8')
const plate = look => renderToStaticMarkup(createElement(WordLaneTurnPlate, { text: 'Пойми\nТапни фразу', soft: true, look }))

describe('плашки кругов', () => {
  it('круг 1 — data-tone="lane" и палец перед «Тапни фразу»; «Скажи» — accent и микрофон; без вида — как раньше (без значка и тона)', () => {
    const p1 = plate(ROUND_PLATES.pick.look)
    expect(p1).toContain('data-tone="lane"'); expect(p1).toContain('data-icon="tap"'); expect(p1).toContain('wlTurnIcon'); expect(p1).toContain('Тапни фразу')
    const p2 = plate(ROUND_PLATES.say.look)
    expect(p2).toContain('data-tone="accent"'); expect(p2).toContain('data-icon="mic"')
    expect(plate(ROUND_PLATES.hear.look)).toContain('data-tone="accent"')
    const old = plate(null)
    expect(old).not.toContain('data-tone'); expect(old).not.toContain('wlTurnIcon')
    expect(p1).not.toMatch(/[\u{1F300}-\u{1FAFF}☀-➿]/u) // значок — SVG, не эмодзи
  })
})

describe('стиль кругов', () => {
  it('тона плашек: лента — --lvl2, акцент — --lvl3; пилюли «Скажи» и «Узнай» акцентные, у «Скажи» пунктир и маска вместо ::after', () => {
    expect(css).toMatch(/\.wlTurn\[data-tone='lane'\] \{ border-color: var\(--lvl2/)
    expect(css).toMatch(/\.wlTurn\[data-tone='accent'\] \{\s*border-color: var\(--lvl3/)
    expect(css).toMatch(/data-mode='say'\] \{\s*border-style: dashed/)
    expect(css).toContain(".wlPill[data-wide][data-mode='hear'] { background:")
    expect(css).toMatch(/data-mode='say'\]\[data-cap\]:not\(\[data-hint\]\)::after \{ content: none; \}/)
    expect(css).toMatch(/\.racePhraseMask b\[data-w='(hidden|draft|full)'\]/)
  })
  it('без filter; переходы и анимации — только opacity / transform; файл подключён в race-sprint.css', () => {
    expect(css).not.toMatch(/(^|[\s;{])filter\s*:/m); expect(css).not.toMatch(/backdrop-filter/)
    for (const m of css.matchAll(/transition:\s*([^;]+);/g)) for (const part of m[1].split(',')) expect(part.trim().split(/\s+/)[0]).toMatch(/^(opacity|transform|none)$/)
    expect(css).not.toMatch(/@keyframes/)
    expect(readFileSync(new URL('../../styles/player/modules/race-sprint.css', import.meta.url), 'utf8')).toContain("@import './race-phrase-rounds.css';")
  })
})
