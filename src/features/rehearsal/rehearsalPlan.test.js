import { describe, it, expect } from 'vitest'
import { normalizePlan, warmupWords, discernWords, laneOfWord, planTexts, wordsOfChunk, MAX_WARMUP, MAX_PLAN_WORDS } from './rehearsalPlan.js'
import { isStopWord } from './rehearsalStopWords.js'
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
  it('в разминке ТОЛЬКО слова с карточкой: «к повтору» первыми, потом остальные в порядке фразы; «to» (служебное, карточки нет) не идёт; у каждого дорожка — кусок, где оно стоит', () => {
    const w = warmupWords(fixturePlan('three'))
    expect(w.map(x => [x.text, x.lane])).toEqual([['trying', 1], ['learn', 2], ["I'm", 0]])
    expect(w.map(x => x.due)).toEqual([true, true, false])
    expect(w[0]).toMatchObject({ translation: 'пытаюсь', lapses: 1 }) // слово с карточкой несёт её перевод
    expect(w[2]).toMatchObject({ translation: 'я', lapses: 0, confusers: [] }) // «I'm» — карточка в фикстуре есть
    expect(w.every(x => x.translation)).toBe(true) // пустых дорожек нет
  })
  it("«I'm» (с апострофом, в том числе типографским) находит свою карточку и свой кусок; нормализация сокращения («i am») этому не мешает", () => {
    for (const apos of ["'", '\u2019']) {
      const p = normalizePlan({ phrase: `I${apos}m | trying | to learn`, words: [{ text: "I'm", translation: 'я' }, { text: 'trying', translation: 'пытаюсь' }] })
      expect(warmupWords(p).map(x => [x.text, x.lane])).toEqual([["I'm", 0], ['trying', 1]])
    }
    expect(laneOfWord(["I'm", 'trying'], "I'm")).toBe(0)
  })
  it('слово без карточки (или с карточкой без перевода) в разминку не идёт', () => {
    const p = normalizePlan({ phrase: 'big | red apple', words: [{ text: 'apple', translation: 'яблоко' }, { text: 'red', due: true }] })
    expect(warmupWords(p).map(x => x.text)).toEqual(['apple'])
  })
  it("служебные слова (to, a, the, is …) не идут в разминку, даже если для них есть карточка; «I'm» — не служебное", () => {
    const p = normalizePlan({ phrase: "the cat | is on | I'm", words: ['the', 'cat', 'is', 'on', "I'm"].map((t, i) => ({ text: t, translation: `п${i}`, due: i === 0 })) })
    expect(warmupWords(p).map(x => x.text)).toEqual(['cat', "I'm"])
    expect(isStopWord('To')).toBe(true); expect(isStopWord('the,')).toBe(true); expect(isStopWord("I'm")).toBe(false); expect(isStopWord('learn')).toBe(false); expect(isStopWord('')).toBe(false)
  })
  it('фраза из одного слова: оно идёт в разминку всегда (даже без карточки и даже служебное), перевод — перевод фразы', () => {
    expect(warmupWords(normalizePlan({ phrase: 'Remember', translation: 'Помнить' })).map(x => x.text)).toEqual(['Remember'])
    expect(warmupWords(normalizePlan({ phrase: 'The' })).map(x => [x.text, x.lane])).toEqual([['The', 1]])
  })
  it('слова фразы без повторов; карточка, чьего слова нет во фразе дословно, идёт в конец «к повтору» первой', () => {
    const p = normalizePlan({ phrase: 'not yet | not now | maybe', words: [{ text: 'now', translation: 'сейчас' }, { text: 'not', translation: 'не' }, { text: 'soon', translation: 'скоро', due: true }] })
    expect(warmupWords(p).map(x => x.text)).toEqual(['soon', 'not', 'now'])
  })
  it('карточек не больше MAX_PLAN_WORDS (они и есть слова разминки, это не больше MAX_WARMUP); «к повтору» остаются первыми', () => {
    const names = 'b4 b3 a1 a2 a3 a4 a5 a6 a7 a8 a9 b1 b2'.split(' ')
    const long = normalizePlan({ phrase: 'a1 a2 a3 a4 a5 | a6 a7 a8 a9 | b1 b2 b3 b4', words: names.map(t => ({ text: t, translation: `п${t}`, due: t === 'b4' || t === 'b3' })) })
    const w = warmupWords(long)
    expect(w).toHaveLength(MAX_PLAN_WORDS); expect(MAX_PLAN_WORDS).toBeLessThanOrEqual(MAX_WARMUP)
    expect(w.slice(0, 2).map(x => x.text)).toEqual(['b3', 'b4']) // порядок как во фразе внутри «к повтору»
    expect(w.map(x => x.text)).not.toContain('b2')
  })
  it('нет слов «к повтору» — идут остальные слова с карточкой в порядке фразы; нет карточек — разминка пуста', () => {
    expect(warmupWords(fixturePlan('none')).map(x => x.text)).toEqual(['where', 'from'])
    expect(warmupWords(normalizePlan({ phrase: 'Where | are you | from' }))).toEqual([])
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
  it('номер запуска в тапе (plan.run): первого плана нет; «Ещё минутку?» даёт 1, 2…; нормализация его хранит (реплики старта и итога — «ещё раз»)', () => {
    expect('run' in fixturePlan('three')).toBe(false); expect(normalizePlan({ phrase: 'a | b', run: 0 }).run).toBeUndefined(); expect(normalizePlan({ phrase: 'a | b', run: 'x' }).run).toBeUndefined()
    const second = nextPlan(fixturePlan('three')), third = nextPlan(second)
    expect([second.run, third.run]).toEqual([1, 2]); expect(normalizePlan({ ...third }).run).toBe(2)
    expect(readRehearsalCfg(second).plan.run).toBe(1); expect(readRehearsalCfg(second).firstLines[0]).toBe('rh_start_b'); expect(readRehearsalCfg(fixturePlan('three')).firstLines[0]).toBe('rh_start')
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
