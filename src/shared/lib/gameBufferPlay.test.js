import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { playGameBuffer, stopGameBuffers, playingCount, RESUME_WAIT_MS } from './gameBufferPlay.js'
import { getGameCtx, closeGameCtx } from './gameAudioCtx.js'
import { makeFakeWebAudio } from './fakeWebAudio.js'

// Проигрывание AudioBuffer: мгновенный старт (контекст running), громкость через gain, тон через playbackRate, ожидание resume() у прерванного контекста, «ctx-stuck», обрыв
let fake
const buf = { duration: 1.2 }
beforeEach(() => { fake = makeFakeWebAudio(); vi.stubGlobal('AudioContext', fake.Ctx) })
afterEach(() => { stopGameBuffers(); closeGameCtx(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('мгновенный старт', () => {
  it('контекст running: start(ctx.currentTime) вызывается СИНХРОННО; onStart — сразу; итог «started at +N мс» (N < 50)', () => {
    const onStart = vi.fn(), onResult = vi.fn()
    expect(playGameBuffer(buf, { onStart, onResult })).toBe(true)
    expect(fake.sources).toHaveLength(1)
    expect(fake.sources[0].startedAt).toBe(1.5) // ctx.currentTime
    expect(fake.sources[0].buffer).toBe(buf)
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onResult).toHaveBeenCalledTimes(1)
    const res = onResult.mock.calls[0][0]
    expect(res).toMatchObject({ play: 'started', ctx: 'running', source: 'buffer' })
    expect(res.ms).toBeLessThan(50)
  })

  it('нет буфера или Web Audio → false, ничего не создаётся', () => {
    expect(playGameBuffer(null)).toBe(false)
    vi.stubGlobal('AudioContext', undefined)
    closeGameCtx()
    expect(playGameBuffer(buf)).toBe(false)
  })
})

describe('громкость и тон', () => {
  it('громкость — GainNode (в том числе выше 1), отрицательная → 0; скорость — playbackRate (тон меняется вместе с ней)', () => {
    playGameBuffer(buf, { gain: 0.5 })
    playGameBuffer(buf, { gain: 2.5, rate: 1.26 })
    playGameBuffer(buf, { gain: -1, rate: 1.5 })
    playGameBuffer(buf, { rate: 0 })
    expect(fake.sources.map(s => s.gain)).toEqual([0.5, 2.5, 0, 1])
    expect(fake.sources.map(s => s.rate)).toEqual([1, 1.26, 1.5, 1]) // мусорная скорость → 1
  })
})

describe('контекст не running', () => {
  it('interrupted: resume() → после него старт; onStart и «started» приходят уже после resume', async () => {
    const c = getGameCtx(); c.setState('interrupted')
    const onStart = vi.fn(), onResult = vi.fn()
    expect(playGameBuffer(buf, { onStart, onResult })).toBe(true)
    expect(fake.sources).toHaveLength(0) // сразу не стартовал
    expect(onStart).not.toHaveBeenCalled()
    await Promise.resolve(); await Promise.resolve()
    expect(c.resumes).toBe(1)
    expect(fake.sources).toHaveLength(1)
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onResult.mock.calls[0][0]).toMatchObject({ play: 'started' })
  })

  it('resume() висит дольше RESUME_WAIT_MS — «ctx-stuck»: звука нет, onStart не будет (кот не открывает рот), и поздний resume() ничего не запускает', async () => {
    vi.useFakeTimers()
    fake.resumeMode = 'hang'
    const c = getGameCtx(); c.setState('interrupted')
    const onStart = vi.fn(), onResult = vi.fn()
    playGameBuffer(buf, { onStart, onResult })
    await vi.advanceTimersByTimeAsync(RESUME_WAIT_MS + 10)
    expect(onResult.mock.calls[0][0]).toMatchObject({ play: 'ctx-stuck', ctx: 'interrupted', error: 'AudioContext не запущен (interrupted)' })
    expect(onStart).not.toHaveBeenCalled()
    c.setState('running'); await vi.advanceTimersByTimeAsync(50)
    expect(fake.sources).toHaveLength(0)
    expect(onResult).toHaveBeenCalledTimes(1)
  })
})

describe('обрыв и ошибки', () => {
  it('stopGameBuffers обрывает всё идущее; конец звука отпускает узлы и зовёт onEnd', () => {
    const onEnd = vi.fn()
    playGameBuffer(buf, { onEnd }); playGameBuffer(buf)
    expect(playingCount()).toBe(2)
    fake.sources[0].onended()
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(playingCount()).toBe(1)
    stopGameBuffers()
    expect(playingCount()).toBe(0)
    expect(fake.sources[1].stopped).toBe(true)
  })

  it('исключение Web Audio при старте → «rejected» с именем ошибки, onStart не зовётся, исключения наружу нет', () => {
    const c = getGameCtx()
    c.createBufferSource = () => { throw new DOMException('нет', 'InvalidStateError') }
    const onStart = vi.fn(), onResult = vi.fn()
    expect(() => playGameBuffer(buf, { onStart, onResult })).not.toThrow()
    expect(onResult.mock.calls[0][0]).toMatchObject({ play: 'rejected', error: 'InvalidStateError' })
    expect(onStart).not.toHaveBeenCalled()
  })
})
