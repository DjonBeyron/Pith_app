import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { armOwnVoice, notifyNodeRevealed, markOwnVoicePlaying, markOwnVoiceDone, ownVoiceBusy, resetOwnVoiceGate, OWN_VOICE_FALLBACK_MS, OWN_VOICE_HOLD_PAD_MS } from './ownVoiceGate.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// Реакция на голосовой ответ: ответ → сообщение Пита → звучит голос ученика → дальше Пит (ownVoiceGate.js)
describe('ownVoiceGate — свой голос ученика ждёт сообщения Пита', () => {
  beforeEach(() => { vi.useFakeTimers(); resetOwnVoiceGate() })
  afterEach(() => { vi.useRealTimers(); resetOwnVoiceGate() })

  it('не играет сразу; стартует на показе следующей ноды, один раз', () => {
    const start = vi.fn()
    armOwnVoice(start)
    vi.advanceTimersByTime(1000)
    expect(start).not.toHaveBeenCalled()
    notifyNodeRevealed()
    expect(start).toHaveBeenCalledTimes(1)
    notifyNodeRevealed()
    vi.advanceTimersByTime(OWN_VOICE_FALLBACK_MS * 2)
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('следующей ноды нет — запасной таймер запускает сам; отмена (пузырь выгружен) глушит', () => {
    const a = vi.fn(); const b = vi.fn()
    armOwnVoice(a)
    vi.advanceTimersByTime(OWN_VOICE_FALLBACK_MS)
    expect(a).toHaveBeenCalledTimes(1)
    armOwnVoice(b)()
    vi.advanceTimersByTime(OWN_VOICE_FALLBACK_MS)
    notifyNodeRevealed()
    expect(b).not.toHaveBeenCalled()
  })

  it('пока клип звучит, граф занят (длина клипа + запас), по окончании — свободен сразу', () => {
    expect(ownVoiceBusy()).toBe(false)
    markOwnVoicePlaying(3000)
    expect(ownVoiceBusy()).toBe(true)
    vi.advanceTimersByTime(3000 + OWN_VOICE_HOLD_PAD_MS - 1)
    expect(ownVoiceBusy()).toBe(true)
    vi.advanceTimersByTime(2)
    expect(ownVoiceBusy()).toBe(false)
    markOwnVoicePlaying(60000); markOwnVoiceDone()
    expect(ownVoiceBusy()).toBe(false)
  })

  it('проводка: граф зовёт notifyNodeRevealed при показе и держит «печатает», пока ownVoiceBusy; пузырь отмечает старт/конец', () => {
    const graph = read('../../useGraphPlayer.js')
    expect(graph).toContain('notifyNodeRevealed()')
    expect(graph).toContain('|| ownVoiceBusy())')
    const bubble = read('./SayVoiceReply.jsx')
    expect(bubble).toContain('armOwnVoice(')
    expect(bubble).toContain('markOwnVoicePlaying(')
    expect(bubble).toContain('markOwnVoiceDone()')
  })
})
