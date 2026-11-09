import { describe, it, expect } from 'vitest'
import { fillGoal, saidPrefix, markWord, finishDue, wordEdges, edgeAt, FILL_HOLD_MS, FILL_FINISH_MAX_MS, LAST_WORD_CAP } from './racePhraseFill.js'
import { setupScene } from './racePhraseSceneRig.js'
import { createPhraseListener, stubSay, stubDraft } from './racePhraseListenStub.js'
import { phraseStep, SAY_SPEED } from './raceStagesPhrases.js'
import { round2SayTurns } from './racePhraseTurns.js'
import { phrasesOf } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { FILL_UP_PER_S } from '../player/modules/rotate-phone/wordLaneFillView.js'

// Заливка «Скажи» (racePhraseFill.js): каждое сказанное слово — своя полная доля, «аванс» — только до первого слова, после итога заливка доезжает до 100 % и только потом взлёт
describe('цель заливки по словам', () => {
  it('1 слово из 4 — 25 %, 2 — 50 %: и черновое, и подтверждённое — сразу полная доля (без выдержки)', () => {
    const w = new Map()
    markWord(w, 0, true, 1000)
    expect(fillGoal({ words: w, n: 4, t: 1000 })).toBeCloseTo(0.25, 6)
    markWord(w, 1, false, 1100)
    expect(fillGoal({ words: w, n: 4, t: 1100 })).toBeCloseTo(0.5, 6)
  })
  it('«аванса» нет: пока ни одного слова фразы — 0 (шум и черновик без слов цели не заливают, heardAt больше не принимается); после первого слова — его доля; итог — 100 %', () => {
    const w = new Map()
    expect(fillGoal({ words: w, n: 4, t: 500, heardAt: 499 })).toBe(0)
    markWord(w, 0, false, 600)
    expect(fillGoal({ words: w, n: 4, t: 700, heardAt: 690 })).toBeCloseTo(0.25, 6)
    expect(fillGoal({ words: w, n: 4, done: true })).toBe(1)
  })
  it('последнее слово без итога — LAST_WORD_CAP (кромка у края, не упёрлась), 100 % — только по итогу (done)', () => {
    const w = new Map(); [0, 1, 2, 3].forEach(i => markWord(w, i, true, 0))
    expect(LAST_WORD_CAP).toBe(0.97)
    expect(fillGoal({ words: w, n: 4 })).toBe(LAST_WORD_CAP); expect(fillGoal({ words: w, n: 4, edges: [0.3, 0.45, 0.8, 1] })).toBe(LAST_WORD_CAP)
    expect(fillGoal({ words: w, n: 4, done: true })).toBe(1)
  })
  it('по порядку (журнал владельца, «Where are you from»: «where», «where you», «where from», «are»): линия — по непрерывному префиксу, слова вперёд ждут пропуск', () => {
    const w = new Map(), e = [0.38, 0.53, 0.65, 1]
    markWord(w, 0, true, 0); expect(saidPrefix(w)).toBe(1); expect(fillGoal({ words: w, n: 4, edges: e })).toBe(0.38)
    markWord(w, 2, true, 100); expect(fillGoal({ words: w, n: 4, edges: e })).toBe(0.38) // «you» вперёд — линия стоит после «where»
    markWord(w, 3, true, 200); expect(fillGoal({ words: w, n: 4, edges: e })).toBe(0.38)
    markWord(w, 1, true, 300); expect(saidPrefix(w)).toBe(4); expect(fillGoal({ words: w, n: 4, edges: e })).toBe(LAST_WORD_CAP) // пропуск закрыт — догоняет
    expect(saidPrefix(new Map([[1, {}], [2, {}]]))).toBe(0); expect(saidPrefix(new Set([0, 1]))).toBe(2)
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
    expect(FILL_FINISH_MAX_MS).toBe(400)
    const full = []; const f2 = { at: 0 }
    finishDue(f2, 1, 50, t => full.push(t)); finishDue(f2, 1, 70, t => full.push(t))
    expect(full).toEqual([50]) // onFull — один раз, когда впервые 100 %
  })
})

