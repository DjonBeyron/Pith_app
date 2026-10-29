import { describe, it, expect } from 'vitest'
import { normalizePlan, warmupWords, discernWords, laneOfWord, planTexts, wordsOfChunk, MAX_WARMUP } from './rehearsalPlan.js'
import { FIXTURES, FIXTURE_IDS, fixturePlan, planFor, nextFixture, fixtureIdOf } from './rehearsalFixtures.js'
import { readRehearsalCfg, nextPlan } from './rehearsalCfg.js'
import { readWordLane } from '../player/modules/rotate-phone/wordLaneConfig.js'

// План репетиции (CONCEPT_REHEARSAL.md §4): нормализация, слова разминки, четыре фикстуры, поставщик planFor
describe('normalizePlan', () => {
  it('куски из phrase через «|» или из chunks (до трёх), перевод, язык по умолчанию, источник', () => {
    const p = normalizePlan({ phrase: "I'm | trying | to learn | extra", translation: ' Я пытаюсь ' })
    expect(p.chunks).toEqual(["I'm", 'trying', 'to learn'])
    expect(p.phrase).toBe("I'm | trying | to learn")
    expect(p.translation).toBe('Я пытаюсь')
    expect(p.lang).toBe('en-US')
    expect(p.source).toBe('node')
    expect(normalizePlan({ chunks: ['a', 'b'], phrase: 'x | y | z' }).chunks).toEqual(['a', 'b'])
  })
  it('нет кусков / не объект → null', () => {
    expect(normalizePlan(null)).toBeNull()
    expect(normalizePlan({ phrase: '  | ' })).toBeNull()
    expect(normalizePlan('x')).toBeNull()
  })
  it('слова: пустые отбрасываются, двойники без повторов и самого слова, не больше двух; ударные — только существующие куски', () => {
    const p = normalizePlan({ phrase: 'a | b', words: [{ text: 'learn', due: true, lapses: 2.7, confusers: ['earn', 'Earn', 'learn', 'lean', 'lern'] }, { text: '  ' }, null], stressed: [1, 1, 5, -1, 'x'] })
    expect(p.words).toEqual([{ text: 'learn', translation: '', due: true, lapses: 2, confusers: ['earn', 'lean'] }])
    expect(p.stressed).toEqual([1])
  })
  it('озвучка фразы: только с url; слова всегда из библиотеки', () => {
    expect(normalizePlan({ phrase: 'a', audio: { phrase: { url: 'u', timings: [{ word: 'a' }] } } }).audio).toEqual({ phrase: { url: 'u', timings: [{ word: 'a' }] }, words: 'lib' })
    expect(normalizePlan({ phrase: 'a', audio: { phrase: { timings: [] } } }).audio.phrase).toBeNull()
  })
})

describe('слова разминки и «Различи»', () => {
  it('2–3 слова «к повтору», у каждого дорожка — кусок, где оно стоит', () => {
    const w = warmupWords(fixturePlan('three'))
    expect(w.map(x => [x.text, x.lane])).toEqual([['trying', 1], ['learn', 2]])
    const many = normalizePlan({ phrase: 'a b | c d | e f', words: ['a', 'c', 'e', 'f'].map(t => ({ text: t, due: true })) })
    expect(warmupWords(many)).toHaveLength(MAX_WARMUP)
  })
  it('нет слов «к повтору» — два любых слова плана, а нет и их — два слова из фразы без перевода', () => {
    expect(warmupWords(fixturePlan('none')).map(x => x.text)).toEqual(['where', 'from'])
    const bare = warmupWords(normalizePlan({ phrase: 'Where | are you | from' }))
    expect(bare).toHaveLength(2)
    expect(bare.every(x => x.translation === '' && !x.due)).toBe(true)
  })
  it('одно слово — одно слово разминки на центральной дорожке', () => {
    const w = warmupWords(fixturePlan('one'))
    expect(w).toHaveLength(1)
    expect(w[0]).toMatchObject({ text: 'remember', lane: 1 })
  })
  it('«Различи» — только слова с двойниками', () => {
    expect(discernWords(fixturePlan('three')).map(w => w.text)).toEqual(['learn'])
    expect(discernWords(fixturePlan('two'))).toEqual([])
  })
  it('laneOfWord: по токенам, потом по вхождению; нет слова — −1; wordsOfChunk без знаков по краям', () => {
    expect(laneOfWord(["I'm", 'trying', 'to learn'], 'learn')).toBe(2)
    expect(laneOfWord(["I'm", 'trying', 'to learn'], 'try')).toBe(1)
    expect(laneOfWord(['a'], 'zzz')).toBe(-1)
    expect(wordsOfChunk('«Hello,» world!')).toEqual(['Hello', 'world'])
  })
  it('planTexts: куски, слова, двойники и слова фразы — по одному разу', () => {
    const t = planTexts(fixturePlan('three'))
    expect(t).toEqual(expect.arrayContaining(["I'm", 'trying', 'to learn', 'learn', 'earn', 'lean', 'to']))
    expect(new Set(t.map(x => x.toLowerCase())).size).toBe(t.length)
  })
})

