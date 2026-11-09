import { describe, it, expect } from 'vitest'
import { quietLimit, gateReason, QUIET_MAX_MS, QUIET_MAX_WBW_MS, QUIET_LAST_MS, VOSK_QUIET_MS, GATE_CLOSE_FINAL_MS } from './racePhraseEarlyFinal.js'
import { scorePhrases } from './racePhraseScore.js'
import { rig, P, flush, end } from './racePhraseListenRig.js'
import { SETTLE_WBW_MS, JOIN_MS, JOIN_WBW_MS } from './racePhraseListen.js'

// Ранние итоги захода в проходе 1 «по слову», пустой черновик и «Vosk молчит» (racePhraseEarlyFinal.js, журнал владельца v3.3.174, iPhone).
const asked = r => r.logs.filter(s => /прошу итог захода|итог запрошен/.test(s))
const voice = r => r.cur().cb.onLevel(0.05)

/** Ход 1/6 владельца: «nice» … «to» (пауза 2,4 с) … «meet» … «you», затвор закрывается после каждого слова */
async function slow(r) {
  voice(r); r.cur().cb.onPartial('nice'); r.advance(300); r.cur().opts.onGate(false, 0.001)
  r.advance(2100); r.cur().opts.onGate(true, 0.05); voice(r); r.advance(300); r.cur().cb.onPartial('nice to'); r.advance(10); r.cur().opts.onGate(false, 0.001)
  r.advance(1600) // в журнале здесь «тишина 1504 мс (порог 1500) — прошу итог»
}

describe('проход 1 «по слову»: паузы между словами — не конец фразы', () => {
  it('quietLimit: проход 2 — потолок 1,5 с, проход 1 — 3,5 с (паузы 2,8 с × 1,5 не обрезаются)', () => {
    expect(quietLimit(0)).toBe(QUIET_LAST_MS); expect(quietLimit(2800)).toBe(QUIET_MAX_MS)
    expect(quietLimit(2000, true)).toBe(3000); expect(quietLimit(2800, true)).toBe(QUIET_MAX_WBW_MS); expect(QUIET_MAX_WBW_MS).toBe(3500)
  })
  it('gateReason: пустой черновик — никогда; проход 1 — без «середины нет», lastOnly и «последнее слово есть» остаются', () => {
    const half = scorePhrases([P.meet, P.from], 'nice to'), last = scorePhrases([P.meet, P.from], 'nice to meet'), ends = scorePhrases([P.meet, P.from], 'where you from')
    expect(gateReason({ scores: half, current: 'nice to', curHit: true, tail: 200 })).toBe('half')
    expect(gateReason({ scores: half, current: 'nice to', curHit: true, tail: 200, wordByWord: true })).toBe(null)
    expect(gateReason({ scores: half, current: '', curHit: false, tail: 254 })).toBe(null) // журнал: «итог запрошен … черновик «»»
    expect(gateReason({ scores: last, current: 'nice to meet', curHit: true, tail: 200, wordByWord: true })).toBe('last')
    expect(gateReason({ scores: last, current: 'nice to meet', curHit: true, tail: 20, wordByWord: true })).toBe(null)
    expect(gateReason({ scores: ends, current: 'you from', curHit: true, tail: 0, wordByWord: true })).toBe('ends')
  })
  it('журнал владельца: «nice to», тишина 1,6 с после паузы 2,4 с — в проходе 1 итог НЕ просим; «meet», «you» — зачёт чисто в том же заходе', async () => {
    const r = rig([P.meet, P.from], { wordByWord: true }); await flush()
    await slow(r)
    expect(asked(r)).toEqual([]); expect(r.cur().stopped).toBe(0); expect(r.sessions).toHaveLength(1)
    r.cur().opts.onGate(true, 0.05); voice(r); r.advance(300); r.cur().cb.onPartial('nice to meet'); r.advance(10); r.cur().opts.onGate(false, 0.001)
    r.advance(2500); expect(r.cur().stopped).toBe(0) // lastOnly ждёт тишину до 3,5 с: пауза 2,5 с — ещё не «договорил»
    r.cur().opts.onGate(true, 0.05); voice(r); r.advance(300); r.cur().cb.onPartial('nice to meet you')
    expect(r.got).toEqual([{ phraseKey: 'nice to meet you', ratio: 1, heard: 'nice to meet you' }])
    r.l.stop()
  })
  it('проход 2 (подряд): то же «nice to» и тишина 1,5 с — итог просим, как в v3.3.173', async () => {
    const r = rig([P.meet, P.from]); await flush()
    await slow(r)
    expect(asked(r).some(s => /черновик «nice to» без последнего слова, тишина \d+ мс \(порог 1500\) — прошу итог захода/.test(s))).toBe(true)
    expect(r.cur().stopped).toBe(1)
    r.l.stop()
  })
  it('проход 1, не хватает только последнего слова: тишина дольше паузы попытки × 1,5 (до 3,5 с) — итог просим', async () => {
    const r = rig([P.meet, P.from], { wordByWord: true }); await flush()
    voice(r); r.cur().cb.onPartial('nice to'); r.advance(2000); voice(r); r.advance(300); r.cur().cb.onPartial('nice to meet')
    r.advance(2600); expect(r.cur().stopped).toBe(0) // тишина от последнего голоса — 2,9 с
    r.advance(200); expect(r.cur().stopped).toBe(1) // пауза попытки 2 с × 1,5 = 3 с
    expect(asked(r).at(-1)).toMatch(/черновик «nice to meet» без последнего слова, тишина 3\d{3} мс \(порог 3000\)/)
    r.l.stop()
  })
  it('setPhrases(next, { wordByWord }) переключает проход; без opts — прежний', async () => {
    const r = rig([P.meet, P.from]); await flush()
    r.l.setPhrases([P.meet, P.from], { wordByWord: true }); await flush()
    await slow(r); expect(asked(r)).toEqual([])
    r.l.setPhrases([P.from, P.meet]); await flush()
    await slow(r); expect(asked(r)).toEqual([]) // без opts — проход прежний
    r.l.setPhrases([P.meet, P.from], { wordByWord: false }); await flush()
    await slow(r); expect(asked(r)).toHaveLength(1)
    r.l.stop()
  })
})

