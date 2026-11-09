import { describe, it, expect } from 'vitest'
import { lastOnly, PHRASE_OK, SETTLE_MS, SETTLE_LAST_MS, QUIET_LAST_MS, QUIET_PAUSE_K, QUIET_MAX_MS, LAST_HOLD_MS, JOIN_MS, GATE_CLOSE_FINAL_MS, TAIL_VOICE_MS } from './racePhraseListen.js'
import { scorePhrases } from './racePhraseScore.js'
import { rig, P, flush, end } from './racePhraseListenRig.js'

describe('createPhraseListener', () => {
  it('порог 0.75; словарь — слова всех кандидатов без повторов', async () => {
    expect(PHRASE_OK).toBe(0.75)
    const r = rig([P.meet, P.see]); await flush()
    const g = JSON.parse(r.cur().grammar)
    expect(g).toContain('nice'); expect(g).toContain('see'); expect(g).toContain('meet')
    expect(g.filter(x => x === 'nice')).toHaveLength(1)
    r.l.stop()
  })
  it('три кандидата с общими словами + путаница: полная фраза засчитана сразу по черновику, слова по порядку', async () => {
    const r = rig([P.meet, P.from, P.learn, P.see]); await flush()
    r.cur().cb.onPartial('nice to')
    expect(r.got).toEqual([])
    r.cur().cb.onPartial('nice to meet you')
    expect(r.got).toEqual([{ phraseKey: 'nice to meet you', ratio: 1, heard: 'nice to meet you' }])
    const meet = r.words.filter(w => w.phraseKey === 'nice to meet you').map(w => w.index)
    expect(meet).toEqual([0, 1, 2, 3])
    expect(r.words.filter(w => w.phraseKey === 'nice to see you').map(w => w.index)).toEqual([0, 1, 3])
    expect(r.logs.at(-1)).toMatch(/\[phrase-ear\] кандидаты .* услышал «nice to meet you» · лучший «nice to meet you» ratio 1\.00/)
    expect(r.cur().stopped + r.cur().cancelled).toBeGreaterThan(0) // заход закрыт…
    r.advance(10); await flush()
    expect(r.sessions).toHaveLength(2) // …и слушаем заново
    r.l.stop()
  })
  it('слова черновика — draft: true, итог захода подтверждает их ещё раз (draft: false); непустой черновик — onEar (полоска отладки), не заливка', async () => {
    const r = rig([P.from, P.learn]); await flush()
    r.cur().cb.onPartial('[unk]'); expect(r.hears).toHaveLength(0) // «…» без слов — не речь
    r.cur().cb.onPartial('where are')
    expect(r.hears).toEqual([{ kind: 'partial', text: 'where are' }])
    expect(r.words.filter(w => w.phraseKey === 'where are you from')).toEqual([{ phraseKey: 'where are you from', index: 0, text: 'where', draft: true }, { phraseKey: 'where are you from', index: 1, text: 'are', draft: true }])
    await end(r, 'where are')
    expect(r.words.filter(w => w.phraseKey === 'where are you from' && !w.draft).map(w => w.index)).toEqual([0, 1])
    r.l.stop()
  })
  it('общее начало «nice to … you» без различающего слова — не засчитывается', async () => {
    const r = rig([P.meet, P.see]); await flush()
    await end(r, 'nice to you'); r.advance(SETTLE_MS)
    expect(r.got).toEqual([])
    expect(r.logs.some(s => s.includes('без совпадения'))).toBe(true)
    r.l.stop()
  })
  it('фраза в два захода собирается; слово не теряется на стыке', async () => {
    const r = rig([P.from, P.learn]); await flush()
    r.cur().cb.onPartial('where are')
    await end(r, 'where are')
    expect(r.sessions).toHaveLength(2)
    r.cur().cb.onPartial('you from')
    expect(r.got).toEqual([{ phraseKey: 'where are you from', ratio: 1, heard: 'where are you from' }])
    r.l.stop()
  })
  it('за пределами JOIN_MS прошлый заход забыт', async () => {
    const r = rig([P.from, P.learn]); await flush()
    await end(r, 'where are'); r.advance(JOIN_MS + 100); await flush()
    r.cur().cb.onPartial('you from'); await end(r, 'you from'); r.advance(SETTLE_MS)
    expect(r.got).toEqual([])
    r.l.stop()
  })
  it('lastOnly: однозначный кандидат без одного ПОСЛЕДНЕГО слова', () => {
    expect(lastOnly(scorePhrases([P.meet, P.from], 'nice to meet'))).toBe('nice to meet you')
    expect(lastOnly(scorePhrases([P.meet, P.from], 'nice to you'))).toBe(null)
    expect(lastOnly(scorePhrases([P.meet, P.see], 'nice to'))).toBe(null)
  })
  it('черновик без последнего слова и тишина: итог захода спрошен через QUIET_LAST_MS, итог с последним словом — зачёт чисто сразу', async () => {
    const r = rig([P.meet, P.from]); await flush()
    r.cur().cb.onLevel(0.05); r.cur().cb.onPartial('nice to meet')
    r.advance(LAST_HOLD_MS); expect(r.cur().stopped).toBe(0)
    r.cur().cb.onLevel(0.05); r.advance(QUIET_LAST_MS - 50); expect(r.cur().stopped).toBe(0) // звук ещё идёт — ждём
    r.advance(60); r.advance(0); expect(r.cur().stopped).toBe(1)
    expect(r.logs.some(s => s.includes('без последнего слова'))).toBe(true)
    r.cur().cb.onResult('nice to meet you', { words: [] })
    expect(r.got).toEqual([{ phraseKey: 'nice to meet you', ratio: 1, heard: 'nice to meet you' }])
    r.l.stop()
  })
  it('без последнего слова и в итоге: зачёт 0.75 через SETTLE_LAST_MS; голос в паузе отодвигает решение', async () => {
    const r = rig([P.meet, P.from]); await flush()
    r.cur().cb.onPartial('nice to meet'); r.advance(QUIET_LAST_MS); await end(r, 'nice to meet', 0)
    r.advance(SETTLE_LAST_MS - 100); await flush(); r.cur().cb.onLevel(0.05) // звук в новом заходе
    r.advance(200); expect(r.got).toEqual([])
    r.advance(SETTLE_LAST_MS); expect(r.got).toEqual([{ phraseKey: 'nice to meet you', ratio: 0.75, heard: 'nice to meet' }])
    expect(r.logs.some(s => /\[phrase-ear\] черновик «nice to meet» \+0 мс/.test(s))).toBe(true)
    r.l.stop()
  })
  it('один кандидат: 3 из 4, затем договорил в паузе — засчитано чисто', async () => {
    const r = rig([P.meet]); await flush()
    await end(r, 'nice to meet')
    r.cur().cb.onPartial('you')
    expect(r.got).toEqual([{ phraseKey: 'nice to meet you', ratio: 1, heard: 'nice to meet you' }])
    r.l.stop()
  })
  it('повторяющееся слово во фразе считается дважды', async () => {
    const r = rig([{ key: 'you and you', words: ['you', 'and', 'you'] }]); await flush()
    r.cur().cb.onPartial('you and')
    expect(r.words.map(w => w.index)).toEqual([0, 1])
    r.cur().cb.onPartial('you and you')
    expect(r.words.map(w => w.index)).toEqual([0, 1, 2])
    expect(r.got).toHaveLength(1)
    r.l.stop()
  })
  it('пока говорит Пит (isHeld) — не слушает', async () => {
    let held = true
    const r = rig([P.meet], { held: () => held }); await flush()
    r.cur().cb.onPartial('nice to meet you')
    expect(r.got).toEqual([]); expect(r.words).toEqual([])
    held = false
    r.cur().cb.onPartial('nice to meet you too')
    expect(r.got).toHaveLength(1)
    r.l.stop()
  })
  it('setPhrases пересобирает словарь и забывает услышанное; reset — слушает заново', async () => {
    const r = rig([P.meet]); await flush()
    r.cur().cb.onPartial('nice to')
    r.l.setPhrases([P.from]); await flush()
    expect(JSON.parse(r.cur().grammar)).toContain('where')
    r.cur().cb.onPartial('where are you from')
    expect(r.got.map(g => g.phraseKey)).toEqual(['where are you from'])
    await flush(); const n = r.sessions.length
    r.l.reset(); await flush()
    expect(r.sessions.length).toBe(n + 1)
    r.l.stop()
  })
  it('нет модели — onError("unavailable")', async () => {
    const r = rig([P.meet], { noModel: true }); await flush()
    expect(r.errors).toEqual(['unavailable'])
    r.l.stop()
  })
  it('reset() нового хода забывает и прошлые заходы в окне JOIN_MS: фраза Пита, прочитанная между ходами (окно речи не держало), в новый ход не попадает', async () => {
    const r = rig([P.meet, P.from]); await flush()
    await end(r, 'nice to meet') // «Пит читает фразу» после итога хода: заход закрылся, услышанное ушло в past (JOIN_MS)
    r.l.reset(); await flush() // сцена: новый ход (startTurn → setPhrases + reset)
    r.cur().cb.onPartial('you'); await end(r, 'you'); r.advance(SETTLE_MS + SETTLE_LAST_MS)
    expect(r.got).toEqual([]) // без reset «nice to meet» + «you» собрались бы в зачёт
    r.l.stop()
  })
  it('журнал слуха: каждый итог (и с тем же текстом), «partial без изменений» не чаще SAME_LOG_MS, затвор тишины [gate] открыт / закрыт → onEar', async () => {
    const r = rig([P.meet, P.from]); await flush()
    expect(r.cur().opts.onGate).toBeTypeOf('function') // слушатель фраз просит у движка события затвора
    r.advance(100); r.cur().opts.onGate(true, 0.04)
    expect(r.logs.at(-1)).toBe('[gate] открыт +100 мс (rms 0,040)'); expect(r.hears.at(-1)).toEqual({ kind: 'gate', open: true, rms: 0.04 })
    r.cur().cb.onPartial('nice to')
    for (let i = 0; i < 10; i++) { r.advance(100); r.cur().cb.onPartial('nice to') } // Vosk шлёт тот же черновик ≈ 20 раз в секунду
    expect(r.logs.filter(x => x.startsWith('[phrase-ear] partial без изменений «nice to»')).length).toBe(2)
    r.cur().opts.onGate(false, 0.001); expect(r.logs.at(-1)).toMatch(/^\[gate\] закрыт \+\d+ мс \(rms 0,001\)$/)
    r.cur().cb.onResult('nice to', { words: [] })
    expect(r.logs.some(x => /^\[phrase-ear\] итог «nice to» \+\d+ мс$/.test(x))).toBe(true)
    r.l.stop()
  })
  it('пауза перед последним словом не обрывает заход: тишина ≥ 1100 мс и ≥ 1,5 × самой длинной паузы между словами попытки (медленный ученик — дольше)', async () => {
    expect(QUIET_LAST_MS).toBe(1100); expect(QUIET_PAUSE_K).toBe(1.5)
    const r = rig([P.meet, P.from]); await flush()
    r.cur().cb.onLevel(0.05); r.cur().cb.onPartial('nice') // «nice» … пауза 900 мс … «to» … «meet»
    r.advance(900); r.cur().cb.onLevel(0.05); r.cur().cb.onPartial('nice to')
    r.advance(100); r.cur().cb.onLevel(0.05); r.cur().cb.onPartial('nice to meet')
    r.advance(QUIET_LAST_MS + 50); expect(r.cur().stopped).toBe(0) // 1150 мс тишины перед «you» — пауза 900 мс × 1,5 ещё не вышла, не конец
    r.advance(900 * QUIET_PAUSE_K - QUIET_LAST_MS); expect(r.cur().stopped).toBe(1)
    expect(r.logs.some(s => /без последнего слова, тишина \d+ мс \(порог 1350\) — прошу итог захода/.test(s))).toBe(true)
    const q = rig([P.meet]); await flush() // очень медленно — не дольше QUIET_MAX_MS
    q.cur().cb.onLevel(0.05); q.cur().cb.onPartial('nice'); q.advance(3000); q.cur().cb.onLevel(0.05); q.cur().cb.onPartial('nice to meet')
    q.advance(QUIET_MAX_MS + 10); expect(q.cur().stopped).toBe(1)
    r.l.stop(); q.l.stop()
  })
  it('итог по затвору: голос шёл после последней смены черновика (последнее слово Vosk покажет только итогом) или последнее слово уже есть — затвор закрылся → итог через 150 мс; пауза (черновик после голоса) — нет; голос вернулся — отмена', async () => {
    expect(GATE_CLOSE_FINAL_MS).toBe(150); expect(TAIL_VOICE_MS).toBe(80)
    const voice = (r, ms) => { for (let i = 0; i < ms; i += 40) { r.cur().cb.onLevel(0.05); r.advance(40) } }
    const r = rig([P.meet, P.from]); await flush()
    voice(r, 400); r.cur().cb.onPartial('where are you') // «from» звучит, а в черновике его нет
    voice(r, 300); r.advance(300); r.cur().opts.onGate(false, 0.001)
    r.advance(GATE_CLOSE_FINAL_MS - 10); expect(r.cur().stopped).toBe(0)
    r.advance(10); expect(r.cur().stopped).toBe(1)
    expect(r.logs.find(x => x.includes('итог запрошен'))).toMatch(/^\[phrase-ear\] итог запрошен: затвор закрыт \+150 мс, черновик «where are you», голос после черновика \d+ мс \+\d+ мс$/)
    r.cur().cb.onResult('where are you from', { words: [] })
    expect(r.got).toEqual([{ phraseKey: 'where are you from', ratio: 1, heard: 'where are you from' }])
    const q = rig([P.meet, P.from]); await flush() // пауза перед последним словом: черновик пришёл уже после голоса
    voice(q, 600); q.advance(150); q.cur().cb.onPartial('where are you'); q.advance(150); q.cur().opts.onGate(false, 0.001)
    q.advance(GATE_CLOSE_FINAL_MS + 100); expect(q.cur().stopped).toBe(0)
    const g = rig([P.meet, P.from]); await flush() // затвор открылся раньше 150 мс — запрос отменён
    voice(g, 400); g.cur().cb.onPartial('where are'); voice(g, 300); g.advance(300); g.cur().opts.onGate(false, 0.001)
    g.advance(100); g.cur().opts.onGate(true, 0.04); g.advance(200); expect(g.cur().stopped).toBe(0)
    const m = rig([P.meet, P.from]); await flush() // не хватает середины, последнее слово есть — итог по затвору без голоса после черновика
    voice(m, 600); m.advance(150); m.cur().cb.onPartial('where you from'); m.advance(150); m.cur().opts.onGate(false, 0.001); m.advance(GATE_CLOSE_FINAL_MS)
    expect(m.cur().stopped).toBe(1); expect(m.logs.find(x => x.includes('итог запрошен'))).toContain('последнее слово есть')
    r.l.stop(); q.l.stop(); g.l.stop(); m.l.stop()
  })
})
