import { describe, it, expect } from 'vitest'
import { createWrongWord, TAIL_STABLE_MS } from './racePhraseWrongWord.js'

// Стражи индикации красного (журнал владельца v3.3.398, iPhone 12 mini; «говорю намеренно неверное слово»): РЕАЛЬНОЕ слово не по цели — красное ожидаемое слово, в том числе первое слово фразы;
// шум / «[unk]» из тишины / пустой итог — красного нет. Сцены — из журнала: «Nice to meet you» («nice meet you», «meet you» вместо «nice to meet you»), «Where are you from» («where you from»).
const NICE = ['Nice', 'to', 'meet', 'you'], WHERE = ['Where', 'are', 'you', 'from']
const said = (...ix) => new Map(ix.map(i => [i, true]))
const run = (words, events, saidSet, t = 0) => { const w = createWrongWord({ words }); events.forEach(e => w.ear(e)); const miss = w.check(saidSet, t); return { miss, shown: w.shown(), w } }

describe('реальное неверное слово — красное есть', () => {
  it('«nice meet you» вместо «nice to meet you»: «meet» вместо «to» — подпись над «to» (журнал 12:07:16)', () => {
    const r = run(NICE, [{ kind: 'partial', text: 'nice meet you', raw: 'nice meet you' }], said(0))
    expect(r.shown).toBe('meet')
  })
  it('«where you from» вместо «where are you from»: «you» вместо «are» (журнал 12:07:38)', () => {
    expect(run(WHERE, [{ kind: 'partial', text: 'where you from', raw: 'where you from' }], said(0)).shown).toBe('you')
  })
  it('ПЕРВОЕ слово фразы неверное, одно слово в черновике («meet» вместо «nice», журнал 12:07:25): красное через TAIL_STABLE_MS, не позже', () => {
    const w = createWrongWord({ words: NICE })
    w.ear({ kind: 'partial', text: 'meet', raw: 'meet' })
    expect(w.check(said(), 0)).toBe(null); expect(w.shown()).toBe(null) // слово ещё может перепеться
    w.check(said(), TAIL_STABLE_MS - 1); expect(w.shown()).toBe(null)
    w.check(said(), TAIL_STABLE_MS + 20); expect(w.shown()).toBe('meet')
  })
  it('первое слово неверное, итог захода: «cat» вместо «nice» — красное и рывок сразу', () => {
    const r = run(NICE, [{ kind: 'final', text: 'cat', raw: 'cat' }], said())
    expect(r.miss).toEqual({ word: 'cat', expect: 'Nice' }); expect(r.shown).toBe('cat')
  })
  it('речь без нового слова цели (итог пуст, голос был — слушатель дал kind: wrong): красное «[voice]» (журнал 12:07:42, 12:08:05)', () => {
    expect(run(WHERE, [{ kind: 'wrong', why: 'voice' }], said(0)).shown).toBe('[voice]')
  })
  it('неверное слово после настоящего слова захода — «[unk]» (слово вне словаря) красное', () => {
    expect(run(WHERE, [{ kind: 'final', text: 'where', raw: 'where [unk]' }], said(0)).shown).toBe('[unk]')
  })
})

describe('шум и пустое — красного нет (защита от шума цела)', () => {
  it('одинокий «[unk]» (черновик и итог из тишины / шума) красного не даёт', () => {
    for (const kind of ['partial', 'final']) {
      const r = run(NICE, [{ kind, text: '', raw: '[unk]' }], said())
      expect(r.miss).toBe(null); expect(r.shown).toBe(null)
    }
  })
  it('пустой итог и пустой черновик красного не дают', () => {
    const r = run(NICE, [{ kind: 'partial', text: '', raw: '' }, { kind: 'final', text: '', raw: '' }], said())
    expect(r.miss).toBe(null); expect(r.shown).toBe(null)
  })
  it('слово цели на своём месте и префикс ожидаемого — не красное', () => {
    expect(run(NICE, [{ kind: 'final', text: 'nice', raw: 'nice' }], said(0)).miss).toBe(null)
    const w = createWrongWord({ words: NICE }); w.ear({ kind: 'partial', text: 'ni', raw: 'ni' }); w.check(said(), 0); w.check(said(), 1000); expect(w.shown()).toBe(null)
  })
})
