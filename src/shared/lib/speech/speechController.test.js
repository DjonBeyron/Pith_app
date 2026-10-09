import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { LISTEN_SILENCE_MS, PERMISSION_GUARD_MS, RETRY_PAUSE_MS, shouldRetry } from './speechPolicy.js'
import { FakeRec, alt, interimRes, setup } from './speechTestKit.js'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('speechPolicy', () => {
  it('повторяем сеть/тишину, но не отказ пользователя; не больше 3 попыток', () => {
    expect(shouldRetry('network', 0)).toBe(true)
    expect(shouldRetry('no-speech', 1)).toBe(true)
    expect(shouldRetry('network', 2)).toBe(false)
    for (const c of ['not-allowed', 'audio-capture', 'start-failed', 'no-start']) expect(shouldRetry(c, 0)).toBe(false)
  })
})

describe('таймаут «нет речи» считается от audiostart', () => {
  it('пока висит диалог разрешения — тишина не засчитывается, ждём до 30 с', async () => {
    const s = setup()
    s.tap()
    expect(s.last().status).toBe('starting')
    expect(s.last().notice).toMatch(/разрешение микрофона/)
    await s.tick(LISTEN_SILENCE_MS + 5000) // дольше прежних 8 с — ошибки нет
    expect(s.last().status).toBe('starting')
    expect(s.last().error).toBeNull()
    s.rec(0).onaudiostart() // пользователь разрешил
    expect(s.last().status).toBe('listening')
    await s.tick(LISTEN_SILENCE_MS - 100)
    expect(s.last().status).toBe('listening')
    await s.tick(200)
    expect(s.entries[0].error).toBe('silence')
    expect(s.last().status).toBe('retrying')
  })

  it('речь/interim продлевает ожидание', async () => {
    const s = setup()
    s.tap()
    s.rec(0).onaudiostart()
    await s.tick(7000)
    s.rec(0).onspeechstart()
    await s.tick(7000)
    s.rec(0).onresult({ results: [interimRes('i am')] })
    await s.tick(7000)
    expect(s.entries).toHaveLength(0)
    expect(s.last().interim).toBe('i am')
  })

  it('предохранитель 30 с без audiostart: ошибка no-start, без автоповтора', async () => {
    const s = setup()
    s.tap()
    await s.tick(PERMISSION_GUARD_MS + 10)
    expect(s.last().status).toBe('error')
    expect(s.last().error).toBe('no-start')
    expect(FakeRec.all).toHaveLength(1)
    expect(s.rec(0).aborted).toBeGreaterThan(0)
  })
})

describe('автоповторы', () => {
  it('network: до 3 попыток, пауза, новый экземпляр на каждую, журнал по каждой', async () => {
    const s = setup()
    s.tap()
    s.rec(0).onaudiostart()
    s.rec(0).onerror({ error: 'network' })
    expect(s.last().status).toBe('retrying')
    expect(s.last().notice).toBe('Слабая связь, пробуем ещё раз (2 из 3)…')
    expect(FakeRec.all).toHaveLength(1)
    await s.tick(RETRY_PAUSE_MS + 1)
    expect(FakeRec.all).toHaveLength(2)
    expect(s.rec(1).started).toBe(true)
    expect(s.last().attempt).toBe(2)
    s.rec(1).onerror({ error: 'network' })
    expect(s.last().notice).toBe('Слабая связь, пробуем ещё раз (3 из 3)…')
    await s.tick(RETRY_PAUSE_MS + 1)
    expect(FakeRec.all).toHaveLength(3)
    s.rec(2).onerror({ error: 'network' })
    await s.tick(5000)
    expect(FakeRec.all).toHaveLength(3) // четвёртой нет
    expect(s.last().status).toBe('error')
    expect(s.last().error).toBe('network')
    expect(s.entries.map(e => [e.retry, e.last, e.error])).toEqual([[0, false, 'network'], [1, false, 'network'], [2, true, 'network']])
    expect(new Set(s.entries.map(e => e.run)).size).toBe(1)
  })

  it('успех на третьей попытке', async () => {
    const s = setup()
    s.tap()
    s.rec(0).onerror({ error: 'network' })
    await s.tick(RETRY_PAUSE_MS + 1)
    s.rec(1).onerror({ error: 'no-speech' })
    await s.tick(RETRY_PAUSE_MS + 1)
    s.rec(2).onaudiostart()
    s.rec(2).onresult({ results: [alt('i am here')] })
    s.rec(2).onend()
    await s.tick(0)
    expect(s.last().status).toBe('done')
    expect(s.last().final.text).toBe('i am here')
    expect(s.entries.at(-1)).toMatchObject({ retry: 2, last: true, outcome: 'ok', error: null })
  })

  it('not-allowed и audio-capture не повторяем', async () => {
    for (const code of ['not-allowed', 'audio-capture']) {
      const s = setup()
      s.tap()
      s.rec(0).onerror({ error: code })
      await s.tick(5000)
      expect(FakeRec.all).toHaveLength(1)
      expect(s.last()).toMatchObject({ status: 'error', error: code })
    }
  })

  it('no-speech после повторов: подсказка «громче и ближе»', async () => {
    const s = setup()
    s.tap()
    for (let i = 0; i < 3; i++) {
      s.rec(i).onerror({ error: 'no-speech' })
      await s.tick(RETRY_PAUSE_MS + 1)
    }
    expect(s.last().status).toBe('error')
    expect(s.last().hint).toMatch(/громче и ближе/)
  })

  it('автоповтор вне жеста не запустился (iOS): кнопка «Ещё раз» и исходная ошибка', async () => {
    const s = setup()
    s.tap()
    s.rec(0).onerror({ error: 'network' })
    const orig = FakeRec.prototype.start
    FakeRec.prototype.start = function () { throw new Error('not allowed outside gesture') }
    await s.tick(RETRY_PAUSE_MS + 1)
    FakeRec.prototype.start = orig
    expect(s.last()).toMatchObject({ status: 'error', error: 'network', needTap: true })
  })

  it('Стоп во время паузы перед автоповтором отменяет его', async () => {
    const s = setup()
    s.tap()
    s.rec(0).onerror({ error: 'network' })
    s.ctrl.stop()
    await s.tick(5000)
    expect(FakeRec.all).toHaveLength(1)
    expect(s.last().status).toBe('done')
  })
})

