import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createGlide } from './racePhraseGlide.js'
import { mountMask, WRONG_SHOW_MS } from './racePhraseMaskView.js'
import { createWrongWord } from './racePhraseWrongWord.js'

// v3.3.272 (владелец, логи v3.3.271): проход 2 — заливка не по самому дальнему слову («where from» → 97 %), а по непрерывному префиксу; проход 1 — неверное слово пишется над подсказкой красным зачёркнутым
const rd = p => readFileSync(new URL(p, import.meta.url), 'utf8')

describe('заливка «Скажи», проход 2: по непрерывному префиксу слов', () => {
  it('«where from» (слова 1 и 4 из «where are you from»): линия стоит у границы слова 1, а не у последнего', () => {
    const g = createGlide({ n: 4 }); g.word(0, 0); g.word(3, 400)
    expect(g.goal({ t: 400 })).toBeCloseTo(0.25, 2)   // доли 1/N без измеренных границ
    g.word(1, 800); g.word(2, 1200)                   // пропуск закрылся — линия догоняет до конца префикса
    expect(g.goal({ t: 1200 })).toBeGreaterThan(0.9)
  })
  it('слово не по порядку само линию не двигает', () => { const g = createGlide({ n: 4 }); g.word(2, 0); expect(g.goal({ t: 0 })).toBe(0) })
})

describe('неверное слово: красным на самой пилюле, подписи над ней нет (v3.3.305)', () => {
  it('missing(k) красит ожидаемое слово, пока его не скажут; подписей <s class="racePhraseWrong"> в маске больше нет', () => {
    const m = mountMask({}, 'Where are you from')
    m.set(new Map([[0, true]])); expect(m.missing(1)).toBe(true); expect(m.words()[1].state).toBe('miss')
    m.set(new Map([[0, true], [1, true]])); expect(m.words()[1].state).not.toBe('miss')
    expect(m.wrong).toBeUndefined()
  })
  it('проводка: SayView красит ожидаемое слово (mask.missing), подписи нет; стилей подписи в CSS нет', () => {
    const v = rd('./racePhraseSayView.js'); expect(v).toContain('mask?.missing?.(kw)'); expect(v).not.toContain('mask?.wrong')
    expect(rd('../../styles/player/modules/race-phrase-rounds.css')).not.toContain('.racePhraseWrong')
  })
})

describe('итог принятой неполной фразы: несказанные слова красным на месте (keepWrong, v3.3.305)', () => {
  it('видна вся фраза, несказанное слово — state miss; сказанные — full; без несказанных красного нет', () => {
    const m = mountMask({}, 'Where are you from')
    m.keepWrong(new Map([[0, true], [2, true], [3, true]])); expect(m.words().map(w => w.state)).toEqual(['full', 'miss', 'full', 'full'])
    m.keepWrong(new Map([[0, true], [1, true], [2, true], [3, true]])); expect(m.words().map(w => w.state)).toEqual(['full', 'full', 'full', 'full'])
  })
  it('проводка в сцене: итог зовёт keepWrong', () => { expect(rd('./racePhraseScene.js')).toContain('keepWrong?.(said.heard())') })
})

describe('мягкое правило подписи (shown)', () => {
  it('«where you from» при цели «where are you from»: «you» вместо «are» — не рывок (слово цели), но подпись над «are»', () => {
    const w = createWrongWord({ words: ['where', 'are', 'you', 'from'] })
    w.ear({ kind: 'partial', text: 'where you from' }); const said = new Map([[0, true]])
    expect(w.check(said, 1000)).toBeNull(); expect(w.shown()).toBe('you'); expect(w.shown()).toBeNull() // один раз
  })
  it('верное следующее слово подписи не даёт', () => {
    const w = createWrongWord({ words: ['where', 'are', 'you', 'from'] })
    w.ear({ kind: 'partial', text: 'where are you' }); w.check(new Map([[0, true]]), 1000); expect(w.shown()).toBeNull()
  })
})

import { createSayView } from './racePhraseSayView.js'
describe('подпись слова «вперёд» (v3.3.282)', () => {
  it('«where you from»: «you» уже отмечено как услышанное (слово вперёд), но стоит вместо «are» — подпись над «are» всё равно есть', () => {
    const w = createWrongWord({ words: ['where', 'are', 'you', 'from'] })
    w.ear({ kind: 'partial', text: 'where you from' }); const said = new Map([[0, true], [2, true]])
    w.check(said, 1000); expect(w.shown()).toBe('you')
  })
  it('слово, уже стоящее в порядке («where» при ожидаемом «are»), подписью не становится', () => {
    const w = createWrongWord({ words: ['where', 'are', 'you', 'from'] })
    w.ear({ kind: 'partial', text: 'where are' }); w.check(new Map([[0, true]]), 1000); expect(w.shown()).toBeNull()
  })
})

