import { describe, it, expect, vi } from 'vitest'
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

function fakeDoc() {
  const mk = () => { const el = { children: [], attrs: {}, style: { setProperty() {} }, appendChild(c) { this.children.push(c); c.parent = this; return c }, setAttribute(k, v) { this.attrs[k] = v }, removeAttribute() {}, remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this) }, querySelector: () => null, cloneNode: () => null, getBoundingClientRect: () => ({}) }; return el }
  return { createElement: () => mk(), createTextNode: () => mk(), fonts: null, mk }
}

describe('неверное слово над подсказкой (racePhraseMaskView.wrong)', () => {
  it('<s class="racePhraseWrong"> появляется в ячейке ожидаемого слова, снимается по таймеру и когда слово сказано', () => {
    vi.useFakeTimers()
    const doc = fakeDoc(), el = doc.mk(); el.ownerDocument = doc
    const m = mountMask(el, 'Where are you from')
    m.wrong('you', 1)
    const cell = () => el.children[0].children.filter(c => c.children?.length !== undefined).find(c => c.children.some(x => x.className === 'racePhraseWrong'))
    expect(cell()).toBeTruthy()
    vi.advanceTimersByTime(WRONG_SHOW_MS + 10); expect(cell()).toBeFalsy()
    m.wrong('you', 1); m.set(new Map([[0, true], [1, true]])); expect(cell()).toBeFalsy() // слово 1 сказано — зачёркнутое пропало
    vi.useRealTimers()
  })
  it('проводка: SayView зовёт mask.wrong на неверном слове; стиль — красный, line-through, 1 px', () => {
    expect(rd('./racePhraseSayView.js')).toContain('mask?.wrong?.(shown, k)')
    const css = rd('../../styles/player/modules/race-phrase-rounds.css'); expect(css).toContain('.racePhraseWrong'); expect(css).toContain('text-decoration: line-through'); expect(css).toContain('text-decoration-thickness: 1px')
  })
})

describe('итог хода: красная подпись остаётся у несказанного слова (keepWrong, v3.3.276)', () => {
  it('сказано вместо слова — подпись у него без таймера; ничего не сказано — над словом пусто; сказанные слова подписи не имеют', () => {
    vi.useFakeTimers()
    const doc = fakeDoc(), el = doc.mk(); el.ownerDocument = doc
    const m = mountMask(el, 'Where are you from')
    m.wrong('you', 1) // вместо «are» услышано «you»
    const labeled = () => el.children[0].children.filter(c => c.children?.some?.(x => x.className === 'racePhraseWrong')).length
    vi.advanceTimersByTime(WRONG_SHOW_MS + 10); expect(labeled()).toBe(0) // на ходу подпись гаснет
    m.keepWrong(new Map([[0, true], [2, true], [3, true]])); expect(labeled()).toBe(1)
    vi.advanceTimersByTime(60000); expect(labeled()).toBe(1) // в итоге — стоит, пока пилюля на экране
    m.keepWrong(new Map([[0, true], [1, true], [2, true], [3, true]])); expect(labeled()).toBe(0) // слово сказано — подписи нет
    const m2 = mountMask(el, 'Nice to meet you'); m2.keepWrong(new Map([[0, true], [1, true], [3, true]])); expect(labeled()).toBe(0) // ничего не сказали вместо «meet» — пусто
    vi.useRealTimers()
  })
  it('итог принятой неполной фразы: слова белые (не data-w=miss), подпись — keepWrong; проводка в сцене', () => {
    const sc = rd('./racePhraseScene.js'); expect(sc).toContain('keepWrong?.(said.heard())'); expect(sc).not.toContain('isPartial(res.ratio)) // итог «Скажи»: видна вся фраза (взлетает или доезжает вниз с ней), несказанные слова — красным')
  })
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
describe('подпись неверного слова — и в проходе 2 (v3.3.277)', () => {
  it('проход 2: «where you from» вместо «where are you from» → mask.wrong(«you», 1), рывка кромки нет', () => {
    const calls = [], mask = { set() {}, peek() {}, edges: () => null, wrong: (w, k) => calls.push([w, k]) }, nudges = []
    const v = createSayView({ pass: 2, text: 'Where are you from', n: 4, mask, nudge: on => nudges.push(on), el: null })
    v.word(0, new Map([[0, true]]), 0)
    v.ear({ kind: 'partial', text: 'where you from' }); v.frame(1000, false, 0.3)
    expect(calls).toEqual([['you', 1]]); expect(nudges).toEqual([])
  })
})
