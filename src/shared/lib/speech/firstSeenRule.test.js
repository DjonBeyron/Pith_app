import { describe, it, expect } from 'vitest'
import { firstSeenRule, firstSeenNote, clampDwell, DWELL_DEFAULT } from './firstSeenRule.js'

const REF = "I'm trying"
const h = (t, text, final) => ({ t, text, ...(final ? { final: true } : {}) })
const ev = (t, kind) => ({ t, kind })

// Из журнала пользователя (iPhone, iOS 18.7): «I» → «I am» → «I'm am» → «I'm» → «I'm trying» → «I'm trying» [final]
const USER_LOG = [h(400, 'I'), h(700, 'I am'), h(950, "I'm am"), h(1200, "I'm"), h(1500, "I'm trying"), h(1900, "I'm trying", true)]

describe('firstSeenRule: фикстуры', () => {
  it('история пользователя: «trying» подтверждено, спорных слов нет', () => {
    const r = firstSeenRule({ reference: REF, history: USER_LOG, final: { text: "I'm trying" } })
    expect(r.ok).toBe(true)
    expect(r.used).toBe(true)
    expect(r.disputed).toEqual([])
    expect(r.blocked).toEqual([])
    expect(r.words.map(w => [w.word, w.state])).toEqual([['i', 'confirmed'], ['am', 'confirmed'], ['trying', 'confirmed']])
    expect(r.text).toBe('i am trying')
  })

  it('намеренное «I\'m try»: interim «try» держится 1,1 с до замены на «trying» → НЕ подтверждено', () => {
    const history = [h(300, "I'm"), h(600, "I'm try"), ev(1500, 'speechend'), h(1700, "I'm trying"), h(2000, "I'm trying", true)]
    const r = firstSeenRule({ reference: REF, history, final: { text: "I'm trying" } })
    expect(r.ok).toBe(false)
    expect(r.blocked).toEqual(['trying'])
    expect(r.missed).toEqual(['trying'])
    expect(r.text).toBe('i am try') // как слышал движок до исправления
    expect(r.disputed).toEqual([{ word: 'trying', form: 'try', dwellMs: 1100, atEnd: true, inFinal: false, blocked: true }])
    expect(firstSeenNote(r)).toBe('trying: «try» держалась 1100 мс, на момент конца речи')
  })

  it('только interim «try» без «I\'m» (держится 1,1 с) → НЕ подтверждено', () => {
    const history = [h(200, 'try'), h(1300, "I'm trying"), h(1500, "I'm trying", true)]
    const r = firstSeenRule({ reference: REF, history, final: { text: "I'm trying" } })
    expect(r.ok).toBe(false)
    expect(r.disputed[0]).toMatchObject({ form: 'try', dwellMs: 1100, blocked: true })
  })

  it('мимолётное «try» 120 мс посреди «trying» → подтверждено, но в спорных с выдержкой', () => {
    const history = [h(300, "I'm"), h(600, "I'm try"), h(720, "I'm trying"), ev(1400, 'speechend'), h(1600, "I'm trying", true)]
    const r = firstSeenRule({ reference: REF, history, final: { text: "I'm trying" } })
    expect(r.ok).toBe(true)
    expect(r.disputed).toEqual([{ word: 'trying', form: 'try', dwellMs: 120, atEnd: false, inFinal: false, blocked: false }])
    expect(r.words.find(w => w.word === 'trying')).toMatchObject({ state: 'confirmed', form: 'try', firstAt: 600 })
    expect(r.text).toBe('i am try') // самая ранняя форма всё равно «try»
    expect(firstSeenNote(r)).toBe('мимолётно (≤500 мс): trying←«try» 120 мс')
  })
})

