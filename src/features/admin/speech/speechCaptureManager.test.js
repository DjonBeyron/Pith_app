import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createCaptureManager } from './speechCaptureManager.js'
import { setup, FakeRec, alt } from '../../../shared/lib/speech/speechTestKit.js'
import { RETRY_PAUSE_MS } from '../../../shared/lib/speech/speechPolicy.js'
import { captureLogFields } from './speechCapture.js'

// Подставные getUserMedia / AudioContext / AnalyserNode: уровень задаём вручную (тишина 128, размах — 64/192)
function fakeEnv() {
  const env = { streams: [], ctxs: [], calls: [], order: [], fill: 128, rejectWith: null }
  env.getUserMedia = vi.fn(c => {
    env.calls.push(c); env.order.push('gum')
    if (env.rejectWith) return Promise.reject(env.rejectWith)
    const track = { stop: vi.fn(), getSettings: () => ({ autoGainControl: true }) }
    const s = { track, getTracks: () => [track], getAudioTracks: () => [track] }
    env.streams.push(s)
    return Promise.resolve(s)
  })
  env.createAudioContext = () => {
    const an = { fftSize: 0, getByteTimeDomainData: b => b.fill(env.fill) }
    const ctx = {
      state: 'running', resume: vi.fn(), close: vi.fn(() => Promise.resolve()), an,
      createMediaStreamSource: () => ({ connect: vi.fn(), disconnect: vi.fn() }), createAnalyser: () => an,
    }
    env.ctxs.push(ctx)
    return ctx
  }
  return env
}

describe('менеджер потока микрофона', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('режим A: getUserMedia не зовётся', () => {
    const env = fakeEnv()
    const m = createCaptureManager(env)
    m.open(1, 'plain')
    expect(env.getUserMedia).not.toHaveBeenCalled()
  })

  it('B: уровень раз в 100 мс, пик, fftSize 256; close освобождает всё', async () => {
    const env = fakeEnv()
    const states = []
    const m = createCaptureManager({ ...env, onState: s => states.push(s) })
    m.open(1, 'warm')
    await vi.advanceTimersByTimeAsync(0)
    expect(env.ctxs[0].an.fftSize).toBe(256)
    env.fill = 192 // амплитуда 0.5
    await vi.advanceTimersByTimeAsync(100)
    expect(states.at(-1)).toMatchObject({ status: 'live', level: 0.5, peak: 0.5 })
    env.fill = 128
    await vi.advanceTimersByTimeAsync(300)
    expect(states.at(-1)).toMatchObject({ level: 0, peak: 0.5 })
    const info = m.close(1)
    expect(info).toMatchObject({ peak: 0.5, agc: true, error: null })
    expect(env.streams[0].track.stop).toHaveBeenCalledTimes(1)
    expect(env.ctxs[0].close).toHaveBeenCalledTimes(1)
    const n = states.length
    await vi.advanceTimersByTimeAsync(1000)
    expect(states.length).toBe(n) // таймер уровня остановлен
    expect(m.close(1)).toEqual(info) // повторный close безопасен
  })

  it('getUserMedia отклонён: ошибка в состоянии, не бросает', async () => {
    const env = fakeEnv()
    env.rejectWith = Object.assign(new Error('x'), { name: 'NotAllowedError' })
    const states = []
    const m = createCaptureManager({ ...env, onState: s => states.push(s) })
    m.open(1, 'warm')
    await vi.advanceTimersByTimeAsync(0)
    expect(states.at(-1)).toMatchObject({ status: 'error', error: 'NotAllowedError' })
    expect(m.close(1)).toMatchObject({ error: 'NotAllowedError', peak: null })
  })

  it('getUserMedia бросает синхронно (нет mediaDevices) — тоже ошибка, а не исключение', async () => {
    const env = fakeEnv()
    env.getUserMedia = () => { throw new TypeError('no mediaDevices') }
    const m = createCaptureManager(env)
    expect(() => m.open(1, 'warmns')).not.toThrow()
    await vi.advanceTimersByTimeAsync(0)
    expect(m.close(1).error).toBe('TypeError')
  })

  it('поток пришёл ПОСЛЕ закрытия попытки — сразу гасится', async () => {
    const env = fakeEnv()
    const m = createCaptureManager(env)
    m.open(1, 'warm')
    m.close(1) // до резолва промиса
    await vi.advanceTimersByTimeAsync(0)
    expect(env.streams[0].track.stop).toHaveBeenCalledTimes(1)
  })

  it('открытие потока новой попытки закрывает поток прежней', async () => {
    const env = fakeEnv()
    const m = createCaptureManager(env)
    m.open(1, 'warm'); await vi.advanceTimersByTimeAsync(0)
    m.open(2, 'warm'); await vi.advanceTimersByTimeAsync(0)
    expect(env.streams[0].track.stop).toHaveBeenCalledTimes(1)
    expect(env.streams[1].track.stop).not.toHaveBeenCalled()
    m.close(2)
  })

  it('страховка: поток живёт не дольше 60 с', async () => {
    const env = fakeEnv()
    const m = createCaptureManager(env)
    m.open(1, 'warm')
    await vi.advanceTimersByTimeAsync(61000)
    expect(env.streams[0].track.stop).toHaveBeenCalledTimes(1)
  })
})

