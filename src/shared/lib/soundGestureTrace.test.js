import { describe, it, expect } from 'vitest'
import { straceGesture, strace, straceLines, straceOutcome, mediaState } from './soundGestureTrace.js'

describe('трасса жеста звука (DBG)', () => {
  it('жест нумерует шаги заново, строки идут по порядку', () => {
    straceGesture('чип звука на видео')
    strace('unlock')
    strace('play')
    const l = straceLines().slice(-3)
    expect(l[0]).toContain('жест: чип звука на видео')
    expect(l[1]).toMatch(/#2 unlock/)
    expect(l[2]).toMatch(/#3 play/)
  })

  it('буфер ограничен 30 строками', () => {
    for (let i = 0; i < 50; i++) strace(`s${i}`)
    expect(straceLines().length).toBe(30)
  })

  it('исход play(): ok и отказ с именем ошибки', async () => {
    straceGesture('t')
    const el = { muted: false, volume: 1, paused: false, readyState: 4 }
    await straceOutcome('видео', Promise.resolve(), el)
    const bad = Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' }))
    await straceOutcome('сцена', bad, el).catch(() => {})
    await Promise.resolve()
    const txt = straceLines().join('\n')
    expect(txt).toContain('видео: play() ok')
    expect(txt).toContain('сцена: play() ОТКАЗ NotAllowedError')
    expect(mediaState(el)).toBe('muted=false vol=1 paused=false rs=4')
  })
})
