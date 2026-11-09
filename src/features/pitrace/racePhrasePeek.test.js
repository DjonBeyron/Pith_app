import { describe, it, expect } from 'vitest'
import { createPeek, peekLevel, PEEK_MS, PEEK_MAX } from './racePhrasePeek.js'
import { setupScene } from './racePhraseSceneRig.js'
import { createPhraseListener, stubDraft, stubSay, stubLevel } from './racePhraseListenStub.js'
import { phraseStep, SAY_SPEED } from './raceStagesPhrases.js'
import { round2SayTurns } from './racePhraseTurns.js'
import { phrasesOf } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'

// Подсказка следующего слова в проходе 1 «Скажи» (решение владельца 2026-11-09): до первого слова — нет; сказано слово k — слово k+1 проявляется целым словом 0 → 20 % и стоит;
// цепочка строго по порядку; последнее — подсказывать нечего (взлёт). Вид — racePhraseMaskView.peek (opacity), правило — racePhraseMask.nextPeek.
const fakeMask = () => { const sets = [], lv = []; return { sets, lv, set: (h, all, p) => sets.push(p), peek: v => lv.push(v) } }

describe('подсказка: порядок и проявление (чистая)', () => {
  it('ничего не сказано — подсказки нет и кадр ничего не пишет; слово 1 → слово 2 до 0,2 за PEEK_MS (ease-out) и стоит; слово 2 → слово 3; последнее → нет', () => {
    const m = fakeMask(), p = createPeek({ mask: m, text: 'Nice to meet you' })
    expect(p.index()).toBe(-1); p.frame(5000); expect(m.sets).toEqual([]); expect(m.lv).toEqual([])
    expect(p.show(new Map([[0, true]]), 1000)).toBe(1)
    p.frame(1000); p.frame(1000 + PEEK_MS / 2); p.frame(1000 + PEEK_MS); p.frame(1000 + PEEK_MS * 3)
    expect(m.lv[0]).toBe(0); expect(m.lv[1]).toBeGreaterThan(PEEK_MAX / 2); expect(m.lv[1]).toBeLessThan(PEEK_MAX) // ease-out: к половине времени — больше половины
    expect(m.lv[2]).toBeCloseTo(0.2, 6); expect(m.lv[3]).toBeCloseTo(0.2, 6) // не ярче 20 %, остаётся
    expect(p.show(new Map([[0, true]]), 1800)).toBe(1) // повтор слова 1 — проявление не начинается заново
    p.frame(1800); expect(m.lv.at(-1)).toBeCloseTo(peekLevel(800), 6)
    expect(p.show(new Map([[0, true], [1, false]]), 3000)).toBe(2); p.frame(3000); expect(m.lv.at(-1)).toBe(0) // слово 2 сказано (черновиком) — проявляется слово 3 с нуля
    expect(p.show(new Map([[0, true], [1, true], [2, true]]), 4000)).toBe(3)
    expect(p.show(new Map([[0, true], [1, true], [2, true], [3, true]]), 5000)).toBe(-1) // последнее — подсказывать нечего
    expect(m.sets).toEqual([1, 1, 2, 3, -1])
  })
  it('«I want to»: после «I» — «want»; после «want» — «to» открыт сразу, подсказывать нечего; перепрыгнул — сразу за самым дальним', () => {
    const m = fakeMask(), p = createPeek({ mask: m, text: 'I want to' })
    expect(p.show(new Map([[0, true]]), 0)).toBe(1); expect(p.show(new Map([[0, true], [1, true]]), 100)).toBe(-1)
    expect(createPeek({ mask: m, text: 'Nice to meet you' }).show(new Map([[0, true], [2, false]]), 0)).toBe(3)
  })
  it('peekLevel: 0 → PEEK_MAX, монотонно, дальше стоит', () => {
    expect(peekLevel(0)).toBe(0); expect(peekLevel(-50)).toBe(0); expect(peekLevel(PEEK_MS)).toBeCloseTo(PEEK_MAX, 9); expect(peekLevel(9e9)).toBeCloseTo(PEEK_MAX, 9)
    const vs = [0, 200, 400, 600, 800, 1000, 1200].map(peekLevel); expect(vs.every((v, i) => !i || v > vs[i - 1])).toBe(true)
  })
})

describe('подсказка в сцене (проход 1)', () => {
  const ph = phrasesOf({ phrases: PHRASE_FIXTURE })
  const say = () => phraseStep('phrases2', round2SayTurns(ph), { round: 2, mode: 'say', voice: true, speed: SAY_SPEED })
  it('пилюля едет, голос без слов — подсказки нет; слово 1 → peek на слове 2; слово 2 → на слове 3; последнее — взлёт', () => {
    const s = setupScene(say(), { listen: createPhraseListener })
    const st = () => s.run.api.state().mask.map(w => w.state).join(' ')
    s.go(600); for (let i = 0; i < 30; i++) { stubLevel(0.08); s.go(16) }
    expect(st()).toBe('full hidden hidden hidden')
    stubDraft('nice'); s.go(16); expect(st()).toBe('full peek hidden hidden')
    stubDraft('nice to'); s.go(16); expect(st()).toBe('full full peek hidden')
    stubDraft('nice to meet'); s.go(16); expect(st()).toBe('full full full peek')
    stubSay('nice to meet you'); expect(st()).toBe('full full full full')
    s.go(700); expect(s.fx.win).toHaveBeenCalledTimes(1); expect(s.pool.taken[0].fill).toBe(1)
    s.run.stop()
  })
})
