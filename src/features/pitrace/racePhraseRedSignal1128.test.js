import { describe, it, expect, vi } from 'vitest'
import { strictHits } from './racePhraseScore.js'
import { createSayView, RED_SIGNAL_GAP_MS } from './racePhraseSayView.js'
import { createWrongWord, TAIL_FAST_MS, TAIL_STABLE_MS } from './racePhraseWrongWord.js'
import { mountMask } from './racePhraseMaskView.js'
import { softMissPill, SOFT_MISS_RING } from '../player/modules/rotate-phone/wordLaneSnap.js'

// Журнал владельца v3.3.401 (2026-11-28), «I'm trying to learn», проход 2: красное на первом слове шло через 0,26–0,36 с после черновика и на движущейся пилюле терялось.
// Решение v3.3.402: сигнал уровня пилюли (softMissPill — как у «Разгона»: обводка, дрожь, слабый налив) на ПЕРВОЕ красное слово, не чаще RED_SIGNAL_GAP_MS; в проходе 2 слово цели не на месте
// ставится быстрее (TAIL_FAST_MS). Зачёт, жизни, серия не меняются.
const W = ["I'm", 'trying', 'to', 'learn']
const view = (pass, onRed) => createSayView({ pass, text: "I'm trying to learn", n: 4, mask: mountMask(null, "I'm trying to learn"), onRed })

describe('красное слово в проходе 2: сигнал пилюле', () => {
  it('первое слово неверное («trying» вместо «I\'m»): красное стоит быстрее TAIL_STABLE_MS, сигнал — один раз', () => {
    expect(TAIL_FAST_MS).toBeLessThan(TAIL_STABLE_MS)
    const onRed = vi.fn(), v = view(2, onRed)
    v.ear({ kind: 'partial', text: 'trying' }); v.frame(0); v.frame(TAIL_FAST_MS - 1); expect(onRed).not.toHaveBeenCalled()
    v.frame(TAIL_FAST_MS + 20); expect(onRed).toHaveBeenCalledTimes(1)
    v.frame(TAIL_FAST_MS + 40); v.frame(TAIL_FAST_MS + 400); expect(onRed).toHaveBeenCalledTimes(1)
  })
  it('не чаще RED_SIGNAL_GAP_MS: красное, снятое и поставленное снова внутри окна, нового сигнала не даёт', () => {
    const onRed = vi.fn(), v = view(2, onRed)
    v.ear({ kind: 'partial', text: 'trying' }); v.frame(0); v.frame(300); expect(onRed).toHaveBeenCalledTimes(1)
    v.word(0, new Map([[0, true]]), 350); v.ear({ kind: 'partial', text: "i'm to learn" }); v.frame(400); v.frame(700) // «to» вместо «trying»
    expect(onRed).toHaveBeenCalledTimes(1)
    expect(RED_SIGNAL_GAP_MS).toBeGreaterThanOrEqual(700)
  })
  it('проход 1 сигнала пилюле не даёт (там рывок кромки), без onRed — ничего не падает', () => {
    const onRed = vi.fn(), v = view(1, onRed); v.ear({ kind: 'partial', text: 'trying' }); v.frame(0); v.frame(900); expect(onRed).not.toHaveBeenCalled()
    const v2 = view(2); v2.ear({ kind: 'partial', text: 'trying' }); v2.frame(0); expect(() => v2.frame(900)).not.toThrow()
  })
  it('быстрое красное — только слово ЦЕЛИ: чужое слово («is») ждёт TAIL_STABLE_MS (Vosk переписывает его), проход 1 не ускоряется', () => {
    const k = (fast, text) => { const w = createWrongWord({ words: W, fast }); w.ear({ kind: 'partial', text }); w.check(new Map(), 0); w.check(new Map(), TAIL_FAST_MS + 10); return w.shown() }
    expect(k(true, 'trying')).toBe('trying'); expect(k(true, 'is')).toBeNull(); expect(k(false, 'trying')).toBeNull()
  })
})

describe('softMissPill: сигнал пилюли', () => {
  it('дрожь + обводка; налив — только если tint (не слабое устройство)', () => {
    vi.stubGlobal('document', { createElement: () => ({ style: {}, animate: () => ({ finished: Promise.resolve() }), remove() {} }) })
    const mk = () => { const clip = { appendChild: vi.fn() }; const calls = []; return { calls, clip, animate: (...a) => { calls.push(a); return { finished: Promise.resolve() } }, querySelector: () => clip } }
    const a = mk(); softMissPill(a, true); expect(a.calls.length).toBe(2); expect(a.calls[1][0]).toBe(SOFT_MISS_RING); expect(a.clip.appendChild).toHaveBeenCalledTimes(1)
    const b = mk(); softMissPill(b, false); expect(b.calls.length).toBe(2); expect(b.clip.appendChild).not.toHaveBeenCalled(); softMissPill(null); vi.unstubAllGlobals()
  })
})

describe('зачёт «I\'m trying to learn» по журналу v3.3.401 (ход 6/6): строгая цепочка не засчитывает пропущенное слово', () => {
  const bits = h => strictHits(W, h).map(Number).join('')
  it('«trying to learn» без «I\'m» и «I\'m to learn» без «trying» — не зачёт; зачёт только когда слова сказаны по порядку после ошибки', () => {
    expect(bits('trying to learn')).toBe('0000'); expect(bits("trying to learn i'm to learn")).toBe('1000')
    expect(bits("trying to learn i'm to learn trying")).toBe('1100'); expect(bits("trying to learn i'm to learn trying to learn")).toBe('1111') // игрок реально повторил «trying to learn» после «i'm»
    expect(bits("i'm to learn")).toBe('1000'); expect(bits("trying to learn i'm")).toBe('1000')
  })
})
