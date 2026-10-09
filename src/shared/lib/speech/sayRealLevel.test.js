import { describe, it, expect, vi } from 'vitest'
import {
  REAL_LEVEL_KEY, REAL_FLOOR, realConstraints, rmsOf, levelFromRms, isRealLevelOn, setRealLevelOn, realLevelLabel, createRealLevel, levelSource,
} from './sayRealLevel.js'

const store = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m } }
const tick = () => new Promise(r => setTimeout(r, 0))

function fakeEnv({ fail = null } = {}) {
  const track = { stopped: 0, stop() { this.stopped++ }, getSettings: () => ({ autoGainControl: true }) }
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] }
  const env = { track, stream, calls: [], ctxClosed: 0, bytes: new Uint8Array(256).fill(128), statuses: [] }
  env.getUserMedia = c => { env.calls.push(['gum', c]); return fail ? Promise.reject(Object.assign(new Error('x'), { name: fail })) : Promise.resolve(stream) }
  env.createAudioContext = () => {
    env.calls.push(['ctx'])
    return {
      state: 'running', resume() { env.calls.push(['resume']) }, close() { env.ctxClosed++; return Promise.resolve() },
      createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
      createAnalyser: () => ({ fftSize: 0, connect() {}, getByteTimeDomainData: buf => buf.set(env.bytes.subarray(0, buf.length)) }),
    }
  }
  env.onStatus = s => env.statuses.push(s)
  return env
}

describe('чистые части реального уровня', () => {
  it('ограничения: автоусиление ВКЛ, шумо- и эхоподавление ВЫКЛ (иначе гасят тихую речь)', () => {
    expect(realConstraints()).toEqual({ audio: { autoGainControl: true, noiseSuppression: false, echoCancellation: false } })
  })

  it('RMS: тишина (128) = 0, полный размах = 1, пусто = 0', () => {
    expect(rmsOf(new Uint8Array(64).fill(128))).toBe(0)
    expect(rmsOf(Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 255 : 1)))).toBeCloseTo(0.99, 1)
    expect(rmsOf([])).toBe(0)
  })

  it('уровень: шум комнаты ниже пола = 0, тихая речь заметна, громкая — до 1, монотонно', () => {
    expect(levelFromRms(0)).toBe(0)
    expect(levelFromRms(REAL_FLOOR)).toBe(0)
    expect(levelFromRms(0.05)).toBeGreaterThan(0.3)
    expect(levelFromRms(0.3)).toBe(1)
    let prev = 0
    for (let r = 0; r <= 0.3; r += 0.01) { const v = levelFromRms(r); expect(v).toBeGreaterThanOrEqual(prev); prev = v }
  })

  it('флаг localStorage: по умолчанию ВЫКЛЮЧЕНО; "1" — включено; снимается; хранилище недоступно — выключено', () => {
    const st = store()
    expect(isRealLevelOn(st)).toBe(false)
    setRealLevelOn(true, st)
    expect(st.m.get(REAL_LEVEL_KEY)).toBe('1')
    expect(isRealLevelOn(st)).toBe(true)
    setRealLevelOn(false, st)
    expect(isRealLevelOn(st)).toBe(false)
    const broken = { getItem() { throw new Error('x') }, setItem() { throw new Error('x') }, removeItem() { throw new Error('x') } }
    expect(isRealLevelOn(broken)).toBe(false)
    expect(() => setRealLevelOn(true, broken)).not.toThrow()
    expect(REAL_LEVEL_KEY).toBe('pithy_say_real_level_v1')
  })

  it('пометка для админа: выкл / вкл / ошибка → синтетический', () => {
    expect(realLevelLabel(false, 'live')).toBe('выкл')
    expect(realLevelLabel(true, 'live')).toBe('вкл')
    expect(realLevelLabel(true, 'opening')).toBe('вкл')
    expect(realLevelLabel(true, 'error:NotAllowedError')).toBe('ошибка NotAllowedError → синтетический')
  })
})

