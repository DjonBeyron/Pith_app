import { describe, it, expect } from 'vitest'
import { matchConsensus, interimIsFull } from './sayConsensus.js'
import { judgeRun } from './sayResult.js'
import { readSayData } from './sayPhraseData.js'
import { emptyView } from './speechController.js'

const REF = "I'm trying to please both"
const view = (final, lastInterim = '') => ({ ...emptyView, lastInterim, final: { text: final, confidence: 0.9 }, alternatives: [{ text: final, confidence: 0.9 }] })
const strict = readSayData({ phrase: REF, keywords: 'please', strict: true })
const loose = readSayData({ phrase: REF, keywords: 'please' })

describe('interimIsFull — interim «полный», если слов не меньше, чем в final минус одно', () => {
  it('граница: n_interim ≥ n_final − 1; пустой interim не полный; сокращения раскрываются в слова', () => {
    expect(interimIsFull('I am try to please both', 'I am trying to please both')).toBe(true)
    expect(interimIsFull('I am try to please', 'I am trying to please both')).toBe(true)   // 5 ≥ 6 − 1
    expect(interimIsFull('I am try to', 'I am trying to please both')).toBe(false)         // 4 < 5
    expect(interimIsFull('', 'I am trying to please both')).toBe(false)
    expect(interimIsFull("I'm try to please both", 'I am trying to please both')).toBe(true) // «I'm» = i + am
  })
})

describe('consensus interim+final («Строго»)', () => {
  it('эталон «I\'m trying to please both», interim «I am try…», final «I am trying…» → «trying» НЕ засчитано, проверка не пройдена', () => {
    const v = view('I am trying to please both', 'I am try to please both')
    const r = judgeRun(v, strict)
    expect(r.consensus).toBe(true)
    expect(r.engineFixed).toEqual(['trying'])
    expect(r.missed).toEqual(['trying'])
    expect(r.matched).toEqual(['i', 'am', 'to', 'please', 'both'])
    expect(r.ratioPct).toBe(83)
    expect(r.passed).toBe(false)
  })

  it('non-strict решает по final как раньше: тот же ответ проходит', () => {
    const v = view('I am trying to please both', 'I am try to please both')
    const r = judgeRun(v, loose)
    expect(r.consensus).toBe(false)
    expect(r.engineFixed).toEqual([])
    expect(r.passed).toBe(true)
    expect(r.ratioPct).toBe(100)
  })

  it('interim совпал с final → строгая проверка проходит', () => {
    const r = judgeRun(view('I am trying to please both', 'I am trying to please both'), strict)
    expect(r).toMatchObject({ passed: true, consensus: true, engineFixed: [], ratioPct: 100 })
  })

  it('interim короче final (меньше чем на одно слово) или пуст — решает один final', () => {
    const short = judgeRun(view('I am trying to please both', 'I am'), strict)
    expect(short).toMatchObject({ consensus: false, passed: true })
    const empty = judgeRun(view('I am trying to please both', ''), strict)
    expect(empty).toMatchObject({ consensus: false, passed: true })
    // а при неточном final строгий режим по-прежнему не пускает
    expect(judgeRun(view('I am try to please both', ''), strict).passed).toBe(false)
  })

  it('слово, дописанное только в final (interim на одно слово короче), тоже не подтверждено', () => {
    const r = judgeRun(view('I am trying to please both', 'I am trying to please'), strict)
    expect(r.consensus).toBe(true)
    expect(r.engineFixed).toEqual(['both'])
    expect(r.passed).toBe(false)
  })

  it('регистр, знаки и сокращения не мешают: «I\'m» в эталоне = «I am» в interim и final', () => {
    const r = judgeRun(view('i AM trying, to please BOTH!', "I'm trying to please both"), strict)
    expect(r).toMatchObject({ passed: true, consensus: true, engineFixed: [] })
  })

  it('ключевое слово, подтверждённое только final, валит проверку, даже если порог пройден', () => {
    const d = readSayData({ phrase: REF, keywords: 'please', strict: true, threshold: 50 }) // strict всё равно 100%
    expect(d.passRatio).toBe(1)
    const m = matchConsensus(REF, 'I am trying to please both', 'I am trying to pleas both', ['please'], 0.5, { exactWords: true })
    expect(m.engineFixed).toEqual(['please'])
    expect(m.passed).toBe(false) // ключевое «please» не подтверждено interim, хотя 5/6 ≥ 50%
  })

  it('движок не «исправил» ничего → результат совпадает с обычной точной проверкой по final', () => {
    const m = matchConsensus(REF, 'I am trying to please both', 'I am trying to please both')
    expect(m.passed).toBe(true)
    expect(m.items.every(it => it.ok)).toBe(true)
  })
})

describe('«Строго» = консенсус И «первое увиденное» (history из контроллера)', () => {
  const FIN = 'I am trying to please both'
  const h = (t, text, final) => ({ t, text, ...(final ? { final: true } : {}) })
  const withHistory = (history, lastInterim = FIN) => ({ ...view(FIN, lastInterim), history })
  const held = [h(300, 'I am'), h(600, 'I am try'), h(1700, FIN), h(2000, FIN, true)] // «try» держится 1,1 с
  const flash = [h(300, 'I am'), h(600, 'I am try'), h(720, FIN), h(1500, FIN, true)] // «try» 120 мс

  it('консенсус пройден (interim = final), но «try» держалось 1,1 с → «trying» не засчитано', () => {
    const r = judgeRun(withHistory(held), strict)
    expect(r.consensus).toBe(true)
    expect(r.firstSeenBlocked).toEqual(['trying'])
    expect(r.engineFixed).toEqual(['trying'])
    expect(r.items.find(it => it.word === 'trying')).toMatchObject({ ok: false, dwellBlocked: true })
    expect(r.missed).toEqual(['trying'])
    expect(r.passed).toBe(false)
  })

  it('мимолётное «try» 120 мс → обе проверки подтверждают, проходит', () => {
    const r = judgeRun(withHistory(flash), strict)
    expect(r).toMatchObject({ passed: true, firstSeenBlocked: [], engineFixed: [] })
    expect(r.firstSeen.disputed).toHaveLength(1)
  })

  it('событие speechend на «try» блокирует даже короткую выдержку', () => {
    const history = [h(300, 'I am'), h(600, 'I am try'), { t: 650, kind: 'speechend' }, h(720, FIN), h(1500, FIN, true)]
    expect(judgeRun(withHistory(history), strict).passed).toBe(false)
  })

  it('оба должны подтвердить: консенсус отклоняет, даже если «первое увиденное» чисто', () => {
    const r = judgeRun({ ...view(FIN, 'I am try to please both'), history: [h(300, FIN), h(800, FIN, true)] }, strict)
    expect(r.firstSeenBlocked).toEqual([])
    expect(r.engineFixed).toEqual(['trying'])
    expect(r.passed).toBe(false)
  })

  it('не-строгая нода историю не учитывает: тот же ответ проходит, поведение прежнее', () => {
    const r = judgeRun(withHistory(held), loose)
    expect(r).toMatchObject({ passed: true, consensus: false, engineFixed: [] })
    expect(r.firstSeenBlocked).toBeUndefined()
  })

  it('матч без истории (старый view) работает как раньше', () => {
    expect(judgeRun(view(FIN, FIN), strict).passed).toBe(true)
  })
})
