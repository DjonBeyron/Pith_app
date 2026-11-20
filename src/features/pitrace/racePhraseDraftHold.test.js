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

describe('журнал 19:12: последнее слово, говорят другое — красное; «[unk]» перед словом — черновиком не принимаем', () => {
  const voice = (r, v) => { r.cur().opts.onLevel?.(v); r.cur().cb.onLevel?.(v) }
  async function toLast() {
    const r = rig([P.from], { wordByWord: true }); await flush()
    r.cur().cb.onPartial('where are you'); await end(r, 'where are you', 300) // слова 1–3 подтверждены итогом
    return r
  }
  it('осталось «from», сказано другое (итог «[unk]» при голосе 0,03): слушатель шлёт ear {kind: wrong}; тишина (пик 0,001) — нет', async () => {
    const r = await toLast()
    for (const v of [0.001, 0.03, 0.04, 0.03, 0.02]) voice(r, v) // фон, потом речь (v3.3.316: голос — относительно фона)
    r.cur().cb.onPartial('where'); await end(r, '[unk]', 300)
    expect(r.hears.some(h => h.kind === 'wrong')).toBe(true); expect(r.logs.some(l => l.includes('без нового слова цели'))).toBe(true)
    const q = await toLast(); for (const v of [0.001, 0.001, 0.001, 0.001]) voice(q, v)
    await end(q, '', 300); expect(q.hears.some(h => h.kind === 'wrong')).toBe(false)
    r.l.stop(); q.l.stop()
  })
  it('вид хода: ear {kind: wrong} — красное ожидаемое слово и рывок', async () => {
    const { createSayView } = await import('./racePhraseSayView.js'), { mountMask } = await import('./racePhraseMaskView.js')
    const mask = mountMask(null, 'Where are you from'), jerks = []
    const sv = createSayView({ pass: 1, text: 'Where are you from', n: 4, mask, nudge: on => on && jerks.push(1), el: null })
    const said = new Map([[0, true], [1, true], [2, true]]); sv.word(2, said, 0); mask.set(said)
    sv.ear({ kind: 'wrong', why: 'voice' }); sv.frame(1000, false, 0.64)
    expect(mask.words()[3].state).toBe('miss'); expect(jerks.length).toBe(1)
  })
  it('«[unk] from» после «where are you»: «from» черновиком не принимается, итогом — принимается', async () => {
    const r = await toLast()
    r.cur().cb.onPartial('[unk] from'); expect(r.words.some(w => w.index === 3)).toBe(false); expect(r.got).toEqual([])
    await end(r, '[unk] from', 300); expect(r.words.some(w => w.index === 3 && !w.draft)).toBe(true)
    r.l.stop()
  })
})
