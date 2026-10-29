import { describe, it, expect, vi, afterEach } from 'vitest'
import { recordTake, releaseTake } from './takeRecorder.js'
import { voicedRms } from './mirrorRms.js'

// Подмена MediaRecorder: stop() отдаёт кусок звука и сообщает о конце, как настоящий
class FakeRecorder {
  static last = null
  static supported = ['audio/webm']
  static isTypeSupported(t) { return FakeRecorder.supported.includes(t) }
  constructor(stream, opts) { this.stream = stream; this.opts = opts; this.state = 'inactive'; this.mimeType = 'audio/webm'; this.data = [new Blob(['voice-bytes'])]; FakeRecorder.last = this }
  start() { this.state = 'recording' }
  stop() {
    if (this.state === 'inactive') return
    this.state = 'inactive'
    this.data.forEach(d => this.ondataavailable?.({ data: d }))
    this.onstop?.()
  }
}
const liveStream = () => ({ getTracks: () => [{ readyState: 'live' }] })
const deadStream = () => ({ getTracks: () => [{ readyState: 'ended' }] })
const analyze = async () => ({ durationMs: 2345, rms: 0.12 })

afterEach(() => { vi.useRealTimers(); FakeRecorder.last = null })

describe('recordTake', () => {
  it('stop → blob, objectURL, durationMs, rms; getUserMedia не зовётся (поток чужой)', async () => {
    const stream = liveStream()
    const rec = recordTake({ stream }, { Recorder: FakeRecorder, analyze })
    expect(rec.ok).toBe(true)
    expect(FakeRecorder.last.stream).toBe(stream)
    expect(FakeRecorder.last.state).toBe('recording')
    const take = await rec.stop()
    expect(take.blob).toBeInstanceOf(Blob)
    expect(take.blob.size).toBeGreaterThan(0)
    expect(take.url).toMatch(/^blob:/)
    expect(take.durationMs).toBe(2345)
    expect(take.rms).toBe(0.12)
    expect(await rec.stop()).toBe(take) // повторный stop — тот же дубль
    releaseTake(take)
  })
  it('нет декодирования — длительность по часам, rms 0', async () => {
    let t = 1000
    const rec = recordTake({ stream: liveStream() }, { Recorder: FakeRecorder, analyze: async () => null, now: () => (t += 1500) })
    const take = await rec.stop()
    expect(take.durationMs).toBeGreaterThan(0)
    expect(take.rms).toBe(0)
  })
  it('запись сама останавливается через maxMs — stop() потом отдаёт готовый дубль', async () => {
    vi.useFakeTimers()
    const rec = recordTake({ stream: liveStream(), maxMs: 4000 }, { Recorder: FakeRecorder, analyze })
    vi.advanceTimersByTime(3999)
    expect(FakeRecorder.last.state).toBe('recording')
    vi.advanceTimersByTime(2)
    expect(FakeRecorder.last.state).toBe('inactive')
    vi.useRealTimers()
    expect((await rec.stop()).durationMs).toBe(2345)
  })
  it('mimeType: поддерживаемый передаётся, неподдерживаемый отбрасывается', () => {
    recordTake({ stream: liveStream(), mimeType: 'audio/webm' }, { Recorder: FakeRecorder, analyze })
    expect(FakeRecorder.last.opts).toEqual({ mimeType: 'audio/webm' })
    recordTake({ stream: liveStream(), mimeType: 'audio/ogg' }, { Recorder: FakeRecorder, analyze })
    expect(FakeRecorder.last.opts).toBeUndefined()
  })
  it('cancel: запись остановлена, stop() отклоняется кодом cancelled, objectURL не создан', async () => {
    const create = vi.spyOn(URL, 'createObjectURL')
    const rec = recordTake({ stream: liveStream() }, { Recorder: FakeRecorder, analyze })
    rec.cancel()
    expect(FakeRecorder.last.state).toBe('inactive')
    await expect(rec.stop()).rejects.toMatchObject({ code: 'cancelled' })
    expect(create).not.toHaveBeenCalled()
    create.mockRestore()
  })
  it('нет MediaRecorder — ok false, stop() отклоняется no-recorder, recordTake не бросает', async () => {
    const rec = recordTake({ stream: liveStream() }, { Recorder: null })
    expect(rec).toMatchObject({ ok: false, error: 'no-recorder' })
    await expect(rec.stop()).rejects.toMatchObject({ code: 'no-recorder' })
    expect(() => rec.cancel()).not.toThrow()
  })
  it('поток мёртв или не передан — dead-stream', async () => {
    await expect(recordTake({ stream: deadStream() }, { Recorder: FakeRecorder }).stop()).rejects.toMatchObject({ code: 'dead-stream' })
    await expect(recordTake({}, { Recorder: FakeRecorder }).stop()).rejects.toMatchObject({ code: 'dead-stream' })
  })
  it('пустая запись — empty; MediaRecorder бросил при создании — failed', async () => {
    class Empty extends FakeRecorder { constructor(...a) { super(...a); this.data = [] } }
    await expect(recordTake({ stream: liveStream() }, { Recorder: Empty, analyze }).stop()).rejects.toMatchObject({ code: 'empty' })
    class Boom { constructor() { throw new Error('nope') } }
    expect(recordTake({ stream: liveStream() }, { Recorder: Boom })).toMatchObject({ ok: false, error: 'failed' })
  })
  it('releaseTake отзывает objectURL и терпит пустое', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    releaseTake({ url: 'blob:x' })
    expect(revoke).toHaveBeenCalledWith('blob:x')
    expect(() => releaseTake(null)).not.toThrow()
    revoke.mockRestore()
  })
})

describe('voicedRms: средний RMS голоса без тишины', () => {
  const tone = (n, amp) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin(i * 0.3))
  it('тишина вокруг не занижает цифру; громче запись — больше RMS', () => {
    const quiet = Float32Array.from([...new Float32Array(8000), ...tone(8000, 0.1), ...new Float32Array(8000)])
    const solo = tone(8000, 0.1)
    expect(voicedRms(quiet, 16000)).toBeCloseTo(voicedRms(solo, 16000), 2)
    expect(voicedRms(tone(8000, 0.2), 16000)).toBeGreaterThan(voicedRms(solo, 16000) * 1.9)
  })
  it('шум комнаты и пустая запись — 0', () => {
    expect(voicedRms(tone(8000, 0.004), 16000)).toBe(0)
    expect(voicedRms(new Float32Array(0), 16000)).toBe(0)
  })
})
