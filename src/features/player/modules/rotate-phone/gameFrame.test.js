import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { frameTick, frameDraw, frameCancel, frameQueued } from './gameFrame.js'

const src = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('gameFrame: общий цикл кадров игры', () => {
  let pending, calls
  const step = (ts = 16) => { const run = pending; pending = []; run.forEach(f => f(ts)) }
  beforeEach(() => { pending = []; calls = 0; vi.stubGlobal('requestAnimationFrame', f => { calls++; pending.push(f); return calls }); step() })
  afterEach(() => { step(); step(); vi.unstubAllGlobals() })

  it('один requestAnimationFrame на кадр, сколько бы циклов ни встало', () => {
    frameDraw(() => {}); frameTick(() => {}); frameTick(() => {}); frameDraw(() => {})
    expect(calls).toBe(1)
    expect(frameQueued()).toEqual([2, 2])
  })

  it('порядок в кадре: сначала логика кадра, потом чистые записи — независимо от порядка постановки', () => {
    const order = []
    frameDraw(() => order.push('draw-1')); frameTick(() => order.push('tick-1'))
    frameDraw(() => order.push('draw-2')); frameTick(() => order.push('tick-2'))
    step(100)
    expect(order).toEqual(['tick-1', 'tick-2', 'draw-1', 'draw-2'])
  })

  it('колбэк одноразовый и получает метку кадра; поставленный из кадра уходит в следующий', () => {
    const seen = []
    const loop = ts => { seen.push(ts); if (seen.length < 3) frameTick(loop) }
    frameTick(loop)
    step(10); expect(seen).toEqual([10])
    step(26); step(42); step(58)
    expect(seen).toEqual([10, 26, 42])
  })

  it('пустые очереди кадр не запрашивают: цикл спит', () => {
    frameTick(() => {})
    step()
    const before = calls
    step(); step()
    expect(calls).toBe(before)
    expect(frameQueued()).toEqual([0, 0])
  })

  it('frameCancel снимает колбэк — и заранее, и из другого колбэка того же кадра', () => {
    const ran = []
    const a = frameTick(() => ran.push('a'))
    frameCancel(a)
    let later = 0
    frameTick(() => { ran.push('tick'); frameCancel(later) })
    later = frameDraw(() => ran.push('draw'))
    step()
    expect(ran).toEqual(['tick'])
  })

  it('ошибка одного колбэка не останавливает остальные и уходит в общий перехват', () => {
    const errors = []
    vi.stubGlobal('reportError', e => errors.push(e.message))
    const ran = []
    frameTick(() => { throw new Error('сбой логики') }); frameTick(() => ran.push('tick')); frameDraw(() => ran.push('draw'))
    step()
    expect(ran).toEqual(['tick', 'draw'])
    expect(errors).toEqual(['сбой логики'])
  })

  it('циклы игры стоят на общем цикле, а не на своих requestAnimationFrame', () => {
    const pills = src('./useWordLanePills.js')
    expect(pills).not.toMatch(/[^.\w]requestAnimationFrame\(/)
    expect(pills).toContain('frameTick(tick)')
    expect(src('./useLaneConveyor.js')).toContain('raf: frameDraw')
    expect(src('./wordLaneCatVoice.js')).toContain('raf = frameDraw')
    expect(src('./wordLaneCatLook.js')).toContain('raf: frameDraw')
    for (const f of ['../../../pitrace/RaceMia.jsx', '../../../pitrace/boss/RaceBossScale.jsx']) {
      const s = src(f)
      expect(s).not.toMatch(/[^.\w]requestAnimationFrame\(/)
      expect(s).toContain('frameTick(frame)')
    }
  })
})
