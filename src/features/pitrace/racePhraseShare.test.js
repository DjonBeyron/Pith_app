// Принятая «Скажи» не по всем словам (racePhraseShare.js): доля заливки (B), красное несказанное слово (A), янтарный взлёт (D)
import { describe, it, expect } from 'vitest'
import { fillTo, isPartial, markPartial, PARTIAL_FILL } from './racePhraseShare.js'
import { maskPhrase } from './racePhraseMask.js'
import { createFillView, finishFill } from '../player/modules/rotate-phone/wordLaneFillView.js'
import { finishDue } from './racePhraseFill.js'

describe('racePhraseShare', () => {
  it('B: полная фраза — 100 %, неполная (не хватает слова) — строго 80 % при любой длине фразы и границах', () => {
    expect(fillTo({ ratio: 1, n: 4 })).toBe(1)
    expect(fillTo({ ratio: 0.75, n: 4 })).toBe(PARTIAL_FILL); expect(PARTIAL_FILL).toBe(0.8)
    expect(fillTo({ ratio: 0.75, n: 4, edges: [0.2, 0.5, 0.9, 1] })).toBe(0.8)
    expect(fillTo({ ratio: 9 / 10, n: 10 })).toBe(0.8); expect(fillTo({ ratio: 5 / 6, n: 6 })).toBe(0.8)
    // 2026-11-28: с известными услышанными словами — граница перед первым несказанным (линия «втыкается» на пропущенном слове)
    const h = ks => new Map(ks.map(k => [k, true]))
    expect(fillTo({ ratio: 0.75, n: 4, heard: h([0, 1, 3]) })).toBeCloseTo(0.5, 5) // пропущено 3-е слово («meet»)
    expect(fillTo({ ratio: 0.75, n: 4, heard: h([1, 2, 3]) })).toBe(0) // пропущено первое — линия не двигается
    expect(fillTo({ ratio: 0.75, n: 4, heard: h([0, 1, 2]) })).toBeCloseTo(0.75, 5) // пропущено последнее
    expect(fillTo({ ratio: 0.75, n: 4, heard: h([0, 2, 3]), edges: [0.2, 0.5, 0.9, 1] })).toBe(0.2) // по границам слов на пилюле
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
