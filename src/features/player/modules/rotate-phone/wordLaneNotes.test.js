import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { NOTES, TARGET_RMS, PEAK_LIMIT, makeNoteWav, wavRms } from './wordLaneNotes.js'
import { FULL_STOP_MS } from './wordLaneListen.js'
import { LOCK_MS } from './wordLaneTimeline.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const peakOf = w => { const v = new DataView(w.buffer, w.byteOffset, w.byteLength); let m = 0; for (let i = 44; i + 1 < w.length; i += 2) m = Math.max(m, Math.abs(v.getInt16(i, true))); return m }
const wavs = NOTES.map(n => makeNoteWav(n.freqs, n.ms, n.level))

// «Третья нота тише» — проверяем сигнал и причину на стороне игры
describe('громкость нот: третья не тише первых', () => {
  it('нота за нотой не тише: RMS второй ≈ первой, третья (аккорд-финал) заметно громче', () => {
    const [r1, r2, r3] = wavs.map(wavRms)
    expect(Math.abs(r2 - r1) / r1).toBeLessThan(0.02)           // до и ми — одной энергии
    expect(r3).toBeGreaterThanOrEqual(r2 * 1.15)                // финал минимум на 15 % громче
    expect(r1).toBeGreaterThan(TARGET_RMS * 0.9)
  })

  it('ни одна нота не клиппирует; пик в пределах PEAK_LIMIT (аккорд не «ломается»)', () => {
    wavs.forEach(w => { expect(peakOf(w)).toBeLessThanOrEqual(PEAK_LIMIT + 1); expect(peakOf(w)).toBeGreaterThan(3000) })
    wavs.forEach(w => expect(peakOf(w)).toBeLessThan(32767))
  })

  it('третья нота длиннее (финал) и ровно начинается с мягкого входа, а не с щелчка: первые отсчёты тихие', () => {
    expect(NOTES[2].ms).toBeGreaterThan(NOTES[1].ms)
    wavs.forEach(w => { const v = new DataView(w.buffer); expect(Math.abs(v.getInt16(44, true))).toBeLessThan(200) })
  })

  it('аккорд — три разных тона, выше второй ноты; одиночные ноты поднимаются по ступеням', () => {
    expect(NOTES[2].freqs).toHaveLength(3)
    expect(NOTES[2].freqs[0]).toBeGreaterThan(NOTES[1].freqs[0])
    expect(NOTES[1].freqs[0]).toBeGreaterThan(NOTES[0].freqs[0])
  })

  it('причина «тише» на телефоне — закрытие микрофона во время третьей ноты: слушатель закрывается позже, чем доиграет щелчок + нота + запас', () => {
    // третья принятая пилюля: слово принято → заливка LOCK_MS → щелчок и нота NOTES[2].ms. Микрофон не должен закрыться раньше конца ноты
    expect(FULL_STOP_MS).toBeGreaterThan(LOCK_MS + NOTES[2].ms + 500)
  })

  it('элементы нот прогреваются заранее своим src (первое проигрывание без задержки), уважают «без звука»', () => {
    const src = read('./wordLaneNotes.js')
    expect(src).toContain('a.src = own[k]; a.load()')
    expect(src).toContain('getLessonMuted()')
  })
})
