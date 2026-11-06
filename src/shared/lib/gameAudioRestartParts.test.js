import { describe, it, expect, vi, afterEach } from 'vitest'
import { getGameCtx, closeGameCtx, recreateGameCtx, onGameCtxState, peekGameCtx } from './gameAudioCtx.js'
import { createCaptureContext, releaseCapture, captureStates, closeAllCaptures } from './vosk/voskCapture.js'
import { openGameMic, closeGameMic, onGameMicLost, micTracksLine } from './gameMic.js'
import { makeFakeWebAudio } from './fakeWebAudio.js'

// Детали, на которые опирается жёсткий перезапуск (gameAudioRestart.js): подписка на смену состояния игрового контекста, реестр контекстов захвата Vosk (закрыть все), события дорожки микрофона.
const store = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) } }
afterEach(() => { closeGameCtx(); closeGameMic(); vi.unstubAllGlobals() })

describe('gameAudioCtx: onGameCtxState / peekGameCtx', () => {
  it('смена состояния текущего контекста доходит до подписчика; своё закрытие и пересоздание — нет', () => {
    const fake = makeFakeWebAudio({ state: 'running' })
    vi.stubGlobal('AudioContext', fake.Ctx); vi.stubGlobal('localStorage', store())
    const seen = []
    const off = onGameCtxState(s => seen.push(s))
    expect(peekGameCtx()).toBeNull() // peek контекст не создаёт
    const c = getGameCtx()
    expect(peekGameCtx()).toBe(c)
    c.setState('interrupted')
    expect(seen).toEqual(['interrupted'])
    recreateGameCtx('тест')
    expect(c.closed).toBe(true); expect(seen).toEqual(['interrupted']) // onstatechange снят до close
    off(); getGameCtx().setState('suspended'); expect(seen).toEqual(['interrupted'])
  })
})

describe('voskCapture: реестр контекстов захвата', () => {
  it('созданный контекст в реестре до освобождения; closeAllCaptures закрывает оставшиеся', () => {
    class Ctx { constructor() { this.state = 'interrupted'; this.close = vi.fn(() => Promise.resolve()) } resume() { return Promise.resolve() } }
    const a = createCaptureContext(Ctx, store()), b = createCaptureContext(Ctx, store())
    expect(captureStates()).toEqual(['interrupted', 'interrupted'])
    releaseCapture({ ctx: a, log: () => {} })
    expect(captureStates()).toEqual(['interrupted'])
    expect(closeAllCaptures()).toBe(1); expect(b.close).toHaveBeenCalled(); expect(captureStates()).toEqual([])
  })
})

describe('gameMic: события дорожки и строка состояния', () => {
  it('mute / ended дорожки текущего потока → подписчик; после закрытия потока — нет', async () => {
    const L = {}
    const t = { readyState: 'live', muted: false, enabled: true, stop() { this.readyState = 'ended' }, addEventListener: (k, h) => { L[k] = h }, getSettings: () => ({}) }
    const s = { getTracks: () => [t] }
    vi.stubGlobal('navigator', { userAgent: 'x', mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(s) } })
    const got = []
    const off = onGameMicLost(k => got.push(k))
    expect(micTracksLine()).toBe('нет потока')
    expect(await openGameMic()).toBe('granted')
    expect(micTracksLine()).toBe('live')
    t.muted = true; L.mute(); expect(got).toEqual(['mute']); expect(micTracksLine()).toBe('live/muted')
    closeGameMic(); L.ended(); expect(got).toEqual(['mute'])
    off()
  })
})
