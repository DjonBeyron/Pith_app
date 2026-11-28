import { describe, it, expect } from 'vitest'
import { saidThrough, lastOnly, halfWay, SETTLE_MS, SETTLE_LAST_MS, GATE_CLOSE_FINAL_MS, TAIL_VOICE_MS, QUIET_LAST_MS } from './racePhraseListen.js'
import { scorePhrases } from './racePhraseScore.js'
import { rig, P, flush, end } from './racePhraseListenRig.js'

// ОТМЕНЕНО 2026-11-28 (владелец: «не логично хранить сказанные после неверного слова верные слова»): «договорена» (последнее слово есть, середины нет) в слушателе больше не бывает — слова после
// пропуска не хранятся, «where you from» это только «where»; saidThrough / halfWay остаются чистыми функциями (их юнит-проверки ниже), а сценарии слушателя — «пропущенное среднее не засчитывается, ждёт исправления».
// «Фраза договорена» (racePhraseListen.js, 2026-11-09): последнее слово лучшего кандидата услышано, не хватает середины — зачёт без SETTLE_MS.
// Журнал владельца: «where you from» (пропущено «are») — пилюля полная, а взлёт через 1,2 с после итога.
const ok = (key, ratio, heard) => [{ phraseKey: key, ratio, heard }]

describe('фраза договорена', () => {
  it('saidThrough: однозначный лучший с последним словом и неполный; без последнего слова, полный, ничья — null', () => {
    expect(saidThrough(scorePhrases([P.meet, P.from], 'where you from'))).toBe('where are you from')
    expect(saidThrough(scorePhrases([P.meet, P.from], 'where are you'))).toBe(null) // это lastOnly
    expect(lastOnly(scorePhrases([P.meet, P.from], 'where you from'))).toBe(null)
    expect(saidThrough(scorePhrases([P.meet, P.from], 'where are you from'))).toBe(null) // полное — решает черновик сразу
    expect(saidThrough(scorePhrases([P.meet, P.see], 'nice to you'))).toBe(null) // общее начало — не однозначно
    expect(saidThrough(scorePhrases([P.meet, P.from], 'where from'))).toBe(null) // 0,5 — мало
  })
  it('итог захода с пропущенным средним словом — НЕ зачёт: «where you from» — только «where», ждёт «are»', async () => {
    const r = rig([P.meet, P.from]); await flush()
    r.cur().cb.onPartial('where you'); r.advance(500)
    r.cur().cb.onResult('where you from', { words: [] }); r.advance(3000)
    expect(r.got).toEqual([]); expect(r.logs.some(s => /договорена/.test(s))).toBe(false)
    r.l.stop()
  })
  it('журнал владельца: черновик «where you from» (пропущено «are») — не зачёт ни по черновику, ни позже; нужно сказать «are», потом «you from» заново', async () => {
    const r = rig([P.meet, P.from]); await flush()
    r.cur().cb.onLevel(0.05); r.cur().cb.onPartial('where'); r.advance(500); r.cur().cb.onLevel(0.05); r.cur().cb.onPartial('where you')
    r.advance(200); r.cur().cb.onLevel(0.05); r.cur().cb.onPartial('where you from')
    r.advance(SETTLE_LAST_MS + 3000); expect(r.got).toEqual([])
    r.cur().cb.onPartial('where you from are'); r.advance(3000); expect(r.got).toEqual([]) // «are» — только оно
    r.cur().cb.onPartial('where you from are you from'); expect(r.got).toEqual(ok('where are you from', 1, 'where you from are you from'))
    r.l.stop()
  })
  it('затвор закрылся при «where you from» (пропуск) — итог по затвору не просим (последнего слова в цепочке нет), зачёта нет', async () => {
    const r = rig([P.meet, P.from]); await flush()
    r.cur().cb.onLevel(0.05); r.cur().cb.onPartial('where you from'); r.advance(100); r.cur().opts.onGate(false, 0.001)
    r.advance(GATE_CLOSE_FINAL_MS + 100); expect(r.cur().stopped).toBe(0); expect(r.got).toEqual([])
    r.l.stop()
  })
  it('«where you from» — ждать нечего, но и зачёта нет; черновик достроился до полного — зачёт чисто сразу', async () => {
    const r = rig([P.meet, P.from]); await flush()
    r.cur().cb.onPartial('where you from'); r.advance(300); r.cur().cb.onLevel(0.05) // ученик ещё говорит
    r.advance(3000); expect(r.got).toEqual([])
    const q = rig([P.meet, P.from]); await flush()
    q.cur().cb.onPartial('where you from'); q.advance(200); q.cur().cb.onPartial('where are you from')
    expect(q.got).toEqual(ok('where are you from', 1, 'where are you from'))
    q.advance(SETTLE_LAST_MS); expect(q.got).toHaveLength(1)
    r.l.stop(); q.l.stop()
  })
  it('два захода «i\'m trying» + «learn» (пропущено «to»): слово после пропуска не хранится — не зачёт', async () => {
    const r = rig([P.learn, P.meet]); await flush()
    await end(r, "i'm trying", 0); expect(r.got).toEqual([]) // первый заход: последнего слова нет
    r.cur().cb.onPartial('learn') // второй: «learn» — последнее слово, «to» пропущено
    r.advance(SETTLE_MS + 3000); expect(r.got).toEqual([])
    expect(SETTLE_MS).toBeGreaterThan(SETTLE_LAST_MS)
    r.l.stop()
  })
  it('итог «i\'m trying learn» в одном заходе (пропущено «to») — не зачёт', async () => {
    const r = rig([P.learn, P.meet]); await flush()
    r.cur().cb.onPartial("i'm trying learn"); expect(r.got).toEqual([])
    await end(r, "i'm trying learn", SETTLE_MS + 3000)
    expect(r.got).toEqual([])
    r.l.stop()
  })
})

