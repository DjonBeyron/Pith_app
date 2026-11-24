import { describe, it, expect, vi } from 'vitest'
import * as statePhrases from './raceStatePhrases.js'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { phraseEvent, phrasePart, phraseNote, phraseSummary, phraseOnlyWords, PHRASE_UNCLEAN } from './raceStatePhrases.js'
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
// Круг один (round 2). Второй аргумент — вид хода: 1 — тап «Узнай» (hear, пальцами), 2 — «Скажи» (say, голосом); круга 1 «Пойми» больше нет
const rep = (p, round, res, o = {}) => ({ phraseKey: p.key, text: p.text, ru: p.ru, words: phraseWordKeys(p), round: 2, mode: round === 1 ? 'hear' : 'say', target: p, cands: [p, from, learn].map(x => ({ key: x.key, text: x.text })), res, ...o })
const stage = { race: true, act: 'phrases', type: 'student', sid: 'phrases2' }
const play = list => list.reduce((s, [kind, r]) => reduceRace(s, { t: 'phrase', stage, info: phraseEvent(kind, r) }).state, initRace())

describe('события фраз', () => {
  it('итог хода → { t: phrase, phraseKey, round, ok, late, confusedWith, ratio }; редюсер копит их в s.phrases', () => {
    const e = phraseEvent('miss', rep(nice, 1, { ok: false, confusedWith: from.key }))
    expect(e).toMatchObject({ t: 'phrase', phraseKey: nice.key, round: 2, mode: 'hear', ok: false, late: false, confusedWith: from.key, confusedText: from.text, ratio: 0 })
    expect(phraseEvent('claim', rep(nice, 1, {}))).toBeNull(); expect(phraseEvent('win', {})).toBeNull()
    const s = play([['win', rep(nice, 1, { ok: true, late: true })], ['fail', rep(learn, 2, { ratio: 0.5 })]])
    expect(s.phrases.map(x => [x.phraseKey, x.round, x.mode, x.ok, x.late, x.ratio])).toEqual([[nice.key, 2, 'hear', true, true, 1], [learn.key, 2, 'say', false, false, 0.5]])
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
  it('круг «Пойми» вырезан: порядок «слабые последними» и его функции убраны (fillPhrases2, weakPhraseKeys)', () => {
    expect(statePhrases.fillPhrases2).toBeUndefined(); expect(statePhrases.weakPhraseKeys).toBeUndefined()
  })
  it('итог: фразы N/M, слабые фразы (ход «Узнай» / «Скажи»), слово фразы без «Пинг-понга» тоже в списке; промах во фразе — промах слова в памяти', () => {
    const plan = { ...normalizePlan({ ...fixturePlan('two'), game: 'race', round: 'stages' }), phrases: PHRASE_FIXTURE }
    const s = play([['miss', rep(nice, 1, { confusedWith: from.key })], ['win', rep(learn, 1, {})], ['win', rep(nice, 2, { ratio: 1, clean: true }, { pass: 2 })]])
    const r = scoreRace(plan, { ...s, sprint: { words: ['nice'], caps: {}, results: { 0: { hit: true, miss: false } }, r2: null }, catch: { words: [], caps: {}, traps: [], results: {}, r2: null } })
    expect(r).toMatchObject({ phrasesOk: 2, phrasesTotal: 3 })
    expect(r.phrases.find(p => p.key === nice.key)).toMatchObject({ weak: true, r2: { ok: false, mode: 'hear' }, p2: { ok: true, clean: true } })
    expect(r.phrases.find(p => p.key === nice.key).r1).toBeUndefined() // строки круга 1 в итоге больше нет
    expect(r.phrases.find(p => p.key === learn.key).weak).toBe(false)
    expect(r.weak.map(w => w.text)).toEqual(expect.arrayContaining(['nice', 'meet', 'learn', 'trying']))
    expect(r.weak.find(w => w.text === 'meet').acc.f.events).toHaveLength(2)
    expect(r.weak.find(w => w.text === 'meet')).toMatchObject({ phraseHits: 1, phraseMisses: 1 }) // поля для raceMemory.outcomesOf
    expect(r.weak.find(w => w.text === 'learn')).toMatchObject({ phraseHits: 1, phraseMisses: 0 })
    expect(r.words.find(w => w.text === 'meet')).toMatchObject({ hit: 1, miss: 1 })
    expect(phraseOnlyWords(phrasesOf(plan), s.phrases, new Set(['nice'])).map(w => w.text)).toEqual(['meet', 'trying', 'learn'])
    expect(phraseSummary([])).toEqual([])
  })
  it('финал: строка «Фразы» и блок «Слабые фразы» под списком слов (фраза, метка хода; «круг 1 / круг 2» в подписи нет)', () => {
    const plan = normalizePlan({ ...fixturePlan('three'), game: 'race', round: 'stages' })
    const phrases = phraseSummary(play([['fail', rep(nice, 2, { ratio: 0.5 })], ['win', rep(learn, 1, {})], ['miss', rep(from, 1, { confusedWith: nice.key })]]).phrases)
    const result = { sprint: { hit: 1, total: 2 }, catchOk: 0, catchTotal: 1, phrasesOk: 1, phrasesTotal: 3, phrases, medal: 'none', descent: null, xp: 0, capped: false, gold: false, metrics: null, weak: [{ text: 'meet', translation: 'встретить', tone: 'red', note: 'ошибка', score: 2, acc: { pct: 0, level: 0, a: null, b: null, f: phrasePart(play([['miss', rep(nice, 1, { confusedWith: from.key })]]).phrases, 'meet') } }] }
    const html = renderToStaticMarkup(createElement(RaceSummary, { plan, result, onDone() {} }))
    expect(html).toContain('data-testid="race-summary-phrases">1/3<')
    expect(html.indexOf('data-testid="race-weak"')).toBeLessThan(html.indexOf('data-testid="race-phrases-weak"'))
    expect(html.match(/data-testid="race-phrase-weak"/g)).toHaveLength(2)
    expect(html).toContain('по словам ✗'); expect(html).toContain('смысл ✗'); expect(html).toContain('>Слабые фразы<')
    expect(html).not.toMatch(/круг [12]/); expect(html).not.toContain('race-phrase-note')
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
  it('перед ходом — «Скажи» смысл по-русски (ситуацию вырезанного круга «Пойми» Пит не говорит); нет озвучки — подпись над лентой (show); «Узнай» — фраза по-английски по словам', () => {
    const a = make(); a.v.pre({ mode: 'say', target: nice }, {}); a.flush(); expect(a.said).toEqual([`ru:${nice.ru}`])
    const b = make({ hasRu: () => false }); const show = vi.fn(); b.v.pre({ mode: 'say', target: nice }, { show }); b.flush(); expect(b.said).toEqual([]); expect(show).toHaveBeenCalledWith(nice.ru)
    const c = make(); c.v.pre({ mode: 'hear', target: nice }, {}); c.flush(); expect(c.said).toEqual(['en:Nice', 'en:to', 'en:meet', 'en:you'])
  })
  it('верно — («Узнай»: смысл и) «да, это оно»; ошибка — «нет, это про другое», верная фраза и её смысл; «не успел» — верная фраза; целая озвучка — один файл', () => {
    const a = make(); a.v.react('win', { mode: 'hear', target: learn }); a.flush(); expect(a.said).toEqual([`ru:${learn.ru}`, 'line:race_phrase_yes'])
    const b3 = make(); b3.v.react('miss', { mode: 'hear', target: { ...nice, audio: { url: 'u', duration: 1 } } }); b3.flush(); expect(b3.said).toEqual(['line:race_phrase_no', 'audio:u', `ru:${nice.ru}`]) // «Узнай» (hear): выбирают смысл, его читаем как раньше
    const c = make(); c.v.react('fail', { mode: 'say', target: from }); c.flush(); expect(c.said).toEqual(['en:Where', 'en:are', 'en:you', 'en:from'])
  })
  it('цепочка ждёт, пока Пит освободится, и держит его занятым (left); stop обрывает', () => {
    const a = make(); a.cat.busy = 500
    a.v.react('win', { mode: 'say', target: nice }); expect(a.v.left()).toBeGreaterThan(0)
    a.flush(); expect(a.said).toEqual([])
    a.cat.busy = 0; a.flush(); expect(a.said).toEqual(['line:race_phrase_yes']); expect(a.v.left()).toBe(0)
    a.v.react('fail', { mode: 'hear', target: nice }); a.v.stop(); a.flush(); expect(a.said).toHaveLength(2)
  })
})
