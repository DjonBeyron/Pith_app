import { describe, it, expect, vi } from 'vitest'
import { warmRecognizer, WARM_NOISE_MS, WARM_SILENCE_MS, WARM_REMOVE_MS } from './voskWarmRec.js'

// Прогрев распознавателя после загрузки модели: короткий KaldiRecognizer, звук + тишина, итог, удаление.
const fakeModel = () => { const rec = { acceptWaveformFloat: vi.fn(), retrieveFinalResult: vi.fn(), remove: vi.fn() }; const Ctor = vi.fn(function Rec() { return rec }); return { model: { KaldiRecognizer: Ctor }, rec, Ctor } }

describe('warmRecognizer', () => {
  it('словарь из двух слов + [unk]; шум и тишина в декодер; итог; удаление через WARM_REMOVE_MS', () => {
    const { model, rec, Ctor } = fakeModel()
    const timers = []; const log = vi.fn()
    expect(warmRecognizer(model, ['yes', 'no'], { rate: 16000, log, setTimer: (f, ms) => timers.push([f, ms]) })).toBe(true)
    expect(Ctor).toHaveBeenCalledWith(16000, JSON.stringify(['yes', 'no', '[unk]']))
    const fed = rec.acceptWaveformFloat.mock.calls
    expect(fed).toHaveLength(2); expect(fed[0][0].length).toBe(16000 * WARM_NOISE_MS / 1000); expect(fed[1][0].length).toBe(16000 * WARM_SILENCE_MS / 1000)
    expect(Math.max(...fed[0][0])).toBeGreaterThan(0.02); expect(Math.max(...fed[1][0])).toBe(0) // звук не нулевой, тишина нулевая
    expect(rec.retrieveFinalResult).toHaveBeenCalled(); expect(rec.remove).not.toHaveBeenCalled()
    expect(timers[0][1]).toBe(WARM_REMOVE_MS); timers[0][0](); expect(rec.remove).toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('прогрев распознавателя отправлен'))
  })
  it('нет модели / нет KaldiRecognizer / исключение — false и ничего не бросает', () => {
    expect(warmRecognizer(null)).toBe(false); expect(warmRecognizer({})).toBe(false)
    const log = vi.fn()
    expect(warmRecognizer({ KaldiRecognizer: function Rec() { throw new Error('boom') } }, ['a'], { log })).toBe(false)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('не вышел: boom'))
  })
})