// «Середины нет» (2026-11-09, реальный Vosk): «where … you from», «from» только итогом — в черновике «where are»; итог по затвору просим и здесь (голос после черновика ≥ TAIL_VOICE_MS).
describe('середины нет: итог по затвору', () => {
  const voice = (r, ms) => { for (let i = 0; i < ms; i += 40) { r.cur().cb.onLevel(0.05); r.advance(40) } }
  it('halfWay: однозначный лучший, ≥ 2 слов цели, последнего нет; общее начало, одно слово, последнее есть — null', () => {
    expect(halfWay(scorePhrases([P.meet, P.from], 'where are'))).toBe('where are you from')
    expect(halfWay(scorePhrases([P.meet, P.from], 'nice to'))).toBe('nice to meet you')
    expect(halfWay(scorePhrases([P.meet, P.see], 'nice to'))).toBe(null) // общее начало
    expect(halfWay(scorePhrases([P.meet, P.from], 'where'))).toBe(null) // одно слово из четырёх
    expect(halfWay(scorePhrases([P.meet, P.from], 'where are you from'))).toBe(null) // это saidThrough
  })
  it('черновик «where are», голос после него, затвор закрылся — итог через 150 мс, журнал «(середины нет)»; итог «where are you from» — зачёт сразу', async () => {
    const r = rig([P.meet, P.from]); await flush()
    voice(r, 300); r.cur().cb.onPartial('where'); voice(r, 300); r.cur().cb.onPartial('where are')
    voice(r, 280); r.advance(200); r.cur().opts.onGate(false, 0.001) // «from» звучит, в черновике его нет
    r.advance(GATE_CLOSE_FINAL_MS - 10); expect(r.cur().stopped).toBe(0)
    r.advance(10); expect(r.cur().stopped).toBe(1)
    expect(r.logs.find(x => x.includes('итог запрошен'))).toMatch(/^\[phrase-ear\] итог запрошен: затвор закрыт \+150 мс, черновик «where are», голос после черновика \d+ мс \(середины нет\) \+\d+ мс$/)
    r.cur().cb.onResult('where are you from', { words: [] })
    expect(r.got).toEqual(ok('where are you from', 1, 'where are you from'))
    r.l.stop()
  })
  it('обычная пауза между словами (черновик пришёл после голоса) — итог не просим, заход не рвётся', async () => {
    expect(TAIL_VOICE_MS).toBe(80)
    const r = rig([P.meet, P.from]); await flush()
    voice(r, 600); r.advance(150); r.cur().cb.onPartial('where are'); r.advance(150); r.cur().opts.onGate(false, 0.001)
    r.advance(GATE_CLOSE_FINAL_MS + 100); expect(r.cur().stopped).toBe(0)
    const q = rig([P.meet, P.see]); await flush() // общее начало «nice to» — тоже нет
    voice(q, 300); q.cur().cb.onPartial('nice to'); voice(q, 300); q.advance(200); q.cur().opts.onGate(false, 0.001)
    q.advance(GATE_CLOSE_FINAL_MS + 100); expect(q.cur().stopped).toBe(0)
    r.l.stop(); q.l.stop()
  })
  it('итог ничего не добавил — ждём дальше: «you from» следующим заходом в JOIN_MS — фраза собрана', async () => {
    const r = rig([P.meet, P.from]); await flush()
    voice(r, 300); r.cur().cb.onPartial('where are'); voice(r, 280); r.advance(200); r.cur().opts.onGate(false, 0.001)
    r.advance(GATE_CLOSE_FINAL_MS); expect(r.cur().stopped).toBe(1)
    await end(r, 'where are', SETTLE_MS + 100); expect(r.got).toEqual([]) // 0,5 — мало для зачёта
    r.cur().cb.onPartial('you from'); r.advance(SETTLE_LAST_MS)
    expect(r.got).toEqual(ok('where are you from', 1, 'where are you from'))
    r.l.stop()
  })
  it('слитно: черновик «where are» после голоса, тишина QUIET_LAST_MS — итог захода (как без последнего слова); общее начало — нет', async () => {
    const r = rig([P.meet, P.from]); await flush()
    voice(r, 600); r.cur().cb.onPartial('where are'); r.advance(300); r.cur().opts.onGate(false, 0.001)
    r.advance(QUIET_LAST_MS - 350); expect(r.cur().stopped).toBe(0)
    r.advance(100); expect(r.cur().stopped).toBe(1)
    expect(r.logs.some(s => /^\[phrase-ear\] черновик «where are» без последнего слова, тишина \d+ мс \(порог 1100\) — прошу итог захода/.test(s))).toBe(true)
    r.cur().cb.onResult('where are you from', { words: [] })
    expect(r.got).toEqual(ok('where are you from', 1, 'where are you from'))
    const q = rig([P.meet, P.see]); await flush()
    voice(q, 600); q.cur().cb.onPartial('nice to'); q.advance(3000); expect(q.cur().stopped).toBe(0)
    r.l.stop(); q.l.stop()
  })
})