describe('подпись неверного слова — и в проходе 2 (v3.3.277)', () => {
  it('проход 2: «where you from» вместо «where are you from» → красным пропущенное «are» (mask.missing(1)), рывка кромки нет', () => {
    const calls = [], miss = [], mask = { set() {}, peek() {}, edges: () => null, wrong: (w, k) => calls.push([w, k]), missing: k => { miss.push(k); return true } }, nudges = []
    const v = createSayView({ pass: 2, text: 'Where are you from', n: 4, mask, nudge: on => nudges.push(on), el: null })
    v.word(0, new Map([[0, true]]), 0)
    v.ear({ kind: 'partial', text: 'where you from' }); v.frame(1000, false, 0.3)
    expect(calls).toEqual([]); expect(miss).toEqual([1]); expect(nudges).toEqual([])
  })
  it('слово не из цели («where is you from» → «is») — тоже красным ожидаемое «are», подписи «is» нет', () => {
    const calls = [], miss = [], mask = { set() {}, peek() {}, edges: () => null, wrong: (w, k) => calls.push([w, k]), missing: k => { miss.push(k); return true } }
    const v = createSayView({ pass: 2, text: 'Where are you from', n: 4, mask, nudge: () => {}, el: null })
    v.word(0, new Map([[0, true]]), 0); v.ear({ kind: 'partial', text: 'where is' }); v.frame(1000, false, 0.3); v.frame(1400, false, 0.3)
    expect(calls).toEqual([]); expect(miss).toEqual([1])
  })
})

describe('красное неверное слово — сразу и по первому (v3.3.285)', () => {
  it('последнее слово черновика («nice to learn» при ожидаемом «meet») годится для подписи, когда не меняется 350 мс — без следующего слова', () => {
    const w = createWrongWord({ words: ['nice', 'to', 'meet', 'you'] }), said = new Map([[0, true], [1, true]])
    w.ear({ kind: 'partial', text: 'nice to learn' })
    w.check(said, 1000); expect(w.shown()).toBeNull()            // только появилось — ждём устойчивости
    w.check(said, 1250); expect(w.shown()).toBeNull(); w.check(said, 1350); expect(w.shown()).toBe('learn') // v3.3.314: 350 мс (было 200)
    w.check(said, 1700); expect(w.shown()).toBeNull()            // одно слово — одна подпись
  })
  it('слово меняется («lea» → «learn»), префикс ожидаемого («mee» при «meet») и верное слово подписи не дают', () => {
    const w = createWrongWord({ words: ['nice', 'to', 'meet', 'you'] }), said = new Map([[0, true], [1, true]])
    w.ear({ kind: 'partial', text: 'nice to mee' }); w.check(said, 1000); w.check(said, 1300); expect(w.shown()).toBeNull()
    w.ear({ kind: 'partial', text: 'nice to meet' }); w.check(said, 1400); w.check(said, 1700); expect(w.shown()).toBeNull()
  })
})

describe('подпись из черновика снимается, если итог захода её не подтвердил (v3.3.302)', () => {
  it('черновик «where you» → подпись «you»; итог «where» без «you» — retracted() один раз; итог с «you» — не снимает', () => {
    const w = createWrongWord({ words: ['where', 'are', 'you', 'from'] })
    w.ear({ kind: 'partial', text: 'where you' }); w.check(new Map([[0, true]]), 0); w.check(new Map([[0, true]]), 400)
    expect(w.shown()).toBe('you'); expect(w.retracted()).toBe(false)
    w.ear({ kind: 'final', text: 'where' }); expect(w.retracted()).toBe(true); expect(w.retracted()).toBe(false)
    const k = createWrongWord({ words: ['where', 'are', 'you', 'from'] })
    k.ear({ kind: 'partial', text: 'where you from' }); k.check(new Map([[0, true]]), 0)
    expect(k.shown()).toBe('you'); k.ear({ kind: 'final', text: 'where you from' }); expect(k.retracted()).toBe(false)
  })
  it('проводка: SayView зовёт mask.unwrong, маска снимает и показанную, и запомненную подпись', () => {
    expect(rd('./racePhraseSayView.js')).toContain('mask?.unwrong?.()'); expect(rd('./racePhraseMaskView.js')).toContain('unwrong()')
  })
})