describe('фикстуры и поставщик плана', () => {
  it('четыре фикстуры: три куска с двойником, два без двойников, одно слово, фраза без слов «к повтору»', () => {
    expect(FIXTURE_IDS).toEqual(['three', 'two', 'one', 'none'])
    expect(fixturePlan('three').words.find(w => w.text === 'learn').confusers).toEqual(['earn', 'lean'])
    expect(fixturePlan('two').chunks).toHaveLength(2)
    expect(fixturePlan('two').words.every(w => !w.confusers.length)).toBe(true)
    expect(fixturePlan('one').chunks).toHaveLength(1)
    expect(fixturePlan('none').words.some(w => w.due)).toBe(false)
    for (const id of FIXTURE_IDS) { expect(FIXTURES[id].title).toBeTruthy(); expect(fixturePlan(id).source).toBe('sim') }
  })
  it('planFor: сейчас только sim (фикстура, по умолчанию «три куска»); другие источники пока не подключены', () => {
    expect(planFor('sim').phrase).toBe("I'm | trying | to learn")
    expect(planFor('sim', { fixture: 'one' }).chunks).toEqual(['Remember'])
    expect(planFor('sim', { fixture: 'нет такой' }).phrase).toBe("I'm | trying | to learn")
    expect(planFor('memory')).toBeNull()
    expect(planFor('node')).toBeNull()
  })
  it('«Ещё минутку?»: следующая фикстура по кругу, у чужого плана — следующая после умолчания', () => {
    expect(nextFixture('three')).toBe('two'); expect(nextFixture('none')).toBe('three')
    expect(fixtureIdOf(fixturePlan('one'))).toBe('one')
    expect(nextPlan(fixturePlan('one')).phrase).toBe(fixturePlan('none').phrase)
    expect(nextPlan(normalizePlan({ phrase: 'zz' })).phrase).toBe(fixturePlan('two').phrase)
  })
})

describe('нода с планом читается как игра', () => {
  it('readWordLane({ plan }) → cfg с plan, кусками, переводом и словами для озвучки; битый план — обычная нода', () => {
    const cfg = readWordLane({ plan: { phrase: "I'm | trying | to learn", translation: 'Я пытаюсь учиться', words: [{ text: 'learn', confusers: ['earn'] }] } })
    expect(cfg.plan.chunks).toEqual(["I'm", 'trying', 'to learn'])
    expect(cfg.chunks).toEqual(cfg.plan.chunks)
    expect(cfg.translation).toBe('Я пытаюсь учиться')
    expect(cfg.extraWords).toEqual(expect.arrayContaining(['learn', 'earn']))
    expect(cfg.hasAudio).toBe(false)
    expect(cfg.confusers.flat()).toEqual([])
    expect(readWordLane({ plan: { phrase: '' } }).plan).toBeUndefined()
    expect(readRehearsalCfg(null)).toBeNull()
  })
})