// v3.3.284 (владелец: «если говорю быстро, он сразу засчитывает, даже если между было неверное слово; так можно, только когда осталось 30 % пути»)
describe('неполная фраза засчитывается только в конце пути пилюли', () => {
  it('пилюля далеко (allowPartial = false): «where are you» (75 %, нет последнего слова) не засчитывается, журнал «жду исправления»; у края — засчитывается; полная фраза — сразу, при любой высоте', async () => {
    let near = false
    const r = rig([P.meet, P.from], { allowPartial: () => near }); await flush()
    r.cur().cb.onResult('where are you', { words: [] }); r.advance(2000)
    expect(r.got).toEqual([]); expect(r.logs.some(s => /неполная \(75 %\).*жду исправления/.test(s))).toBe(true)
    r.l.stop()
    near = true; const r3 = rig([P.meet, P.from], { allowPartial: () => near }); await flush() // у края — как раньше
    r3.cur().cb.onResult('where are you', { words: [] }); r3.advance(2000); expect(r3.got).toEqual(ok('where are you from', 0.75, 'where are you')); r3.l.stop()
    const r2 = rig([P.meet, P.from], { allowPartial: () => false }); await flush()
    r2.cur().cb.onResult('where are you from', { words: [] }); r2.advance(300); expect(r2.got).toEqual(ok('where are you from', 1, 'where are you from')); r2.l.stop()
  })
})
