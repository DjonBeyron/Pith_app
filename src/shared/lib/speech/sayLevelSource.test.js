import { describe, it, expect, vi } from 'vitest'
import { createLevelSource } from './sayLevelSource.js'

// Ручной rAF: кадры крутим сами
function fakeRaf() {
  let next = 1
  const q = new Map()
  return {
    raf: cb => { const id = next++; q.set(id, cb); return id },
    caf: id => q.delete(id),
    frame: t => { const cbs = [...q.values()]; q.clear(); cbs.forEach(cb => cb(t)) },
    pending: () => q.size,
  }
}

describe('createLevelSource — заменяемый источник уровня (подписка → значение каждый кадр)', () => {
  it('без подписчиков цикла нет; первый подписчик запускает ОДИН rAF-цикл на всех; последний отписавшийся останавливает его', () => {
    const f = fakeRaf()
    const src = createLevelSource(() => 0.5, f)
    expect(f.pending()).toBe(0)
    const a = vi.fn(), b = vi.fn()
    const offA = src.subscribe(a)
    const offB = src.subscribe(b)
    expect(f.pending()).toBe(1)
    expect(src.size()).toBe(2)
    f.frame(16)
    expect(a).toHaveBeenCalledWith(0.5, 16)
    expect(b).toHaveBeenCalledWith(0.5, 16)
    expect(f.pending()).toBe(1) // цикл продолжается
    offA()
    f.frame(32)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(2)
    offB()
    expect(f.pending()).toBe(0)
    expect(src.size()).toBe(0)
    src.subscribe(a) // подписка после остановки снова запускает цикл
    expect(f.pending()).toBe(1)
  })

  it('значение читается КАЖДЫЙ кадр с меткой кадра и обрезается до 0..1; мусор и исключения источника дают 0', () => {
    const f = fakeRaf()
    const seen = []
    let v = 0.25
    const src = createLevelSource(t => { seen.push(t); return v }, f)
    const got = []
    src.subscribe(level => got.push(level))
    f.frame(10); v = 7; f.frame(26); v = -3; f.frame(42); v = NaN; f.frame(58)
    expect(seen).toEqual([10, 26, 42, 58])
    expect(got).toEqual([0.25, 1, 0, 0])
    const bad = createLevelSource(() => { throw new Error('boom') }, f)
    const out = vi.fn()
    bad.subscribe(out)
    expect(() => f.frame(1)).not.toThrow()
    expect(out).toHaveBeenCalledWith(0, 1)
  })

  it('источник заменяем: тот же интерфейс для синтетического уровня, реального RMS и будущего Vosk; подписчик может отписаться изнутри кадра', () => {
    const f = fakeRaf()
    const synthetic = createLevelSource(() => 0.2, f)
    const vosk = createLevelSource(() => 0.9, f) // точка подключения Vosk: read = RMS его аудиопотока
    const out = []
    for (const s of [synthetic, vosk]) { const off = s.subscribe(l => { out.push(l); off() }); f.frame(1) }
    expect(out).toEqual([0.2, 0.9])
    expect(f.pending()).toBe(0)
  })
})
