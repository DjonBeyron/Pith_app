// Заливка «втыкается» на пропущенном слове (владелец, v3.3.394, «Where are you from», «are» пропущено: «пилюля полностью заполнилась, а должна была воткнуться на «are»») и не стоит залитой без зачёта
// (тот же журнал, «I'm trying to learn»: «полностью заполнился, но не улетал»). Правила: racePhraseShare.fillTo, racePhraseFill.fillGoal (непрерывный префикс), racePhraseSayView.goal (FULL_WAIT_MS).
import { describe, it, expect } from 'vitest'
import { setupScene } from './racePhraseSceneRig.js'
import { createPhraseListener, stubSay, stubDraft } from './racePhraseListenStub.js'
import { phraseStep, SAY_SPEED } from './raceStagesPhrases.js'
import { round2SayTurns } from './racePhraseTurns.js'
import { phrasesOf } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { createSayView, FULL_WAIT_MS } from './racePhraseSayView.js'
import { LAST_WORD_CAP } from './racePhraseFill.js'

const ph = phrasesOf({ phrases: PHRASE_FIXTURE })
const say = () => phraseStep('phrases2', round2SayTurns(ph), { round: 2, mode: 'say', voice: true, speed: SAY_SPEED })
const heardOf = ks => new Map(ks.map(k => [k, true]))

describe('заливка втыкается на пропущенном слове', () => {
  it('проход 1: «nice meet» — «meet» сказано вперёд, «to» нет: линия стоит после «nice», «meet» не заливает; потом «to» — линия догоняет до «meet»', () => {
    const s = setupScene(say(), { listen: createPhraseListener }); s.go(600)
    const p = s.pool.taken[0]
    stubDraft('nice'); s.go(600); expect(p.fill).toBeCloseTo(0.25, 2)
    stubDraft('nice meet'); s.go(1500); expect(p.fill).toBeCloseTo(0.25, 2) // «meet» пропуск не перескакивает
    expect(s.fx.win).not.toHaveBeenCalled()
    stubDraft('nice to meet'); s.go(1200); expect(p.fill).toBeCloseTo(0.75, 2) // пропуск сказан — линия догнала до услышанного
    s.run.stop()
  })
  it('проход 1: пропущено последнее слово («nice to meet») — принято по 3 из 4, заливка встаёт перед «you» (0,75), не 100 % и не 80 %', () => {
    const s = setupScene(say(), { listen: createPhraseListener }); s.go(600)
    const p = s.pool.taken[0]
    stubSay('nice to meet'); s.go(1500)
    expect(s.fx.win).toHaveBeenCalledTimes(1); expect(p.fill).toBeCloseTo(0.75, 2)
    s.run.stop()
  })
})

describe('вид хода: слова после пропуска не заливают, пропуск сказан — догоняет', () => {
  it('проход 2: пропущено первое слово — «to meet you» сказаны, заливки нет (хранятся как услышанные); «nice» сказано позже — линия до края слов', () => {
    const v = createSayView({ pass: 2, text: 'Nice to meet you', n: 4, mask: null })
    ;[1, 2, 3].forEach((i, k) => v.word(i, heardOf([1, 2, 3].slice(0, k + 1)), 1000 + k * 100))
    expect(v.goal({ t: 1500, done: false })).toBe(0)
    v.word(0, heardOf([0, 1, 2, 3]), 2000)
    expect(v.goal({ t: 2000, done: false })).toBeCloseTo(LAST_WORD_CAP, 2)
  })
  it('проход 2: пропущено среднее слово — линия стоит перед ним', () => {
    const v = createSayView({ pass: 2, text: 'Nice to meet you', n: 4, mask: null })
    v.word(0, heardOf([0]), 1000); v.word(1, heardOf([0, 1]), 1500); v.word(3, heardOf([0, 1, 3]), 1700)
    expect(v.goal({ t: 5000, done: false })).toBeCloseTo(0.5, 2)
  })
  it('залито до края (все слова сказаны), а зачёта нет FULL_WAIT_MS — линия отходит перед последнее слово и пишет в журнал; зачёт (done) — снова 100 %', () => {
    const logs = [], v = createSayView({ pass: 1, text: 'Nice to meet you', n: 4, mask: null, log: x => logs.push(x) })
    const m = heardOf([0, 1, 2, 3]); m.forEach((_, i) => v.word(i, heardOf([...Array(i + 1).keys()]), 1000))
    const words = new Map([0, 1, 2, 3].map(i => [i, { full: true, at: 1000 }]))
    expect(v.goal({ t: 1000, words, done: false })).toBeCloseTo(LAST_WORD_CAP, 2)
    expect(v.goal({ t: 1000 + FULL_WAIT_MS - 10, words, done: false })).toBeCloseTo(LAST_WORD_CAP, 2) // зачёт обычно приходит за 0–400 мс — ждём
    expect(v.goal({ t: 1000 + FULL_WAIT_MS + 10, words, done: false })).toBeCloseTo(0.75, 2)
    expect(logs.filter(l => /зачёта нет/.test(l))).toHaveLength(1)
    v.goal({ t: 3000, words, done: false }); expect(logs.filter(l => /зачёта нет/.test(l))).toHaveLength(1) // журнал — один раз
    expect(v.goal({ t: 3100, words, done: true })).toBe(1)
  })
})