describe('firstSeenRule: порог выдержки и события конца речи', () => {
  const quick = [h(300, "I'm"), h(600, "I'm try"), h(900, "I'm trying"), h(1200, "I'm trying", true)] // «try» 300 мс

  it('порог настраивается: 300 мс держится дольше порога 200, но не дольше 500', () => {
    expect(firstSeenRule({ reference: REF, history: quick, final: { text: "I'm trying" }, dwellMs: 500 }).ok).toBe(true)
    expect(firstSeenRule({ reference: REF, history: quick, final: { text: "I'm trying" }, dwellMs: 200 }).ok).toBe(false)
    expect(firstSeenRule({ reference: REF, history: quick, final: { text: "I'm trying" }, dwellMs: 50 }).dwellMs).toBe(200) // зажато в 200–1200
  })

  it('форма на экране в момент speechend блокирует даже короткую выдержку (событие soundend — так же)', () => {
    for (const kind of ['speechend', 'soundend']) {
      const history = [h(300, "I'm"), h(600, "I'm try"), ev(650, kind), h(720, "I'm trying"), h(1000, "I'm trying", true)] // 120 мс, но конец речи на «try»
      const r = firstSeenRule({ reference: REF, history, final: { text: "I'm trying" } })
      expect(r.ok).toBe(false)
      expect(r.disputed[0]).toMatchObject({ dwellMs: 120, atEnd: true, blocked: true })
    }
  })

  it('буквальная форма в самом итоге → не подтверждено', () => {
    const history = [h(300, "I'm"), h(700, "I'm try"), h(900, "I'm try", true)]
    const r = firstSeenRule({ reference: REF, history, final: { text: "I'm try" } })
    expect(r.ok).toBe(false)
    expect(r.disputed[0]).toMatchObject({ inFinal: true, blocked: true })
  })

  it('прерывистое «try»: считается самый долгий непрерывный показ, а не сумма', () => {
    const history = [h(100, "I'm try"), h(300, "I'm trying"), h(500, "I'm try"), h(700, "I'm trying"), h(900, "I'm trying", true)] // 200 + 200
    expect(firstSeenRule({ reference: REF, history, final: { text: "I'm trying" }, dwellMs: 300 }).ok).toBe(true)
    expect(firstSeenRule({ reference: REF, history, final: { text: "I'm trying" }, dwellMs: 200 }).ok).toBe(true) // «дольше», а не «не меньше»
  })
})

describe('firstSeenRule: нет данных и граничные случаи', () => {
  it('interim не было (iOS не прислал): used=false, решает итог — верный проходит, литеральный нет', () => {
    const good = firstSeenRule({ reference: REF, history: [h(1500, "I'm trying", true)], final: { text: "I'm trying" } })
    expect(good).toMatchObject({ used: false, ok: true })
    const bad = firstSeenRule({ reference: REF, history: [], final: { text: "I'm try" } })
    expect(bad).toMatchObject({ used: false, ok: false, blocked: ['trying'] })
  })

  it('время interim неизвестно (только lastInterim): буквальная форма не подтверждается (консервативно)', () => {
    const r = firstSeenRule({ reference: REF, history: [], lastInterim: "I'm try", final: { text: "I'm trying" } })
    expect(r.ok).toBe(false)
    expect(r.disputed[0]).toMatchObject({ dwellMs: null, blocked: true })
    expect(firstSeenNote(r)).toContain('время неизвестно')
  })

  it('слово не звучало вовсе → absent, не подтверждено; keys ограничивает вердикт', () => {
    const r = firstSeenRule({ reference: REF, history: [h(500, 'I am happy'), h(900, 'I am happy', true)], final: { text: 'I am happy' } })
    expect(r.words.find(w => w.word === 'trying').state).toBe('absent')
    expect(r.ok).toBe(false)
    expect(firstSeenRule({ reference: REF, history: [h(500, 'I am happy'), h(900, 'I am happy', true)], final: { text: 'I am happy' }, keys: ['am'] }).ok).toBe(true)
  })

  it('служебные события в истории не мешают разбору текстов', () => {
    const history = [ev(100, 'soundstart'), ev(150, 'speechstart'), h(400, "I'm trying"), ev(800, 'speechend'), ev(850, 'soundend'), ev(900, 'audioend'), h(1000, "I'm trying", true)]
    expect(firstSeenRule({ reference: REF, history, final: { text: "I'm trying" } }).ok).toBe(true)
  })

  it('несколько слов эталона: ошибка только в одном, остальные подтверждены', () => {
    const history = [h(200, "I'm try to please"), h(1500, "I'm trying to please"), h(1800, "I'm trying to please", true)]
    const r = firstSeenRule({ reference: "I'm trying to please", history, final: { text: "I'm trying to please" } })
    expect(r.words.filter(w => w.state !== 'confirmed').map(w => w.word)).toEqual(['trying'])
    expect(r.text).toBe('i am try to please')
  })

  it('clampDwell: мусор → значение по умолчанию', () => {
    expect(clampDwell('abc')).toBe(DWELL_DEFAULT)
    expect(clampDwell(5000)).toBe(1200)
  })
})
