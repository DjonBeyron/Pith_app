import { describe, it, expect } from 'vitest'
import { missedWord, createSlips, slipRule, applySlip, slipItems, slipNote, SLIP_PAUSE_MS, SLIP_RETRY_LINE, SLIP_NEXT_LINE } from './racePhraseSlip.js'
import { PARTIAL_FILL, fillTo } from './racePhraseShare.js'
import { createPhraseVoice } from './racePhraseVoice.js'
import { readFileSync } from 'node:fs'

// v3.3.276: фраза принята не по всем словам — засчитана визуально; первая неточность: «попробуй ещё раз» (+ одна доп. пилюля, если это последняя пилюля фразы), вторая: «в следующий раз», XP нет
const mk = text => ({ target: { key: text.toLowerCase(), text }, pass: 1 })
const turnsOf = text => [{ ...mk(text), idx: 0, pass: 1 }, { ...mk(text), idx: 1, pass: 2 }]
const accepted = ratio => ({ ok: true, ratio, clean: false })
const heardOf = (...i) => new Map(i.map(x => [x, true]))

describe('первое не услышанное слово', () => {
  it('missedWord: первое слово фразы без пары среди услышанных; всё сказано — null', () => {
    expect(missedWord('Nice to meet you', heardOf(0, 1, 3))).toBe('meet')
    expect(missedWord('Nice to meet you', heardOf(1, 2, 3))).toBe('Nice')
    expect(missedWord('Nice to meet you', heardOf(0, 1, 2, 3))).toBeNull()
  })
})

describe('правила неточностей по фразе', () => {
  it('проход 1: первая неточность — XP есть, ещё пилюли нет (дальше идёт проход 2)', () => {
    const turns = turnsOf('Nice to meet you'), slips = createSlips(), res = accepted(0.75)
    const s = applySlip({ res, turns, ti: 0, slips, heard: heardOf(0, 1, 3) })
    expect(s).toMatchObject({ word: 'meet', nth: 1, noXp: false, extra: false }); expect(res.noXp).toBeUndefined(); expect(turns).toHaveLength(2)
  })
  it('проход 2 (последняя пилюля фразы): первая неточность — ещё ОДНА пилюля этой фразы, номера ходов пересчитаны', () => {
    const turns = [...turnsOf('Nice to meet you'), { ...mk('Other one two three'), idx: 2, pass: 1 }], slips = createSlips(), res = accepted(0.75)
    const s = applySlip({ res, turns, ti: 1, slips, heard: heardOf(0, 1, 2) })
    expect(s).toMatchObject({ word: 'you', nth: 1, extra: true }); expect(turns).toHaveLength(4)
    expect(turns[2]).toMatchObject({ extra: true, pass: 2, idx: 2 }); expect(turns[2].target.text).toBe('Nice to meet you'); expect(turns[3].idx).toBe(3)
  })
  it('вторая неточность (в том же ходе или на другом слове): XP нет, доп. пилюли нет', () => {
    const turns = turnsOf('Nice to meet you'), slips = createSlips()
    applySlip({ res: accepted(0.75), turns, ti: 0, slips, heard: heardOf(0, 1, 3) })
    const res = accepted(0.75), s = applySlip({ res, turns, ti: 1, slips, heard: heardOf(1, 2, 3) })
    expect(s).toMatchObject({ word: 'Nice', nth: 2, noXp: true, extra: false }); expect(res.noXp).toBe(true); expect(turns).toHaveLength(2)
  })
  it('доп. пилюля, снова неточная, — вторая неточность: без XP и без ещё одной', () => {
    expect(slipRule({ word: 'a', nth: 2, pass: 2, isExtra: true })).toMatchObject({ noXp: true, extra: false })
    expect(slipRule({ word: 'a', nth: 1, pass: 2, isExtra: true }).extra).toBe(false)
  })
  it('счёт по фразам: у другой фразы своя первая неточность; чистая фраза и непринятый ход неточностью не считаются', () => {
    const slips = createSlips(), a = turnsOf('Nice to meet you'), b = turnsOf('Where are you from')
    applySlip({ res: accepted(0.75), turns: a, ti: 0, slips, heard: heardOf(0, 1, 3) })
    expect(applySlip({ res: accepted(0.75), turns: b, ti: 0, slips, heard: heardOf(0, 1, 2) })?.nth).toBe(1)
    expect(applySlip({ res: accepted(1), turns: b, ti: 1, slips, heard: heardOf(0, 1, 2, 3) })).toBeNull()
    expect(applySlip({ res: { ok: false, ratio: 0.5 }, turns: b, ti: 1, slips, heard: heardOf(0) })).toBeNull()
  })
})

describe('реплики Пита и журнал', () => {
  it('цепочка: «слово» → слово → «попробуй ещё раз» / «в следующий раз»; журнал называет слово, номер, XP', () => {
    expect(slipItems({ word: 'meet', nth: 1 })).toEqual([{ line: 'race_slip_word', pause: SLIP_PAUSE_MS, join: true }, { word: 'meet' }, { line: SLIP_RETRY_LINE, pause: SLIP_PAUSE_MS, join: true }])
    expect(slipItems({ word: 'meet', nth: 2 }).at(-1)).toEqual({ line: SLIP_NEXT_LINE, pause: SLIP_PAUSE_MS, join: true }); expect(slipItems(null)).toEqual([])
    expect(slipNote({ word: 'meet', nth: 2, noXp: true, extra: false })).toContain('XP нет'); expect(slipNote({ word: 'you', nth: 1, extra: true })).toContain('ещё одна пилюля')
  })
  it('голос: итог win с res.slip говорит слова, а не «да» и не молчит после прохода 1', () => {
    const said = [], c = { sayLine: l => said.push(l), sayText: w => said.push(`w:${w}`), cat: { busyLeft: () => 0 } }, timers = []
    const v = createPhraseVoice({ ctx: () => c, setTimer: f => { timers.push(f); return timers.length }, clearTimer: () => {}, log: () => {} })
    v.react('win', { target: { text: 'Nice to meet you' }, mode: 'say', pass: 1, res: { slip: { word: 'meet', nth: 1 } } })
    for (let i = 0; i < 6 && timers.length; i++) timers.shift()()
    expect(said).toEqual(['race_slip_word', 'w:meet', SLIP_RETRY_LINE])
  })
})

describe('вид и XP', () => {
  it('заливка неполной фразы — строго 80 %', () => { expect(fillTo({ ratio: 0.75, n: 4 })).toBe(PARTIAL_FILL); expect(PARTIAL_FILL).toBe(0.8) })
  it('проводка: XP не начисляется при res.noXp, пилюля летит вверх, а не в счётчик', () => {
    expect(readFileSync(new URL('../player/modules/rotate-phone/useWordLaneFlow.js', import.meta.url), 'utf8')).toContain('rep.last && !rep.res?.noXp')
    expect(readFileSync(new URL('./racePhraseScene.js', import.meta.url), 'utf8')).toContain('pool.rise(tg.k, { xp: !res.noXp })')
  })
})
