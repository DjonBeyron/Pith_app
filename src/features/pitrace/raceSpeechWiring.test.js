import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { speakTranslation } from './useRaceSpeech.js'
import { createRaceSpeech } from './raceSpeech.js'
import { RACE_GATE_MS, RACE_START_LEAD_MS } from './raceStartTrace.js'

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const rp = '../player/modules/rotate-phone/'

// Проводка секвенсора речи (v3.3.117): speech-end приходит от источника звука (ended), а не из оценки
describe('speech-end: источник даёт ended', () => {
  it('onEnd протянут: playWordSlot → playWordBuffer / playSlot → playGameBuffer.onEnd (Web Audio) и ended элемента (<audio>)', () => {
    expect(read(rp + 'wordLaneClips.js')).toContain('playWordBuffer(k, onResult, onStart, onEnd)'); expect(read(rp + 'wordLaneClips.js')).toContain('playSlot(k, onResult, onStart, onEnd)')
    expect(read(rp + 'wordLaneBuffers.js')).toContain('onStart, onResult, onEnd })')
    expect(read(rp + 'wordLaneSlots.js')).toContain("addEventListener?.('ended', onEnd")
    expect(read('../../shared/lib/gameBufferPlay.js')).toContain('node.src.onended')
    expect(read(rp + 'wordLaneCatSay.js')).toContain('play(key, onResult, onStart, onEnd)')
    expect(read(rp + 'useCatLines.js')).toContain('onEnd: done')
  })
  it('перевод: sayText получает onSay / onEnd; не зазвучал — секвенсору «перевода нет»', () => {
    const log = []
    const sp = createRaceSpeech({ log: s => log.push(s) })
    speakTranslation(sp, o => { o.onSay(900); o.onEnd() })
    expect(log.some(s => s.includes('перевод пошёл, оценка 900'))).toBe(true)
    expect(log.some(s => s.includes('speech-end: перевод доиграл'))).toBe(true)
    speakTranslation(sp, () => {})
    expect(log.some(s => s.includes('перевода нет'))).toBe(true)
  })
  it('старт: race_start сразу и без ожидания головы, ворота первой реплики не дольше 400 мс', () => {
    expect(RACE_START_LEAD_MS).toBe(0)
    expect(RACE_GATE_MS).toBeLessThanOrEqual(400)
    expect(read('../rehearsal/useRehearsalActs.js')).toContain('{ noRise: true }')
    expect(read(rp + 'wordLaneStart.js')).toContain('maxMs: raceGateMs')
  })
})