describe('контроллер + поток: привязка к attemptId', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function build(mode = 'warm') {
    const env = fakeEnv()
    const capture = createCaptureManager(env)
    const s = setup({ capture, getCapture: () => mode, logFields: captureLogFields })
    return { env, capture, ...s }
  }

  it('getUserMedia вызывается в том же тапе, до и без ожидания recognition.start()', async () => {
    const { env, tap, rec } = build()
    tap()
    expect(env.getUserMedia).toHaveBeenCalledTimes(1) // синхронно, не дожидаясь промиса
    expect(env.getUserMedia.mock.calls[0][0].audio.autoGainControl).toBe(true)
    expect(rec(0).started).toBe(true)
  })

  it('отказ getUserMedia не мешает распознаванию; ошибка попадает в журнал', async () => {
    const { env, tap, rec, tick, entries } = build()
    env.rejectWith = Object.assign(new Error('x'), { name: 'NotAllowedError' })
    tap()
    await tick(0)
    rec(0).onaudiostart()
    rec(0).onresult({ results: [alt('I am here', 0.8)] })
    rec(0).onend()
    await tick(10)
    expect(entries[0]).toMatchObject({ outcome: 'ok', capture: 'warm', capError: 'NotAllowedError', peak: null, conf: 80 })
  })

  it('успех: поток закрыт, в журнале режим и пик', async () => {
    const { env, tap, rec, tick, entries } = build('warmns')
    tap()
    await tick(0)
    rec(0).onaudiostart()
    env.fill = 160 // 0.25
    await tick(300)
    rec(0).onresult({ results: [alt('I am here', 0.9)] })
    rec(0).onend()
    await tick(10)
    expect(env.streams[0].track.stop).toHaveBeenCalledTimes(1)
    expect(env.ctxs[0].close).toHaveBeenCalledTimes(1)
    expect(env.calls[0].audio.noiseSuppression).toBe(true)
    expect(entries[0]).toMatchObject({ capture: 'warmns', peak: 25, conf: 90, outcome: 'ok' })
  })

  it('автоповтор: у каждой попытки свой поток, прежний закрыт до открытия нового', async () => {
    const { env, tap, rec, tick } = build()
    tap()
    await tick(0)
    rec(0).onaudiostart()
    rec(0).onerror({ error: 'network' })
    expect(env.streams[0].track.stop).toHaveBeenCalledTimes(1) // закрыт на конце попытки 1
    await tick(RETRY_PAUSE_MS + 1)
    expect(FakeRec.all).toHaveLength(2)
    expect(env.getUserMedia).toHaveBeenCalledTimes(2)
    await tick(0)
    expect(env.streams[1].track.stop).not.toHaveBeenCalled()
    rec(1).onerror({ error: 'not-allowed' })
    expect(env.streams[1].track.stop).toHaveBeenCalledTimes(1)
  })

  it('новый тап посреди попытки и «Стоп» освобождают микрофон; поздние события старой попытки игнорируются', async () => {
    const { env, ctrl, tap, rec, tick } = build()
    tap()
    await tick(0)
    tap() // новый заход: старая попытка гасится
    await tick(0)
    expect(env.streams[0].track.stop).toHaveBeenCalledTimes(1)
    expect(env.streams[1].track.stop).not.toHaveBeenCalled()
    rec(0).onerror?.({ error: 'network' }) // обработчики сняты — не должно ничего сделать
    ctrl.stop()
    expect(env.streams[1].track.stop).toHaveBeenCalledTimes(1)
    ctrl.reset()
    expect(env.getUserMedia).toHaveBeenCalledTimes(2)
  })

  it('таймаут тишины закрывает поток', async () => {
    const { env, tap, rec, tick } = build()
    tap()
    await tick(0)
    rec(0).onaudiostart()
    await tick(8100)
    expect(env.streams[0].track.stop).toHaveBeenCalledTimes(1)
  })

  it('режим A: потока нет, в журнале capture=plain', async () => {
    const { env, tap, rec, tick, entries } = build('plain')
    tap()
    rec(0).onaudiostart()
    rec(0).onresult({ results: [alt('I am here', 0.9)] })
    rec(0).onend()
    await tick(10)
    expect(env.getUserMedia).not.toHaveBeenCalled()
    expect(entries[0]).toMatchObject({ capture: 'plain', peak: null })
  })
})