// Границы слов на пилюле (замечание A): «Nice to meet you» в одну строку — слова разной ширины, линия встаёт посередине зазора
const R = (left, right, top = 0) => ({ left, right, top, bottom: top + 20 })
describe('wordEdges: граница — середина зазора между словами, в долях слоя кромки', () => {
  const layer = { left: 10, width: 300 }
  it('одна строка: точные середины зазоров, последнее — 100 %', () => {
    const e = wordEdges([R(60, 110), R(120, 140), R(150, 210), R(220, 260)], layer)
    expect(e[0]).toBeCloseTo((115 - 10) / 300, 6); expect(e[1]).toBeCloseTo((145 - 10) / 300, 6); expect(e[2]).toBeCloseTo((215 - 10) / 300, 6); expect(e[3]).toBe(1)
  })
  it('две строки: «виртуальная одна строка» на ширину текста, по возрастанию, зазор переноса — средний', () => {
    const e = wordEdges([R(40, 100), R(110, 160), R(170, 260), R(60, 120, 30), R(130, 230, 30)], layer)
    const span = 260 - 40, total = 60 + 50 + 90 + 60 + 100 + 4 * 10
    expect(e[2]).toBeCloseTo((40 + ((220 + 5) / total) * span - 10) / 300, 6)
    expect(e.every((v, i) => !i || v > e[i - 1])).toBe(true); expect(e[4]).toBe(1)
  })
  it('нет размеров (не в DOM / скрыта) — null; edgeAt без границ — доли 1/N, с границами — граница, «аванс» — доля первой', () => {
    expect(wordEdges([R(0, 0), R(10, 20)], layer)).toBe(null); expect(wordEdges([], layer)).toBe(null); expect(wordEdges([R(0, 10)], { left: 0, width: 0 })).toBe(null)
    expect(edgeAt(1, 4, null)).toBe(0.25); expect(edgeAt(2, 4, [0.4, 0.5, 0.8, 1])).toBe(0.5); expect(edgeAt(0.35, 4, [0.4, 0.5, 0.8, 1])).toBeCloseTo(0.14, 6)
    expect(edgeAt(4, 4, [0.4, 0.5, 0.8, 1])).toBe(1); expect(edgeAt(0, 4, [0.4, 0.5, 0.8, 1])).toBe(0)
    const w = new Map(); markWord(w, 0, true, 0)
    expect(fillGoal({ words: w, n: 4, t: 0, edges: [0.3, 0.45, 0.8, 1] })).toBe(0.3)
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
  it('итог при заливке 50 %: кромка доезжает до 100 % быстрее, чем за 200 мс (адаптивный догон), взлёт и fx.win — после, не раньше FILL_HOLD_MS', () => {
    const s = setupScene(say(), { listen: createPhraseListener })
    s.go(600)
    const p = s.pool.taken[0]
    stubDraft('nice to'); s.go(1000); expect(p.fill).toBeCloseTo(0.5, 2)
    const t0 = s.clock.t
    stubSay('nice to meet you')
    let full = null, win = null
    while (s.clock.t - t0 < 1000 && win == null) { s.go(16); if (full == null && p.fill >= 1) full = s.clock.t - t0; if (s.fx.win.mock.calls.length) win = s.clock.t - t0 }
    expect(full).toBeGreaterThanOrEqual(64); expect(full).toBeLessThanOrEqual((0.5 / FILL_UP_PER_S) * 1000)
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
  it('быстрая речь: 4 слова за 1,2 с черновиками — заливка идёт без откатов, от последнего слова до 100 % ≤ 0,5 с, журнал «[fill] 100 % через N мс после последнего слова»', () => {
    const logs = []
    const s = setupScene(say(), { listen: createPhraseListener, log: x => logs.push(x) })
    s.go(600)
    const p = s.pool.taken[0]
    for (const text of ['nice', 'nice to', 'nice to meet']) { stubDraft(text); s.go(300) }
    expect(p.fill).toBeCloseTo(0.75, 2) // каждое черновое слово — сразу своя доля, экран успевает за 300 мс
    stubSay('nice to meet you')
    const t0 = s.clock.t
    while (p.fill < 1 && s.clock.t - t0 < 1000) s.go(16)
    expect(s.clock.t - t0).toBeLessThanOrEqual(500)
    s.go(300) // взлёт — через FILL_HOLD_MS после 100 %
    const line = logs.find(x => x.startsWith('[fill] 100 % через'))
    expect(line).toMatch(/^\[fill\] 100 % через \d+ мс после последнего слова, последнее слово пришло: итогом, взлёт \+\d+ мс$/) // «you» — только итогом (как «from» у владельца)
    expect(Number(line.match(/через (\d+) мс/)[1])).toBeLessThanOrEqual(500)
    expect(p.fills.every((v, i) => i === 0 || v >= p.fills[i - 1] - 1e-9)).toBe(true)
    s.run.stop()
  })
})
