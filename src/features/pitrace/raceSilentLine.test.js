import { describe, it, expect, vi } from 'vitest'
import { raceLinesOf, silentPause, silentMin, plateCaption, createSilentNote, SILENT_LINE_MS, CAPTION_READ_MS, SILENT_HOLD_MS } from './raceSilentLine.js'
import { lineMs, LINE_PAUSE_MS } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { stageTiming } from '../rehearsal/rehearsalCountdown.js'

// Замечание владельца (iPhone, 2026-11-07): «перед этапами какое-то время Пит молчит» — неозвученная реплика держала плашку по длине текста (65 мс на букву) + 600 мс
const lines = {
  race_catch: { text: 'теперь наоборот, я говорю по-английски, а ты называешь перевод', url: null, duration: null, words: null },
  race_phrases: { text: 'теперь фразы, сначала выбирай, потом говори', url: 'https://r2/x.mp3', duration: 2.4, words: null },
}

describe('неозвученные реплики гонки (raceSilentLine.js)', () => {
  const g = raceLinesOf(lines)
  it('метка silent только у реплик без озвучки; озвученные не меняются', () => {
    expect(g.race_catch.silent).toBe(true)
    expect(g.race_phrases).toBe(lines.race_phrases)
    expect(raceLinesOf(null)).toBe(null)
  })
  it('длина неозвученной — SILENT_LINE_MS (не по тексту и не по скорости голоса), озвученной — по файлу', () => {
    expect(lineMs(lines.race_catch)).toBeGreaterThan(3000) // как было: 62 буквы × 65 мс
    expect(lineMs(g.race_catch)).toBe(SILENT_LINE_MS)
    expect(lineMs(g.race_catch, 0.8)).toBe(SILENT_LINE_MS)
    expect(lineMs(g.race_phrases)).toBe(2400)
  })
  it('пауза после неозвученной — не дольше CAPTION_READ_MS (эха нет); у озвученной прежняя', () => {
    expect(silentPause(g.race_catch, LINE_PAUSE_MS)).toBe(CAPTION_READ_MS)
    expect(silentPause(g.race_catch, 0)).toBe(0) // секвенсор речи (пауза 0) не удлиняется
    expect(silentPause(g.race_phrases, LINE_PAUSE_MS)).toBe(LINE_PAUSE_MS)
  })
  it('плашка без озвучки держится коротко: ≈ 900 мс + 250 мс на подпись (минимум стадии 1,7 с урезается), с озвучкой — до конца реплики + пауза', () => {
    const silent = stageTiming({ lead: 250, lineMs: lineMs(g.race_catch), pause: silentPause(g.race_catch, LINE_PAUSE_MS), minMs: silentMin(g.race_catch, 1700), quiet: false })
    expect(silent.holdMs).toBeGreaterThanOrEqual(SILENT_HOLD_MS); expect(silent.holdMs).toBeLessThanOrEqual(1200)
    const before = stageTiming({ lead: 250, lineMs: lineMs(lines.race_catch), pause: LINE_PAUSE_MS, minMs: 1700, quiet: false })
    expect(before.holdMs).toBeGreaterThan(4500) // так было у владельца: ≈ 4,9 с тишины
    const voiced = stageTiming({ lead: 250, lineMs: lineMs(g.race_phrases), pause: silentPause(g.race_phrases, LINE_PAUSE_MS), minMs: silentMin(g.race_phrases, 1700), quiet: true })
    expect(voiced.holdMs).toBe(270 + 260 + 2400 + 1700) // озвученная: как раньше — речь, потом плашка st.ms
  })
  it('подпись плашки — текст неозвученной реплики стадии; у озвученной и без реплики — пусто', () => {
    expect(plateCaption(g, 'race_catch')).toBe(lines.race_catch.text)
    expect(plateCaption(g, 'race_phrases')).toBe('')
    expect(plateCaption(g, null)).toBe('')
    expect(plateCaption({ x: { text: 'a', silent: true, caption: 'длинная подпись' } }, 'x')).toBe('длинная подпись')
  })
  it('журнал «[say] реплика <id> без озвучки: подпись N мс» — один раз на реплику', () => {
    const log = vi.fn(), note = createSilentNote(log)
    note('race_catch', 900); note('race_catch', 900); note('race_phrases_pick', 900.4)
    expect(log.mock.calls.map(c => c[0])).toEqual(['[say] реплика race_catch без озвучки: подпись 900 мс', '[say] реплика race_phrases_pick без озвучки: подпись 900 мс'])
  })
})
