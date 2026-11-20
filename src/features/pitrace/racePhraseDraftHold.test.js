import { describe, it, expect } from 'vitest'
import { createDraftHold, PEAK_MIN, DRAFT_KEEP_MS } from './racePhraseDraftHold.js'
import { rig, P, flush, end } from './racePhraseListenRig.js'

// Журнал владельца 18:41: (1) «первое слово зачлось сразу, хотя я ничего не говорил» — шум 0,003 прочитан как «where»; (2) третье слово переписало заход, и принятое «are» откатилось — линия отскочила назад.
describe('createDraftHold', () => {
  it('шум: уровни идут (≥3 куска), пик ниже PEAK_MIN — заход шумовой; речь 0,03 — нет; без уровней защита молчит', () => {
    const h = createDraftHold(); expect(h.noise()).toBe(false)
    for (const v of [0.0031, 0.0015, 0.002]) h.level(v); expect(h.noise()).toBe(true)
    h.level(0.03); expect(h.noise()).toBe(false); h.capture(); expect(h.noise()).toBe(false); expect(PEAK_MIN).toBe(0.008)
  })
  it('due: черновое слово старше DRAFT_KEEP_MS подтверждается, по порядку с первого неподтверждённого', () => {
    let t = 0; const h = createDraftHold({ now: () => t })
    const got = new Map([[0, true], [1, false], [2, false]])
    h.drafted('k', 1); t = 600; h.drafted('k', 2); expect(h.due('k', got)).toEqual([])
    t = DRAFT_KEEP_MS; expect(h.due('k', got)).toEqual([1]) // слово 3 ещё молодое — ждёт (подтверждаем только непрерывно)
    t = DRAFT_KEEP_MS + 700; expect(h.due('k', got)).toEqual([1, 2]); h.forget('k', 1); expect(h.due('k', got)).toEqual([])
  })
})

describe('слушатель прохода 1', () => {
  const level = (r, v) => r.cur().cb.onLevel?.(v)
  it('шум 0,003 не принимается за слово: черновик «where» при тишине в уровнях — слов нет', async () => {
    const r = rig([P.from], { wordByWord: true }); await flush()
    for (const v of [0.0006, 0.003, 0.002, 0.0025]) { r.cur().opts.onLevel?.(v); r.cur().cb.onLevel?.(v) }
    r.cur().cb.onPartial('where'); expect(r.words).toEqual([]); expect(r.logs.some(l => l.includes('проигнорировано'))).toBe(true)
    r.l.stop()
  })
  it('«are» принято черновиком, ученик помолчал 2 с, новый черновик «you» переписал заход — «are» НЕ откатывается, а подтверждается', async () => {
    const r = rig([P.from], { wordByWord: true }); await flush()
    r.cur().cb.onPartial('where'); await end(r, 'where', 300)
    r.cur().cb.onPartial('are'); expect(r.words.filter(w => w.index === 1).map(w => !!w.draft)).toEqual([true])
    r.advance(2000)
    r.cur().cb.onPartial('you')
    expect(r.words.some(w => w.index === 1 && w.gone)).toBe(false) // откатов нет
    expect(r.words.filter(w => w.index === 1).map(w => !!w.draft)).toEqual([true, false]) // «are» подтверждено
    expect(r.words.some(w => w.index === 2)).toBe(true) // «you» принято на своём месте
    r.l.stop()
  })
  it('быстрая перестройка (<1 с) откатывает как раньше', async () => {
    const r = rig([P.from], { wordByWord: true }); await flush()
    r.cur().cb.onPartial('where'); r.advance(200); r.cur().cb.onPartial('where are'); r.advance(200); r.cur().cb.onPartial('where')
    expect(r.words.some(w => w.index === 1 && w.gone)).toBe(true)
    r.l.stop()
  })
})