describe('createRealLevel — поток открывается синхронно, закрывается всегда', () => {
  it('open(): getUserMedia и AudioContext вызваны СИНХРОННО (до await), с нужными ограничениями; после промиса — live и уровень читается из анализатора', async () => {
    const env = fakeEnv()
    const r = createRealLevel(env)
    r.open()
    expect(env.calls.map(c => c[0])).toEqual(['ctx', 'resume', 'gum']) // в жесте, не дожидаясь промиса
    expect(env.calls[2][1]).toEqual(realConstraints())
    expect(r.status()).toBe('opening')
    expect(r.isLive()).toBe(false)
    expect(r.level()).toBe(0)
    await tick()
    expect(r.status()).toBe('live')
    expect(r.isLive()).toBe(true)
    expect(r.level()).toBe(0) // тишина
    env.bytes.fill(128); for (let i = 0; i < 256; i += 2) env.bytes[i] = 200 // громкий сигнал
    expect(r.level()).toBeGreaterThan(0.8) // мгновенно: считается в момент вызова, без таймера и сглаживания
    env.bytes.fill(128)
    expect(r.level()).toBe(0)
  })

  it('close(): треки остановлены, AudioContext закрыт, статус off; повторный close безвреден', async () => {
    const env = fakeEnv()
    const r = createRealLevel(env)
    r.open(); await tick()
    r.close(); r.close()
    expect(env.track.stopped).toBe(1)
    expect(env.ctxClosed).toBe(1)
    expect(r.status()).toBe('off')
    expect(r.level()).toBe(0)
  })

  it('попытка кончилась РАНЬШЕ, чем пришёл поток: поток тут же останавливается, не остаётся открытым', async () => {
    const env = fakeEnv()
    const r = createRealLevel(env)
    r.open(); r.close()
    await tick()
    expect(env.track.stopped).toBe(1)
    expect(env.ctxClosed).toBe(1)
    expect(r.isLive()).toBe(false)
  })

  it('новая попытка закрывает прежний поток (один поток за раз)', async () => {
    const env = fakeEnv()
    const r = createRealLevel(env)
    r.open(); await tick()
    r.open(); await tick()
    expect(env.track.stopped).toBe(1)
    expect(env.ctxClosed).toBe(1)
    expect(r.isLive()).toBe(true)
  })

  it('ошибка getUserMedia: тихий откат (status error:Имя, уровень 0, isLive=false) и пометка в onStatus; бросок синхронно — то же', async () => {
    const env = fakeEnv({ fail: 'NotAllowedError' })
    const r = createRealLevel(env)
    r.open(); await tick()
    expect(r.status()).toBe('error:NotAllowedError')
    expect(r.isLive()).toBe(false)
    expect(env.statuses).toEqual(['opening', 'error:NotAllowedError'])
    const thrown = createRealLevel({ ...fakeEnv(), getUserMedia: () => { throw new Error('no mediaDevices') } })
    expect(() => thrown.open()).not.toThrow()
    await tick()
    expect(thrown.status()).toMatch(/^error:/)
  })
})

describe('levelSource — реальный, пока поток живой; иначе синтетический', () => {
  it('откат на синтетический при любом состоянии, кроме live', async () => {
    const voice = { ringLevel: vi.fn(() => 0.42) }
    const env = fakeEnv()
    const real = createRealLevel(env)
    const src = levelSource(voice, real)
    expect(src.ringLevel(100)).toBe(0.42) // потока нет
    real.open()
    expect(src.ringLevel(100)).toBe(0.42) // ещё открывается
    await tick()
    env.bytes.fill(128); for (let i = 0; i < 256; i += 2) env.bytes[i] = 190
    expect(src.ringLevel(100)).toBeGreaterThan(0.5)
    expect(voice.ringLevel).toHaveBeenCalledTimes(2)
    real.close()
    expect(src.ringLevel(100)).toBe(0.42)
  })
})
