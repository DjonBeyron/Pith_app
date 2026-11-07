import { describe, it, expect } from 'vitest'
import { fillGoal, markWord, finishDue, wordShare, FILL_SETTLE_MS, FILL_HOLD_MS, FILL_FINISH_MAX_MS, ADVANCE_MS } from './racePhraseFill.js'
import { setupScene } from './racePhraseSceneRig.js'
import { createPhraseListener, stubSay, stubDraft } from './racePhraseListenStub.js'
import { phraseStep, SAY_SPEED } from './raceStagesPhrases.js'
import { round2SayTurns } from './racePhraseTurns.js'
import { phrasesOf } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { FILL_ADVANCE, FILL_UP_PER_S } from '../player/modules/rotate-phone/wordLaneFillView.js'

// Заливка «Скажи» (racePhraseFill.js): каждое сказанное слово — своя полная доля, «аванс» — только до первого слова, после итога заливка доезжает до 100 % и только потом взлёт
describe('цель заливки по словам', () => {
  it('1 слово из 4 — 25 %, 2 — 50 %: подтверждённое сразу, черновое — половина доли, устоялось (FILL_SETTLE_MS) — целиком', () => {
    const w = new Map()
    markWord(w, 0, true, 1000)
    expect(fillGoal({ words: w, n: 4, t: 1000 })).toBeCloseTo(0.125, 6)
    expect(fillGoal({ words: w, n: 4, t: 1000 + FILL_SETTLE_MS })).toBeCloseTo(0.25, 6)
    markWord(w, 1, false, 1100)
    expect(fillGoal({ words: w, n: 4, t: 1100 })).toBeCloseTo(0.5, 6) // следующее слово подтверждает прошлое
    expect(wordShare({ full: false, at: 0 }, FILL_SETTLE_MS - 1)).toBe(0.5)
  })
  it('«аванс» FILL_ADVANCE — только по первому звуку, пока слов нет; после первого слова не перелетает его долю; итог — 100 %', () => {
    const w = new Map()
    expect(fillGoal({ words: w, n: 4, t: 500, heardAt: 400 })).toBeCloseTo(FILL_ADVANCE / 4, 6)
    expect(fillGoal({ words: w, n: 4, t: 400 + ADVANCE_MS, heardAt: 400 })).toBe(0)
    markWord(w, 0, false, 600)
    expect(fillGoal({ words: w, n: 4, t: 700, heardAt: 690 })).toBeCloseTo(0.25, 6)
    expect(fillGoal({ words: w, n: 4, t: 700, done: true })).toBe(1)
  })
  it('черновик слова пришёл повторно — время не сбрасывается, подтверждение не откатывается', () => {
    const w = new Map()
    markWord(w, 2, false, 0); markWord(w, 2, true, 50)
    expect(w.get(2)).toEqual({ full: true, at: 0 })
  })
  it('finishDue: взлёт, когда заливка дошла до 100 % и подержалась FILL_HOLD_MS; не позже FILL_FINISH_MAX_MS', () => {
    const fin = { at: 0 }
    expect(finishDue(fin, 0.9, 100)).toBe(false)
    expect(finishDue(fin, 1, 200)).toBe(false)
    expect(finishDue(fin, 1, 200 + FILL_HOLD_MS)).toBe(true)
    expect(finishDue({ at: 0 }, 0.3, FILL_FINISH_MAX_MS)).toBe(true)
  })
})

describe('сцена «Скажи»: слова по одному и доезд перед взлётом', () => {
  const ph = phrasesOf({ phrases: PHRASE_FIXTURE })
  const say = () => phraseStep('phrases2', round2SayTurns(ph), { round: 2, mode: 'say', voice: true, speed: SAY_SPEED })
  it('«nice», «to», «meet» по одному с паузой 1 с (черновиком) — 25 / 50 / 75 %', () => {
    const s = setupScene(say(), { listen: createPhraseListener })
    s.go(600)
    const p = s.pool.taken[0], got = []
    for (const text of ['nice', 'nice to', 'nice to meet']) { stubDraft(text); s.go(1000); got.push(p.fill) }
    expect(got.map(v => Math.round(v * 100))).toEqual([25, 50, 75])
    s.run.stop()
  })
  it('итог при заливке 50 %: кромка доезжает до 100 % за ≈ 200 мс (2,5/с), взлёт и fx.win — после, не раньше FILL_HOLD_MS', () => {
    const s = setupScene(say(), { listen: createPhraseListener })
    s.go(600)
    const p = s.pool.taken[0]
    stubDraft('nice to'); s.go(1000); expect(p.fill).toBeCloseTo(0.5, 2)
    const t0 = s.clock.t
    stubSay('nice to meet you')
    let full = null, win = null
    while (s.clock.t - t0 < 1000 && win == null) { s.go(16); if (full == null && p.fill >= 1) full = s.clock.t - t0; if (s.fx.win.mock.calls.length) win = s.clock.t - t0 }
    expect(full).toBeGreaterThanOrEqual((0.5 / FILL_UP_PER_S) * 1000 - 16); expect(full).toBeLessThanOrEqual((0.5 / FILL_UP_PER_S) * 1000 + 32)
    expect(win - full).toBeGreaterThanOrEqual(FILL_HOLD_MS); expect(win - full).toBeLessThanOrEqual(FILL_HOLD_MS + 32)
    expect(p.rose).toBe(true)
    expect(p.fills.every((v, i) => i === 0 || v >= p.fills[i - 1] - 1e-9)).toBe(true) // назад не ехала
    s.run.stop()
  })
  it('итог с нуля — ожидание не дольше FILL_FINISH_MAX_MS', () => {
    const s = setupScene(say(), { listen: createPhraseListener, frame: 50 })
    s.go(600); stubSay('nice to meet you')
    s.go(FILL_FINISH_MAX_MS + 50); expect(s.fx.win).toHaveBeenCalledTimes(1)
    s.run.stop()
  })
})
