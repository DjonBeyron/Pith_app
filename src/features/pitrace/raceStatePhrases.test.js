import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { phraseEvent, phrasePart, phraseNote, phraseSummary, weakPhraseKeys, fillPhrases2, phraseOnlyWords, PHRASE_UNCLEAN } from './raceStatePhrases.js'
import { initRace, reduceRace } from './raceState.js'
import { wordAccuracy } from './raceAccuracy.js'
import { accNote } from './raceAccuracyNote.js'
import { scoreRace } from './raceSim.js'
import { createPhraseVoice } from './racePhraseVoice.js'
import RaceSummary from './RaceSummary.jsx'
import { phrasesOf, phraseWordKeys } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'

// Результаты этапа «Фразы»: события ходов → состояние → точность слов, слабые фразы, итог; голос Пита на ходах
const [nice, from, learn] = phrasesOf({ phrases: PHRASE_FIXTURE })
const rep = (p, round, res, o = {}) => ({ phraseKey: p.key, text: p.text, ru: p.ru, words: phraseWordKeys(p), round, mode: round === 1 ? 'pick' : 'say', target: p, cands: [p, from, learn].map(x => ({ key: x.key, text: x.text })), res, ...o })
const stage = { race: true, act: 'phrases', type: 'student', sid: 'phrases1' }
const play = list => list.reduce((s, [kind, r]) => reduceRace(s, { t: 'phrase', stage, info: phraseEvent(kind, r) }).state, initRace())

describe('события фраз', () => {
  it('итог хода → { t: phrase, phraseKey, round, ok, late, confusedWith, ratio }; редюсер копит их в s.phrases', () => {
    const e = phraseEvent('miss', rep(nice, 1, { ok: false, confusedWith: from.key }))
    expect(e).toMatchObject({ t: 'phrase', phraseKey: nice.key, round: 1, ok: false, late: false, confusedWith: from.key, confusedText: from.text, ratio: 0 })
    expect(phraseEvent('claim', rep(nice, 1, {}))).toBeNull(); expect(phraseEvent('win', {})).toBeNull()
    const s = play([['win', rep(nice, 1, { ok: true, late: true })], ['fail', rep(learn, 2, { ratio: 0.5 })]])
    expect(s.phrases.map(x => [x.phraseKey, x.round, x.ok, x.late, x.ratio])).toEqual([[nice.key, 1, true, true, 1], [learn.key, 2, false, false, 0.5]])
    expect(initRace().phrases).toEqual([])
  })
  it('точность слова: чисто 1 / нечисто 0,6 / промах 0 — средним, наравне с проходами; пометка «во фразе … спутал»', () => {
    const s = play([['miss', rep(nice, 1, { confusedWith: from.key })], ['win', rep(nice, 2, { ratio: 0.75, clean: false })], ['win', rep(learn, 1, {})]])
    expect(phrasePart(s.phrases, 'meet').score).toBeCloseTo((0 + PHRASE_UNCLEAN) / 2)
    expect(phrasePart(s.phrases, 'learn').score).toBe(1)
    expect(phrasePart(s.phrases, 'where')).toBeNull()
    expect(wordAccuracy(s, 'learn')).toMatchObject({ pct: 100, a: null, b: null })
    const race = { ...s, sprint: { words: ['meet'], results: { 0: { hit: true, miss: false, ms: 0, life: 4000, tap: true } }, r2: null } }
    expect(wordAccuracy(race, 'meet').pct).toBe(Math.round(100 * (1 + 0.3) / 2))
    expect(phraseNote(phrasePart(s.phrases, 'meet'))).toBe('во фразе Nice to meet you спутал')
    expect(accNote(wordAccuracy(race, 'meet'))).toBe('A верно · во фразе Nice to meet you спутал')
    expect(phraseNote(phrasePart(s.phrases, 'learn'))).toBe('')
  })
  it('слабые фразы: ошибка, «не успел», поздно — в круге 2 последними (fillPhrases2 после круга 1)', () => {
    const s = play([['miss', rep(nice, 1, { confusedWith: from.key })], ['win', rep(from, 1, { late: true })], ['win', rep(learn, 1, {})]])
    expect(weakPhraseKeys(s.phrases)).toEqual([nice.key, from.key])
    const fill = vi.fn(); const stages = [{ sid: 'phrases1', act: 'phrases' }, { sid: 'phrases2', act: 'phrases', fill }]
    expect(fillPhrases2(stages, stages[0], s)).toBeNull(); expect(fill).toHaveBeenCalledWith([nice.key, from.key])
    expect(fillPhrases2(stages, { act: 'sprint', sid: 'sprint' }, s)).toBeNull(); expect(fill).toHaveBeenCalledTimes(1)
  })
  it('итог: фразы N/M, слабые фразы (с чем спутал, круг 2), слово фразы без «Пинг-понга» тоже в списке; промах во фразе — промах слова в памяти', () => {
    const plan = { ...normalizePlan({ ...fixturePlan('two'), game: 'race', round: 'stages' }), phrases: PHRASE_FIXTURE }
    const s = play([['miss', rep(nice, 1, { confusedWith: from.key })], ['win', rep(learn, 1, {})], ['win', rep(nice, 2, { ratio: 1, clean: true })]])
    const r = scoreRace(plan, { ...s, sprint: { words: ['nice'], caps: {}, results: { 0: { hit: true, miss: false } }, r2: null }, catch: { words: [], caps: {}, traps: [], results: {}, r2: null } })
    expect(r).toMatchObject({ phrasesOk: 2, phrasesTotal: 3 })
    expect(r.phrases.find(p => p.key === nice.key)).toMatchObject({ weak: true, r1: { ok: false, confusedText: from.text }, r2: { ok: true, clean: true } })
    expect(r.phrases.find(p => p.key === learn.key).weak).toBe(false)
    expect(r.weak.map(w => w.text)).toEqual(expect.arrayContaining(['nice', 'meet', 'learn', 'trying']))
    expect(r.weak.find(w => w.text === 'meet').acc.f.events).toHaveLength(2)
    expect(r.weak.find(w => w.text === 'meet')).toMatchObject({ phraseHits: 1, phraseMisses: 1 }) // поля для raceMemory.outcomesOf
    expect(r.weak.find(w => w.text === 'learn')).toMatchObject({ phraseHits: 1, phraseMisses: 0 })
    expect(r.words.find(w => w.text === 'meet')).toMatchObject({ hit: 1, miss: 1 })
    expect(phraseOnlyWords(phrasesOf(plan), s.phrases, new Set(['nice'])).map(w => w.text)).toEqual(['meet', 'trying', 'learn'])
    expect(phraseSummary([])).toEqual([])
  })
  it('финал: строка «Фразы» и блок «Слабые фразы» под списком слов (фраза, с чем спутал, круг 2)', () => {
    const plan = normalizePlan({ ...fixturePlan('three'), game: 'race', round: 'stages' })
    const phrases = phraseSummary(play([['miss', rep(nice, 1, { confusedWith: from.key })], ['fail', rep(nice, 2, { ratio: 0.5 })], ['win', rep(learn, 1, {})]]).phrases)
    const result = { sprint: { hit: 1, total: 2 }, catchOk: 0, catchTotal: 1, phrasesOk: 1, phrasesTotal: 3, phrases, medal: 'none', descent: null, xp: 0, capped: false, gold: false, metrics: null, weak: [{ text: 'meet', translation: 'встретить', tone: 'red', note: 'ошибка', score: 2, acc: { pct: 0, level: 0, a: null, b: null, f: phrasePart(play([['miss', rep(nice, 1, { confusedWith: from.key })]]).phrases, 'meet') } }] }
    const html = renderToStaticMarkup(createElement(RaceSummary, { plan, result, onDone() {} }))
    expect(html).toContain('data-testid="race-summary-phrases">1/3<')
    expect(html.indexOf('data-testid="race-weak"')).toBeLessThan(html.indexOf('data-testid="race-phrases-weak"'))
    expect(html.match(/data-testid="race-phrase-weak"/g)).toHaveLength(1)
    expect(html).toContain('спутал с «Where are you from»'); expect(html).toContain('круг 2 ✗'); expect(html).toContain('>Слабые фразы<')
    expect(html).toContain('во фразе Nice to meet you спутал')
    expect(html).not.toContain('race-summary-climb')
  })
})

