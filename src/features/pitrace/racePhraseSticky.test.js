import { describe, it, expect } from 'vitest'
import { rig, flush, end } from './racePhraseListenRig.js'
import { createSticky } from './racePhraseSticky.js'
import { JOIN_MS } from './racePhraseListen.js'

// Проход 2 «Скажи» (быстро): слово, которое Vosk услышал в заходе и потом потерял в тексте, остаётся сказанным и для зачёта (v3.3.342, решение владельца 2026-11-22).
// Журнал владельца 22.11 17:12, «I'm trying to learn»: черновики «i'm» → «trying» → «trying to» → «trying to learn», итог «trying to learn» — пилюля залита на 97 %, а фраза «неполная (75 %)».
const LEARN = { key: 'learn', words: ["I'm", 'trying', 'to', 'learn'] }

describe('проход 2: пилюля залита — фраза засчитана', () => {
  it('журнал владельца: «i\'m» было в черновике, Vosk переписал заход без него — фраза засчитана целиком, а не «неполная 75 %»', async () => {
    const r = rig([LEARN]); await flush()
    r.cur().cb.onPartial("i'm"); r.cur().cb.onPartial('trying'); r.cur().cb.onPartial('trying to')
    expect(r.got).toEqual([])
    r.cur().cb.onPartial('trying to learn')
    expect(r.got.map(g => [g.phraseKey, g.ratio])).toEqual([['learn', 1]])
    expect([...new Set(r.words.map(w => w.index))].sort()).toEqual([0, 1, 2, 3])
    expect(r.logs.some(l => l.includes('остаётся сказанным (проход 2)'))).toBe(true)
    r.l.stop()
  })
  it('слово, которого Vosk не слышал вовсе, не засчитывается: «trying to learn» без «i\'m» — 3 из 4, полной фразы нет', async () => {
    const r = rig([LEARN], { allowPartial: () => false }); await flush()
    r.cur().cb.onPartial('trying'); r.cur().cb.onPartial('trying to learn'); await end(r, 'trying to learn', 10)
    expect(r.got).toEqual([]); expect(r.words.some(w => w.index === 0)).toBe(false)
    r.l.stop()
  })
  it('слово закрытого захода живёт столько же, сколько его текст (JOIN_MS): позже — уже не считается; новый ход (reset) забывает всё', async () => {
    const r = rig([LEARN], { allowPartial: () => false }); await flush()
    r.cur().cb.onPartial("i'm"); r.cur().cb.onPartial('trying'); await end(r, 'trying', 10) // «i'm» потеряно, заход закрыт
    r.advance(JOIN_MS + 500); await flush()
    r.cur().cb.onPartial('to learn'); expect(r.got).toEqual([])
    const q = rig([LEARN]); await flush()
    q.cur().cb.onPartial("i'm"); q.cur().cb.onPartial('trying'); q.l.reset(); await flush()
    q.cur().cb.onPartial('trying to learn'); expect(q.got).toEqual([])
    r.l.stop(); q.l.stop()
  })
  it('проход 1 «по слову» правило не трогает: потерянное слово там не «липкое»', async () => {
    const r = rig([LEARN], { wordByWord: true }); await flush()
    r.cur().cb.onPartial("i'm"); r.cur().cb.onPartial('trying to learn'); await end(r, 'trying to learn', 10)
    expect(r.got).toEqual([])
    r.l.stop()
  })
})

describe('createSticky', () => {
  it('merge добавляет только слова, отданные сцене; без них разбор не меняется (тот же объект)', () => {
    let t = 0
    const s = createSticky({ now: () => t, keepMs: 1000 }), sc = [{ key: 'k', hits: [false, true, true], ok: 2, ratio: 2 / 3 }]
    expect(s.merge(sc)[0]).toBe(sc[0])
    s.add('k', 0); expect(s.merge(sc)[0]).toMatchObject({ hits: [true, true, true], ok: 3, ratio: 1 })
    s.close(); t = 900; expect(s.merge(sc)[0].ratio).toBe(1)
    t = 1100; expect(s.merge(sc)[0]).toBe(sc[0])
    s.add('k', 0); s.clear(); expect(s.merge(sc)[0]).toBe(sc[0])
  })
})
