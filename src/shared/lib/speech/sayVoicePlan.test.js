import { describe, it, expect, vi, beforeEach } from 'vitest'
import { planVoice, takeVoice } from './sayVoicePlan.js'
import { getVoiceAttempt, voiceRow, setVoiceAttempt } from './sayVoiceLast.js'
import { pauseSayVoices } from './sayVoicePause.js'

// Выбор «голос или текст» на попытку: голосовое — только при включённом режиме ноды, движке Vosk и годной записи; всё остальное — обычный текст с понятной причиной.
const GOOD = { ok: true, blob: { size: 100 }, durationMs: 2100, peaks: [0.1, 1] }

describe('planVoice: голос или текст', () => {
  it('Vosk + режим вкл + годная запись → голос', () => {
    expect(planVoice({ voiceOn: true, engine: 'vosk', audio: GOOD })).toEqual({ voice: true, reason: 'ok' })
  })
  it('режим выключен → текст, даже если запись есть', () => {
    expect(planVoice({ voiceOn: false, engine: 'vosk', audio: GOOD })).toEqual({ voice: false, reason: 'off' })
  })
  it('системное распознавание (Firefox, Vosk не готов) → ТОЛЬКО текст, даже при включённом режиме', () => {
    expect(planVoice({ voiceOn: true, engine: 'system', audio: null })).toEqual({ voice: false, reason: 'system' })
    expect(planVoice({ voiceOn: true, engine: null, audio: GOOD })).toEqual({ voice: false, reason: 'system' })
  })
  it('Vosk, но записи нет или она битая → текст с причиной (никакого пустого плеера)', () => {
    expect(planVoice({ voiceOn: true, engine: 'vosk', audio: null }).reason).toBe('no-audio')
    expect(planVoice({ voiceOn: true, engine: 'vosk', audio: { ok: false, reason: 'silent' } })).toEqual({ voice: false, reason: 'silent' })
    expect(planVoice({ voiceOn: true, engine: 'vosk', audio: { ok: false, reason: 'short' } }).reason).toBe('short')
    expect(planVoice({ voiceOn: true, engine: 'vosk', audio: { ok: true } }).voice).toBe(false) // «успех» без blob — не доверяем
    expect(planVoice({ voiceOn: true, engine: 'vosk', audio: { ok: false } }).reason).toBe('error')
  })
})

describe('takeVoice: клип → реестр, причина → диагностика и pLog', () => {
  const log = vi.fn()
  beforeEach(() => { log.mockClear() })

  it('голос: клип положен в реестр (blob + длительность + столбики), id возвращён, диагностика «записано N с»', () => {
    const put = vi.fn(() => 'sv7')
    const r = takeVoice({ voiceOn: true, engine: 'vosk', audio: GOOD }, { put, log })
    expect(r).toEqual({ id: 'sv7', reason: 'ok' })
    expect(put).toHaveBeenCalledWith(GOOD.blob, { durationMs: 2100, peaks: GOOD.peaks })
    expect(getVoiceAttempt()).toMatchObject({ ok: true, ms: 2100 })
    expect(voiceRow(true).text).toBe('режим ноды вкл; последняя попытка: записано 2,1 с')
    expect(log.mock.calls[0][0]).toContain('голосовое: записано 2.1 с')
  })
  it('текст: реестр не трогаем; причина попадает в диагностику и лог', () => {
    const put = vi.fn()
    expect(takeVoice({ voiceOn: true, engine: 'system', audio: null }, { put, log }).id).toBeNull()
    expect(put).not.toHaveBeenCalled()
    expect(voiceRow(true)).toEqual({ level: 'warn', text: 'режим ноды вкл; последняя попытка: нет (распознавало системное, не Vosk)' })
    expect(log.mock.calls[0][0]).toBe('только текст: system')
  })
  it('режим выключен → тихо (в pLog ничего), строка диагностики «режим ноды выкл»', () => {
    takeVoice({ voiceOn: false, engine: 'vosk', audio: GOOD }, { put: vi.fn(), log })
    expect(log).not.toHaveBeenCalled()
    expect(voiceRow(false).text).toBe('режим ноды выкл')
  })
  it('реестр не принял клип (лимит/нет URL) или бросил → текст, причина limit', () => {
    expect(takeVoice({ voiceOn: true, engine: 'vosk', audio: GOOD }, { put: () => null, log })).toEqual({ id: null, reason: 'limit' })
    expect(takeVoice({ voiceOn: true, engine: 'vosk', audio: GOOD }, { put: () => { throw new Error('x') }, log }).reason).toBe('limit')
  })
  it('строка диагностики до первой попытки', () => {
    setVoiceAttempt(null)
    expect(voiceRow(true).text).toBe('режим ноды вкл; последняя попытка: ещё не было')
  })
})

describe('pauseSayVoices: новая запись останавливает свои голосовые', () => {
  it('паузит только играющие audio[data-say-voice]', () => {
    const mk = paused => ({ paused, pause: vi.fn() })
    const a = mk(false); const b = mk(true)
    const root = { querySelectorAll: sel => (sel === 'audio[data-say-voice]' ? [a, b] : []) }
    expect(pauseSayVoices(root)).toBe(1)
    expect(a.pause).toHaveBeenCalled()
    expect(b.pause).not.toHaveBeenCalled()
    expect(pauseSayVoices(null)).toBe(0)
  })
})
