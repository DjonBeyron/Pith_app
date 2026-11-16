// Принятая «Скажи» не по всем словам (racePhraseShare.js): доля заливки (B), красное несказанное слово (A), янтарный взлёт (D)
import { describe, it, expect } from 'vitest'
import { fillTo, isPartial, markPartial } from './racePhraseShare.js'
import { maskPhrase } from './racePhraseMask.js'
import { createFillView, finishFill } from '../player/modules/rotate-phone/wordLaneFillView.js'
import { finishDue } from './racePhraseFill.js'

describe('racePhraseShare', () => {
  it('B: полная фраза — 100 %, неполная — доля слов (по границам, если измерены)', () => {
    expect(fillTo({ ratio: 1, n: 4 })).toBe(1)
    expect(fillTo({ ratio: 0.75, n: 4 })).toBeCloseTo(0.75, 5)
    expect(fillTo({ ratio: 0.75, n: 4, edges: [0.2, 0.5, 0.8, 1] })).toBeCloseTo(0.8, 5)
    expect(isPartial(0.75)).toBe(true); expect(isPartial(1)).toBe(false)
  })
  it('B: доезд идёт к to, взлёт — когда заливка дошла до to', () => {
    expect(finishFill(0.5, 1, 0.75)).toBeCloseTo(0.75, 5); expect(finishFill(0.5, 1)).toBe(1)
    const v = createFillView(), fin = { at: 0, to: 0.75 }
    v.step('a', 0.6, 16, null); v.step('a', 0.6, 400, null)
    const shown = v.step('a', 0.6, 16, 1, 0.75)
    expect(shown).toBeCloseTo(0.75, 5); expect(finishDue(fin, shown, 100)).toBe(true)
    expect(finishDue({ at: 0 }, shown, 100)).toBe(false) // без to — ждём 100 %
  })
  it('A: несказанные слова — state miss; сказанные и полная фраза — full', () => {
    const heard = new Map([[0, true], [1, true], [3, true]])
    expect(maskPhrase('Nice to meet you', heard, true, -1, true).map(w => w.state)).toEqual(['full', 'full', 'miss', 'full'])
    expect(maskPhrase('Nice to meet you', heard, true).map(w => w.state)).toEqual(['full', 'full', 'full', 'full'])
  })
  it('D: markPartial ставит data-partial только при ratio < 1', () => {
    const got = []; const pool = { attr: (k, n) => got.push([k, n]) }
    markPartial(pool, 3, 1); markPartial(pool, 4, 0.75)
    expect(got).toEqual([[4, 'data-partial']])
  })
})
