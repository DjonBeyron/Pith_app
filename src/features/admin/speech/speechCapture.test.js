import { describe, it, expect } from 'vitest'
import {
  getCaptureConstraints, rmsFromBytes, nextPeak, toPercent, fmtCapture, captureLogFields,
  readCaptureMode, writeCaptureMode, CAPTURE_KEY, CAPTURE_MODES, DEFAULT_CAPTURE,
} from './speechCapture.js'
import { logReportLines } from './speechLog.js'

const memStore = (init = {}) => {
  const m = { ...init }
  return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, m }
}

describe('режимы → ограничения getUserMedia', () => {
  it('A: потока нет', () => { expect(getCaptureConstraints('plain')).toBeNull(); expect(getCaptureConstraints('zzz')).toBeNull() })
  it('B: AGC вкл, шумо- и эхоподавление выкл, моно', () => {
    expect(getCaptureConstraints('warm')).toEqual({ audio: { autoGainControl: true, noiseSuppression: false, echoCancellation: false, channelCount: 1 } })
  })
  it('C: AGC + шумо- и эхоподавление', () => {
    expect(getCaptureConstraints('warmns')).toEqual({ audio: { autoGainControl: true, noiseSuppression: true, echoCancellation: true, channelCount: 1 } })
  })
})

describe('rmsFromBytes / пик', () => {
  it('тишина (128) → 0, пусто → 0', () => {
    expect(rmsFromBytes(new Uint8Array(128).fill(128))).toBe(0)
    expect(rmsFromBytes(new Uint8Array(0))).toBe(0)
    expect(rmsFromBytes(null)).toBe(0)
  })
  it('полный размах (0/255 вперемешку) → ≈1, не больше 1', () => {
    const b = new Uint8Array(128).map((_, i) => (i % 2 ? 255 : 0))
    const r = rmsFromBytes(b)
    expect(r).toBeGreaterThan(0.99)
    expect(r).toBeLessThanOrEqual(1)
  })
  it('половинный размах ≈ 0.5', () => {
    const b = new Uint8Array(128).map((_, i) => (i % 2 ? 192 : 64))
    expect(rmsFromBytes(b)).toBeCloseTo(0.5, 2)
  })
  it('пик только растёт; проценты', () => {
    expect(nextPeak(0.2, 0.1)).toBe(0.2)
    expect(nextPeak(0.2, 0.3)).toBe(0.3)
    expect(toPercent(0.054)).toBe(5)
    expect(toPercent(null)).toBeNull()
    expect(toPercent(7)).toBe(100)
  })
})

describe('запоминание режима', () => {
  it('по умолчанию A; сохранённое читается; мусор → A; сломанное хранилище не бросает', () => {
    expect(readCaptureMode(memStore())).toBe(DEFAULT_CAPTURE)
    const st = memStore()
    writeCaptureMode('warm', st)
    expect(st.m[CAPTURE_KEY]).toBe('warm')
    expect(readCaptureMode(st)).toBe('warm')
    expect(readCaptureMode(memStore({ [CAPTURE_KEY]: 'x' }))).toBe('plain')
    const broken = { getItem() { throw new Error('no') }, setItem() { throw new Error('no') } }
    expect(readCaptureMode(broken)).toBe('plain')
    expect(() => writeCaptureMode('warm', broken)).not.toThrow()
    expect(CAPTURE_MODES).toEqual(['plain', 'warm', 'warmns'])
  })
})

describe('формат журнала', () => {
  it('поля и подпись', () => {
    expect(captureLogFields('plain', null)).toEqual({ capture: 'plain', peak: null, capError: null, agc: null })
    expect(captureLogFields('warm', { peak: 0.124, error: null, agc: true })).toEqual({ capture: 'warm', peak: 12, capError: null, agc: true })
    expect(fmtCapture({})).toBe('A')
    expect(fmtCapture({ capture: 'warm', peak: 12 })).toBe('B · пик 12%')
    expect(fmtCapture({ capture: 'warmns', peak: null, capError: 'NotAllowedError' })).toBe('C · ошибка NotAllowedError')
    expect(fmtCapture({ capture: 'warm', peak: 5, agc: false })).toContain('AGC не включился')
  })
  it('строка отчёта содержит режим, пик и уверенность', () => {
    const [line] = logReportLines([{ t: 1, mode: 'browser', capture: 'warm', peak: 5, conf: 83, outcome: 'ok', msResult: 900 }])
    expect(line).toContain('захват B · пик 5%')
    expect(line).toContain('уверенность 83%')
  })
})