describe('проход 1: неполное совпадение ждёт подсказанное слово', () => {
  it('замер реальным Vosk: итог «nice to meet» (итог по затвору) — не «нечисто» через 0,4 с, а ждём SETTLE_WBW_MS без голоса; «you» в новом заходе — чисто', async () => {
    const r = rig([P.meet, P.from], { wordByWord: true }); await flush()
    voice(r); r.cur().cb.onPartial('nice to meet'); await end(r, 'nice to meet', 10)
    r.advance(SETTLE_WBW_MS - 100); expect(r.got).toEqual([])
    voice(r); r.advance(SETTLE_WBW_MS - 100); expect(r.got).toEqual([]) // голос отодвигает
    r.cur().cb.onPartial('you'); expect(r.got).toEqual([{ phraseKey: 'nice to meet you', ratio: 1, heard: 'nice to meet you' }])
    const q = rig([P.meet, P.from], { wordByWord: true }); await flush()
    await end(q, 'nice to meet', 10); q.advance(SETTLE_WBW_MS); expect(q.got).toEqual([{ phraseKey: 'nice to meet you', ratio: 0.75, heard: 'nice to meet' }]) // так и не сказал — нечисто
    r.l.stop(); q.l.stop()
  })
  it('договорена («where you from») итогом — в проходе 1 не сразу: пропущенное «are» ученик скажет по подсказке и дальше по порядку', async () => {
    const r = rig([P.meet, P.from], { wordByWord: true }); await flush()
    r.cur().cb.onPartial('where you'); r.cur().cb.onResult('where you from', { words: [] }); r.advance(SETTLE_WBW_MS - 100); await flush()
    expect(r.got).toEqual([])
    r.cur().cb.onPartial('are'); expect(r.got).toEqual([]) // «where you from are» — по порядку только 3 из 4 (2026-11-09: слова не по порядку не засчитываются)
    r.cur().cb.onPartial('are you from'); expect(r.got).toEqual([{ phraseKey: 'where are you from', ratio: 1, heard: 'where you from are you from' }])
    r.l.stop()
  })
  it('накопление между заходами — JOIN_WBW_MS (4 слова с паузами 2,5 с — 9 с), в проходе 2 — JOIN_MS', async () => {
    expect(JOIN_WBW_MS).toBeGreaterThan(JOIN_MS)
    const r = rig([P.meet, P.from], { wordByWord: true }); await flush()
    await end(r, 'where', 10); r.advance(JOIN_MS + 1000); await flush()
    r.cur().cb.onPartial('are you from'); expect(r.got).toEqual([{ phraseKey: 'where are you from', ratio: 1, heard: 'where are you from' }])
    r.l.stop()
  })
})

