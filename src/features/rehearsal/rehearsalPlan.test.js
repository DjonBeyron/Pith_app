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
  it('в разминке ВСЕ слова фразы: «к повтору» первыми, потом остальные в порядке фразы; у каждого дорожка — кусок, где оно стоит', () => {
    const w = warmupWords(fixturePlan('three'))
    expect(w.map(x => [x.text, x.lane])).toEqual([['trying', 1], ['learn', 2], ["I'm", 0], ['to', 2]])
    expect(w.map(x => x.due)).toEqual([true, true, false, false])
    expect(w[0]).toMatchObject({ translation: 'пытаюсь', lapses: 1 }) // слово с карточкой несёт её перевод
    expect(w[2]).toMatchObject({ translation: '', lapses: 0, confusers: [] }) // слово без карточки — пустой перевод
  })
  it('слова фразы без повторов («to» дважды — одно слово); карточка, чьего слова нет во фразе дословно, идёт в конец', () => {
    const p = normalizePlan({ phrase: 'to be | or not | to be', words: [{ text: 'maybe', due: true }, { text: 'be' }] })
    expect(warmupWords(p).map(x => x.text)).toEqual(['maybe', 'to', 'be', 'or', 'not'])
  })
  it('слов больше потолка MAX_WARMUP — отрезаются слова без «к повтору», «к повтору» остаются', () => {
    const long = normalizePlan({ phrase: 'a1 a2 a3 a4 a5 | a6 a7 a8 a9 | b1 b2 b3 b4', words: [{ text: 'b4', due: true }, { text: 'b3', due: true }] })
    const w = warmupWords(long)
    expect(w).toHaveLength(MAX_WARMUP)
    expect(w.slice(0, 2).map(x => x.text)).toEqual(['b3', 'b4']) // порядок как во фразе внутри «к повтору»
    expect(w.map(x => x.text)).not.toContain('b2')
  })
  it('нет слов «к повтору» — всё равно все слова фразы (карточки плана и слова без карточки), порядок как во фразе', () => {
    expect(warmupWords(fixturePlan('none')).map(x => x.text)).toEqual(['where', 'are', 'you', 'from'])
    const bare = warmupWords(normalizePlan({ phrase: 'Where | are you | from' }))
    expect(bare.map(x => x.text)).toEqual(['Where', 'are', 'you', 'from'])
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
