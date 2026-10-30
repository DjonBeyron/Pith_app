import { describe, it, expect, vi } from 'vitest'
import { pickTakeMime, TAKE_MIMES } from './takeMime.js'
import { recordTake } from './takeRecorder.js'
import { playTakeBuffer } from './takeBuffer.js'

// Формат дубля: на iPhone MediaRecorder писал webm/opus, а <audio> его не играл (NotSupportedError) — выбираем формат, который И пишется, И играет
const Rec = supported => ({ isTypeSupported: t => supported.includes(t) })
const can = playable => t => (playable.includes(t) ? 'maybe' : '')

describe('pickTakeMime', () => {
  it('порядок списка: mp4, mp4/aac, aac, webm/opus, webm', () => {
    expect(TAKE_MIMES).toEqual(['audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm'])
  })
  it('iPhone: пишет и mp4, и webm/opus, а играет только mp4 — берём mp4', () => {
    const r = pickTakeMime({ Recorder: Rec(['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']), canPlayType: can(['audio/mp4']) })
    expect(r.mimeType).toBe('audio/mp4'); expect(r.why).toContain('пишется и играет')
  })
  it('webm пишется первым в списке устройства, но не играет — пропускается; играет — берётся', () => {
    expect(pickTakeMime({ Recorder: Rec(['audio/webm;codecs=opus', 'audio/webm']), canPlayType: can(['audio/webm']) }).mimeType).toBe('audio/webm')
    expect(pickTakeMime({ Recorder: Rec(['audio/webm;codecs=opus', 'audio/webm']), canPlayType: can(['audio/webm;codecs=opus', 'audio/webm']) }).mimeType).toBe('audio/webm;codecs=opus')
  })
  it('пишется, но ничего не играет — первый пишущийся (играть будем буфером); ничего не пишется / нет isTypeSupported — формат по умолчанию', () => {
    const r = pickTakeMime({ Recorder: Rec(['audio/webm;codecs=opus', 'audio/webm']), canPlayType: can([]) })
    expect(r.mimeType).toBe('audio/webm;codecs=opus'); expect(r.why).toContain('буфером')
    expect(pickTakeMime({ Recorder: Rec([]), canPlayType: can([]) }).mimeType).toBeNull()
    expect(pickTakeMime({ Recorder: {}, canPlayType: can([]) }).mimeType).toBeNull()
    expect(pickTakeMime({ Recorder: Rec(['audio/mp4']), canPlayType: () => { throw new Error('x') } }).mimeType).toBe('audio/mp4') // canPlayType упал — как «не играет»: пишем пишущийся, играем буфером
  })
})

describe('recordTake: формат и журнал rec-start', () => {
  class Fake {
    static supported = ['audio/webm;codecs=opus', 'audio/mp4']
    static isTypeSupported(t) { return Fake.supported.includes(t) }
    constructor(stream, opts) { this.opts = opts; this.state = 'inactive'; this.mimeType = opts?.mimeType ?? ''; Fake.last = this }
    start() { this.state = 'recording' }
    stop() {}
  }
  const stream = { getTracks: () => [{ readyState: 'live' }] }
  it('без mimeType выбирается формат, который играет; в журнал пишется тип и причина', () => {
    const log = vi.fn()
    recordTake({ stream, log }, { Recorder: Fake, analyze: async () => null, canPlayType: can(['audio/mp4']) })
    expect(Fake.last.opts).toEqual({ mimeType: 'audio/mp4' })
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toContain('rec-start mime=audio/mp4')
    expect(log.mock.calls[0][0]).toContain('пишется и играет')
  })
  it('mimeType задан вызывающим — не перебиваем (журнал: «задан вызывающим»)', () => {
    const log = vi.fn()
    recordTake({ stream, log, mimeType: 'audio/webm;codecs=opus' }, { Recorder: Fake, analyze: async () => null, canPlayType: can(['audio/mp4']) })
    expect(Fake.last.opts).toEqual({ mimeType: 'audio/webm;codecs=opus' })
    expect(log.mock.calls[0][0]).toContain('задан вызывающим')
  })
})

describe('playTakeBuffer: запасной путь воспроизведения', () => {
  const blob = { size: 3 }
  const buffer = { duration: 0.01 }
  it('декодировал и сыграл: onEnd → ended; буфер декодируется один раз на файл', async () => {
    const decode = vi.fn(async () => buffer)
    const play = vi.fn((b, o) => { queueMicrotask(o.onEnd); return true })
    expect(await playTakeBuffer(blob, { decode, play })).toBe('ended')
    expect(await playTakeBuffer(blob, { decode, play })).toBe('ended')
    expect(decode).toHaveBeenCalledTimes(1)
  })
  it('не декодируется / нет контекста игры / контекст не запустился / нет записи — unsupported', async () => {
    expect(await playTakeBuffer({ size: 1 }, { decode: async () => { throw new Error('EncodingError') }, play: () => true })).toBe('unsupported')
    expect(await playTakeBuffer({ size: 2 }, { decode: async () => buffer, play: () => false })).toBe('unsupported')
    expect(await playTakeBuffer({ size: 3 }, { decode: async () => buffer, play: (b, o) => { o.onResult({ play: 'ctx-stuck' }); return true } })).toBe('unsupported')
    expect(await playTakeBuffer(null)).toBe('unsupported')
  })
  it('onEnd не пришёл — запасной выход по длине звука', async () => {
    expect(await playTakeBuffer({ size: 4 }, { decode: async () => buffer, play: () => true, tailMs: 5 })).toBe('ended')
  })
})
