// Замечания владельца 2026-11-17 (v3.3.264): пауза перед «Фразами» короче, красная обводка на неверное слово, пилюля финала целиком в цвете зоны
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { PHRASE_ENTER_MS, PHRASE_EXIT_MS, PICK_SPEED, PHRASE_SPEED } from './raceStagesPhrases.js'

const rd = p => readFileSync(new URL(p, import.meta.url), 'utf8')

describe('замечания 2026-11-17', () => {
  it('перед плашкой «Фразы» последняя ступень ждёт PHRASE_ENTER_MS, а не 1,3 с: Пит не ждёт перестройки дорожек', () => {
    const acts = rd('./useRaceActs.js')
    expect(acts).toContain("st?.type === 'student' && stages[(st.idx ?? -9) + 1]?.act === 'phrases' ? PHRASE_ENTER_MS")
    expect(PHRASE_ENTER_MS).toBeLessThan(1300); expect(PHRASE_ENTER_MS).toBeGreaterThanOrEqual(PHRASE_EXIT_MS)
  })
  it('круг «Пойми» быстрее, «Узнай» прежний', () => { expect(PICK_SPEED).toBeGreaterThan(PHRASE_SPEED) })
  it('неверное слово: вся пилюля в красной обводке (outline на data-nudge)', () => {
    const css = rd('../../styles/player/modules/word-lane-wide-fill.css')
    expect(css).toMatch(/\.wlPill\[data-wide\]\[data-nudge\]:not\(\[data-lock\]\) \{ outline: 3px solid rgba\(255, 70, 60/)
  })
  it('финал: подложка пилюли целиком в цвете зоны (--bz), не только контур', () => {
    const css = rd('../../styles/player/modules/race-boss.css')
    expect(css).toContain(".wlPill[data-wide][data-bz]:not([data-fail]):not([data-full]) { background: linear-gradient(to bottom, rgba(var(--bz), 0.5)")
  })
})