describe('голос Пита на ходах (racePhraseVoice)', () => {
  const make = (o = {}) => {
    const said = [], cat = { busy: 0, busyLeft: () => cat.busy, holdBusy: vi.fn(), onStop: vi.fn(() => () => {}) }
    const timers = []
    const v = createPhraseVoice({ ctx: () => ({ sayLine: id => said.push(`line:${id}`), sayText: (t, op) => said.push(`${op?.ru ? 'ru' : 'en'}:${t}`), cat }), hasRu: o.hasRu ?? (() => true), play: (p, a) => said.push(`audio:${a.url}`), log: () => {}, setTimer: fn => { timers.push(fn); return timers.length }, clearTimer: () => {} })
    const flush = () => { for (let i = 0; i < 50 && timers.length; i++) timers.shift()() }
    return { v, said, cat, flush }
  }
  it('перед ходом — смысл по-русски; нет озвучки смысла — подпись над лентой (show); «Узнай» — фраза по-английски по словам', () => {
    const a = make(); a.v.pre({ mode: 'pick', target: nice }, {}); a.flush(); expect(a.said).toEqual([`ru:${nice.ru}`])
    const b = make({ hasRu: () => false }); const show = vi.fn(); b.v.pre({ mode: 'say', target: nice }, { show }); b.flush(); expect(b.said).toEqual([]); expect(show).toHaveBeenCalledWith(nice.ru)
    const c = make(); c.v.pre({ mode: 'hear', target: nice }, {}); c.flush(); expect(c.said).toEqual(['en:Nice', 'en:to', 'en:meet', 'en:you'])
  })
  it('верно — фраза и «да, это оно»; ошибка — «нет, это про другое», верная фраза и её смысл; «не успел» — верная фраза; целая озвучка — один файл', () => {
    const a = make(); a.v.react('win', { mode: 'pick', target: learn }); a.flush(); expect(a.said).toEqual(["en:I'm", 'en:trying', 'en:to', 'en:learn', 'line:race_phrase_yes'])
    const b = make(); b.v.react('miss', { mode: 'pick', target: { ...nice, audio: { url: 'u', duration: 1 } } }); b.flush(); expect(b.said).toEqual(['line:race_phrase_no', 'audio:u', `ru:${nice.ru}`])
    const c = make(); c.v.react('fail', { mode: 'say', target: from }); c.flush(); expect(c.said).toEqual(['en:Where', 'en:are', 'en:you', 'en:from'])
  })
  it('цепочка ждёт, пока Пит освободится, и держит его занятым (left); stop обрывает', () => {
    const a = make(); a.cat.busy = 500
    a.v.react('win', { mode: 'say', target: nice }); expect(a.v.left()).toBeGreaterThan(0)
    a.flush(); expect(a.said).toEqual([])
    a.cat.busy = 0; a.flush(); expect(a.said).toEqual(['line:race_phrase_yes']); expect(a.v.left()).toBe(0)
    a.v.react('fail', { mode: 'pick', target: nice }); a.v.stop(); a.flush(); expect(a.said).toHaveLength(2)
  })
})
