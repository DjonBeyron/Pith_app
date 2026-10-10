import { describe, it, expect, beforeEach } from 'vitest'
import { soundDiag, soundDiagLines } from './soundDiag.js'
import { holdSilence, suppressSound, _resetSoundQuiet } from './soundQuiet.js'

const session = { current: () => 'play-and-record' }
const trace = () => ({ сводка: { 'message-in': { запросов: 3, прозвучал: 2, проблем: 1 } }, запросы: [{ звук: 'message-in', итог: 'НЕ ПРОЗВУЧАЛ (не было playing)', состояниеCtx: 'interrupted', откуда: 'чат' }] })

describe('soundDiag', () => {
  beforeEach(() => _resetSoundQuiet())

  it('чистое состояние: тишины нет, ничего не проглочено, контекст ещё не создан', () => {
    const d = soundDiag({ session, trace: () => ({ сводка: {}, запросы: [] }) })
    expect(d.ctx).toBe('нет')
    expect(d.quiet).toEqual({ silence: [], window: false, dropped: 0, deferred: [] })
    expect(d.last).toBeNull()
    expect(soundDiagLines(d)[1]).toContain('тишины нет')
  })

  it('полная тишина видна по причине, проглоченный звук и последний запрос — в строках', () => {
    holdSilence('admin-voice')
    suppressSound('message-in', () => {})
    const d = soundDiag({ session, trace, now: () => Date.now() + 5000 })
    expect(d.quiet.silence).toEqual(['admin-voice'])
    expect(d.quiet.dropped).toBe(1)
    expect(d.problems).toBe(1)
    expect(d.dropped.name).toBe('message-in')
    const text = soundDiagLines(d).join('\n')
    expect(text).toContain('ПОЛНАЯ ТИШИНА (admin-voice)')
    expect(text).toContain('аудиосессия: play-and-record')
    expect(text).toContain('message-in → НЕ ПРОЗВУЧАЛ')
    expect(text).toContain('проглочен последним: message-in 5 с назад')
  })
})
