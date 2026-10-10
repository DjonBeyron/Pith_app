import { describe, it, expect } from 'vitest'
import { clampAutoStop, autoStopDue, afterSpeechMs, summarize, sec, timeLine, AUTOSTOP_DEFAULT, AUTOSTOP_PRESETS, AUTOSTOP_PHRASE, AUTOSTOP_FULL, STOP_BY, VOICE_HOLD_MAX_MS } from './voskTiming.js'

describe('авто-стоп', () => {
  it('диапазон 500–1500, по умолчанию 800, 0 — выключен', () => {
    expect(AUTOSTOP_DEFAULT).toBe(800)
    expect(AUTOSTOP_PRESETS).toEqual([0, 500, 800, 1000, 1500])
    expect(clampAutoStop(100)).toBe(500)
    expect(clampAutoStop(9999)).toBe(1500)
    expect(clampAutoStop(0)).toBe(0)
    expect(clampAutoStop('мусор')).toBe(800)
    expect(clampAutoStop(null)).toBe(800)
    expect(clampAutoStop(830)).toBe(850)
  })
  it('срабатывает, когда текст partial не менялся N мс; до первого partial — нет', () => {
    const base = { startedAt: 0, autoStopMs: 800, maxMs: 10000 }
    expect(autoStopDue({ ...base, now: 3000, text: '', lastChangeAt: null })).toBeNull()
    expect(autoStopDue({ ...base, now: 2000, text: 'try', lastChangeAt: 1500 })).toBeNull()
    expect(autoStopDue({ ...base, now: 2300, text: 'try', lastChangeAt: 1500 })).toBe('auto')
    expect(autoStopDue({ ...base, autoStopMs: 0, now: 5000, text: 'try', lastChangeAt: 1500 })).toBeNull()
  })
  it('потолок записи важнее; без потолка (0) не срабатывает', () => {
    expect(autoStopDue({ now: 10000, startedAt: 0, autoStopMs: 800, maxMs: 10000, text: '', lastChangeAt: null })).toBe('max')
    expect(autoStopDue({ now: 99999, startedAt: 0, autoStopMs: 0, maxMs: 0, text: '', lastChangeAt: null })).toBeNull()
  })
})

describe('задержки', () => {
  it('итог после конца слова: от итога минус старт звука минус конец слова', () => {
    expect(afterSpeechMs({ resultMs: 3189, audioStartMs: 100, words: [{ end: 2.25 }] })).toBe(839)
    expect(afterSpeechMs({ resultMs: 3189, audioStartMs: 100, words: [["i'm", 1, 0.5, 0.8], ['try', 1, 1.5, 2.25]] })).toBe(839)
    expect(afterSpeechMs({ resultMs: 3189, audioStartMs: null, words: [{ end: 2 }] })).toBeNull()
    expect(afterSpeechMs({ resultMs: 100, audioStartMs: 0, words: [] })).toBeNull()
    expect(afterSpeechMs({ resultMs: 500, audioStartMs: 0, words: [{ end: 2 }] })).toBe(0)
  })
  it('медиана/максимум, пустые отбрасываем', () => {
    expect(summarize([2706, 1640, null, 3189])).toEqual({ n: 3, med: 2706, max: 3189 })
    expect(summarize([1000, 2000])).toEqual({ n: 2, med: 1500, max: 2000 })
    expect(summarize([])).toEqual({ n: 0, med: null, max: null })
  })
  it('строка таймингов карточки', () => {
    const tm = { tap: 420, fp: 2706, res: 3189, end: 839, by: 'auto' }
    const line = timeLine(tm, [['try', 1, 1.71, 2.25]])
    expect(line).toBe('старт записи 420 мс после «Сказать» · первый partial 2.7 с · итог 3.2 с · слово 1.71–2.25 с · итог через 0.8 с после слова · (авто-стоп)')
    expect(timeLine(null)).toBe('')
    expect(sec(null)).toBe('—')
  })
})

describe('авто-стоп не обрывает идущую речь', () => {
  const base = { startedAt: 0, autoStopMs: AUTOSTOP_PHRASE, maxMs: 20000, text: "i'm trying to please", lastChangeAt: 2000 }
  it('для фраз пауза 2500 мс (константа AUTOSTOP_PHRASE): медленная речь с паузами 1,5–2,4 с между словами не обрывается', () => {
    expect(AUTOSTOP_PHRASE).toBe(2500)
    expect(autoStopDue({ ...base, now: 2000 + 2400 })).toBeNull()
    expect(autoStopDue({ ...base, now: 2000 + 2500 })).toBe('auto')
    expect(autoStopDue({ ...base, now: 9000, text: '', lastChangeAt: null })).toBeNull() // слов ещё нет — ждём молча (до SAY_SILENCE_MS в адаптере)
  })
  it('вся фраза услышана (complete) — стоп за AUTOSTOP_FULL (800 мс), причина «full»; не вся — по-прежнему 2500; completeMs не длиннее обычной паузы', () => {
    const f = { ...base, complete: true, completeMs: AUTOSTOP_FULL }
    expect(AUTOSTOP_FULL).toBe(800)
    expect(autoStopDue({ ...f, now: 2000 + 799 })).toBeNull()
    expect(autoStopDue({ ...f, now: 2000 + 800 })).toBe('full')
    expect(autoStopDue({ ...base, completeMs: AUTOSTOP_FULL, now: 2000 + 800 })).toBeNull() // complete=false
    expect(autoStopDue({ ...f, completeMs: 5000, now: 2000 + 2500 })).toBe('auto') // «быстрее» не может быть медленнее
    expect(autoStopDue({ ...f, now: 2000 + 850, lastVoiceAt: 2000 + 800 })).toBeNull() // голос идёт — и тут ждём
    expect(STOP_BY.full).toMatch(/целиком/)
  })
  it('голос был только что (partial отстал от речи) — ждём; тихо — стоп; шумная комната: не дольше VOICE_HOLD_MAX_MS сверх паузы', () => {
    const T = 2000 + AUTOSTOP_PHRASE // момент, когда пауза выдержана
    expect(autoStopDue({ ...base, now: T + 100, lastVoiceAt: T })).toBeNull() // говорят прямо сейчас
    expect(autoStopDue({ ...base, now: T + 100, lastVoiceAt: 2000 })).toBe('auto') // голос смолк давно
    expect(autoStopDue({ ...base, now: T + VOICE_HOLD_MAX_MS, lastVoiceAt: T + VOICE_HOLD_MAX_MS - 50 })).toBe('auto') // шум не держит вечно
    expect(autoStopDue({ ...base, now: T + 100, lastVoiceAt: null })).toBe('auto')
  })
})