describe('журнал итога: кто закрыл заход', () => {
  it('«итог «where» (движок сам)» — эндпойнтер Vosk; наш ear.stop — «(кнопка «Стоп»)»; без статистики — как раньше', async () => {
    const r = rig([P.meet, P.from], { wordByWord: true }); await flush()
    for (const stopBy of ['endpoint', 'manual', undefined]) { r.cur().cb.onResult('where', { words: [], stopBy }); r.advance(10); await flush() }
    expect(r.logs.filter(s => s.startsWith('[phrase-ear] итог «where»'))).toEqual([expect.stringMatching(/«where» \(движок сам\) \+\d+ мс$/), expect.stringMatching(/«where» \(кнопка «Стоп»\) \+\d+ мс$/), expect.stringMatching(/«where» \+\d+ мс$/)])
    r.l.stop()
  })
})

describe('пустой черновик: итог захода не просим', () => {
  it('новый заход после «nice to» (прошлые заходы дают «середины нет»), голос, затвор закрылся — черновик пуст, заход не рвём (оба прохода)', async () => {
    for (const wordByWord of [false, true]) {
      const r = rig([P.meet, P.from], { wordByWord }); await flush()
      voice(r); r.cur().cb.onPartial('nice to'); r.advance(100)
      await end(r, 'nice to', 10); expect(r.sessions).toHaveLength(2)
      voice(r); r.advance(250); voice(r); r.cur().opts.onGate(false, 0.001)
      r.advance(GATE_CLOSE_FINAL_MS + 2000)
      expect(r.cur().stopped).toBe(0); expect(r.logs.some(s => /итог запрошен: .*черновик «»/.test(s))).toBe(false)
      r.l.stop()
    }
  })
})

describe('«Vosk молчит»: затвор закрыт, событий Vosk нет', () => {
  it("журнал владельца «I'm trying to learn»: «i'm», «i», затвор закрыт — через 1,5 с строка в журнал и итог захода (в черновике нет слов цели)", async () => {
    const r = rig([P.learn, P.meet], { wordByWord: true }); await flush()
    voice(r); r.cur().cb.onPartial("i'm"); r.advance(260); r.cur().cb.onPartial('i'); r.advance(300); r.cur().opts.onGate(false, 0.001)
    r.advance(VOSK_QUIET_MS - 1); expect(r.cur().stopped).toBe(0)
    r.advance(1); expect(r.cur().stopped).toBe(1)
    expect(r.logs.find(s => s.includes('Vosk молчит'))).toMatch(/^\[phrase-ear\] Vosk молчит 2\d{3} мс после голоса \(черновик «i»\) — в черновике нет слов цели, прошу итог захода \+\d+ мс$/)
    r.l.stop()
  })
  it('черновик со словом цели (проход 1, ждёт подсказку) — только строка в журнал, заход не рвём; голос или событие Vosk — отсчёт заново', async () => {
    const r = rig([P.meet, P.from], { wordByWord: true }); await flush()
    voice(r); r.cur().cb.onPartial('nice'); r.advance(300); r.cur().opts.onGate(false, 0.001)
    r.advance(1000); r.cur().cb.onPartial('nice'); r.advance(VOSK_QUIET_MS - 100); expect(r.logs.some(s => s.includes('Vosk молчит'))).toBe(false)
    r.advance(100); expect(r.logs.filter(s => s.includes('Vosk молчит'))).toEqual([expect.stringMatching(/^\[phrase-ear\] Vosk молчит \d+ мс после голоса \(черновик «nice»\) \+\d+ мс$/)])
    expect(r.cur().stopped).toBe(0)
    const q = rig([P.learn, P.meet]); await flush()
    voice(q); q.cur().cb.onPartial('i'); q.advance(300); q.cur().opts.onGate(false, 0.001); q.advance(800); q.cur().opts.onGate(true, 0.05); voice(q)
    q.advance(VOSK_QUIET_MS); expect(q.cur().stopped).toBe(0) // затвор открылся — голос идёт, молчания нет
    r.l.stop(); q.l.stop()
  })
})
