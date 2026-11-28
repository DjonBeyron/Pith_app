import { describe, it, expect } from 'vitest'
import { rig, flush, P } from './racePhraseListenRig.js'
import { orHits } from './racePhraseOrHits.js'

// Журнал владельца 2026-11-27 13:33:26–13:33:30 (iPhone, v3.3.384, «Скажи», проход 2, «I'm trying to learn»): первый заход «trying to learn» (75 %, не засчитан — пилюля далеко от края),
// повтор «i», «i'm», «i'm trying», «i'm trying to learn». Было: слово «I'm» уходило в сцену только с полным повтором (старый текст «trying to learn» затенял новый), пилюля 0,07 → 1,0 разом.
const run = async () => {
  const r = rig([P.learn], { wordByWord: false, holdFirst: true, allowPartial: () => false }); await flush()
  r.cur().cb.onPartial('trying'); r.advance(486); r.cur().cb.onPartial('trying to learn'); r.advance(980)
  r.cur().cb.onResult('trying to learn', { words: [] }); r.advance(200); await flush(); r.advance(1200); await flush()
  return r
}
const alive = r => [...new Set(r.words.filter(w => !w.gone).map(w => w.index))].sort()

// Решение владельца 2026-11-28 отменило часть сценария 27.11: слова ПОСЛЕ пропущенного первого («trying to learn» без «I'm») не хранятся — после «i'm» засчитано только оно, «trying to learn» нужно сказать заново.
describe('проход 2: повтор после неполного захода', () => {
  it('первый заход без «I\'m» не засчитан, слов нет вовсе (слова после пропуска не хранятся)', async () => {
    const r = await run(); expect(r.got).toEqual([]); expect(alive(r)).toEqual([]); r.l.stop()
  })
  it('«i\'m» нового захода доходит до сцены сразу и один; «trying to learn» заново — зачёт целиком', async () => {
    const r = await run()
    r.cur().cb.onPartial('i'); r.advance(213); r.cur().cb.onPartial("i'm")
    expect(alive(r)).toEqual([0]); expect(r.got).toEqual([])
    r.cur().cb.onPartial("i'm trying"); expect(alive(r)).toEqual([0, 1]); expect(r.got).toEqual([])
    r.cur().cb.onPartial("i'm trying to learn"); expect(alive(r)).toEqual([0, 1, 2, 3]); expect(r.got.map(g => g.ratio)).toEqual([1])
    r.l.stop()
  })
  it('orHits: слово сказано, если сказано хоть в одном разборе; ratio пересчитан', () => {
    const a = [{ key: 'k', hits: [false, true, true, true], ok: 3, ratio: 0.75 }], b = [{ key: 'k', hits: [true, false, false, false], ok: 1, ratio: 0.25 }]
    expect(orHits(a, b)[0]).toEqual({ key: 'k', hits: [true, true, true, true], ok: 4, ratio: 1 }); expect(orHits(a, a)[0]).toBe(a[0]); expect(orHits(a, [])[0]).toBe(a[0])
  })
})
