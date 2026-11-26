import { describe, it, expect } from 'vitest'
import { tailWait, TAIL_HOLD_MS, TAIL_LAST_STABLE_MS, TAIL_LAST_QUIET_MS } from './racePhraseTailHold.js'
import { rig, P, flush } from './racePhraseListenRig.js'

// v3.3.380: зачёт последнего слова фразы в проходе 1 не ждёт лишних 150 мс (журнал владельца 26.11, iPhone: от последнего слова в черновике до зачёта 468–499 мс, из них 300 — удержание хвоста).
const voice = r => { r.cur().cb.onLevel(0.001); r.cur().cb.onLevel(0.05) }
const asked = r => r.logs.filter(s => /новое слово устоялось/.test(s))

describe('последнее слово фразы: итог просим, когда хвост устоял и голоса нет', () => {
  it('tailWait: не последнее слово — как раньше (пауза голоса TAIL_HOLD_MS); последнее — голос идёт: ждём, голоса нет или хвост устоял: просим сразу', () => {
    expect(tailWait({ first: true, left: 0, sinceVoice: TAIL_HOLD_MS - 1 })).toBe(100); expect(tailWait({ first: true, left: 0, sinceVoice: TAIL_HOLD_MS })).toBe(0)
    expect(tailWait({ first: false, left: 150, sinceVoice: TAIL_LAST_QUIET_MS - 1 })).toBe(50); expect(tailWait({ first: false, left: 150, sinceVoice: TAIL_LAST_QUIET_MS })).toBe(0)
    expect(tailWait({ first: false, left: 0, sinceVoice: 0 })).toBe(0) // потолок прежний: хвост простоял TAIL_HOLD_MS — просим при любом голосе
    expect(TAIL_LAST_STABLE_MS).toBeLessThan(TAIL_HOLD_MS)
  })
  it('«you» в черновике, голос кончился: итог захода просим через TAIL_LAST_STABLE_MS, а не через 300 мс; решает по-прежнему итог (зачёта по черновику нет)', async () => {
    const r = rig([P.meet, P.from], { wordByWord: true }); await flush()
    voice(r); r.cur().cb.onPartial('nice to meet you')
    r.advance(TAIL_LAST_STABLE_MS - 1); expect(r.cur().stopped).toBe(0)
    r.advance(1); expect(r.cur().stopped).toBe(1); expect(asked(r)).toHaveLength(1)
    expect(r.got).toEqual([]) // черновиком не принято
    r.cur().cb.onResult('nice to meet you', { words: [] }); expect(r.got).toEqual([{ phraseKey: 'nice to meet you', ratio: 1, heard: 'nice to meet you' }])
    r.l.stop()
  })
  it('слово ещё говорится (громкие куски каждые 50 мс): итог не просим раньше, чем кончится голос; не позже прежних 300 мс', async () => {
    const r = rig([P.meet, P.from], { wordByWord: true }); await flush()
    voice(r); r.cur().cb.onPartial('nice to meet you')
    for (let i = 0; i < 5; i++) { r.advance(50); r.cur().cb.onLevel(0.05) } // 250 мс, голос идёт
    expect(r.cur().stopped).toBe(0)
    r.advance(50); expect(r.cur().stopped).toBe(1) // потолок TAIL_HOLD_MS
    r.l.stop()
  })
})
