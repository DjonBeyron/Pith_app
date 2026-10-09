import { describe, it, expect } from 'vitest'
import { formatStartShort } from './formatStartShort.js'
import { formatStartLog, formatStartLogs } from './formatStartLog.js'
import { jumpRec, goodRec } from './startLogFixtures.js'

describe('formatStartShort: «Скопировать коротко»', () => {
  const text = formatStartShort(jumpRec())
  const lines = text.split('\n')

  it('≤ 6000 символов: контекст (3 строки), итог, подозрения, окно вокруг ухода сплэша', () => {
    expect(text.length).toBeLessThanOrEqual(6000)
    expect(lines[0]).toContain('СТАРТ 2026-10-09T11:00:00.000Z')
    expect(lines[1]).toContain('safe-area(t/r/b/l) 0px/0px/0px/0px')
    expect(lines[2]).toContain('сплэш ушёл 3640 мс')
    expect(text).toContain('--- ПОДОЗРЕНИЯ')
    expect(text).toContain('! t=2400ms | safe-area |')
    expect(text).toContain('--- ТАЙМЛАЙН: окно [уход сплэша −300 … +2000]')
  })

  it('в таймлайне: момент safe-area (вне окна), окно растворения, события приложения; ранние tick и пустые кадры не лезут', () => {
    expect(text).toContain('t=2400ms | sample | sa=0px/0px/34px/0px nv=0,738,402x74/fixed')
    expect(text).toContain('t=3624ms | mark:pithyReady | первый кадр видео')
    expect(text).toContain('| sample | so=0.97 dt=16')
    expect(text).toContain('t=5000ms | sab-freeze | 34px')
    expect(text).not.toContain('t=1456ms | tick')
    expect(text).not.toMatch(/t=1356ms \| sample \| fd=1/)
  })

  it('одинаковые подряд строки схлопнуты (x N)', () => {
    const r = jumpRec()
    r.ev.push([4100, 'sample', 'dt=16'], [4110, 'sample', 'dt=16'], [4120, 'sample', 'dt=16'])
    expect(formatStartShort(r)).toMatch(/t=4100\.\.4120ms \| sample \| dt=16 \(x3\)/)
  })

  it('длинный журнал сужает окно и не превышает лимит', () => {
    const r = jumpRec()
    for (let i = 0; i < 400; i++) r.ev.push([3700 + i * 3, 'sample', `so=0.${i} dt=${16 + (i % 9)} vr=0,${i},402x700`])
    const t = formatStartShort(r)
    expect(t.length).toBeLessThanOrEqual(6000)
    expect(t).toContain('--- ПОДОЗРЕНИЯ')
  })

  it('без ухода сплэша — окно от начала до 4 с, не падает', () => {
    const r = goodRec(); r.ev = r.ev.filter(e => e[1] !== 'splash-gone'); r.splash = []
    expect(() => formatStartShort(r)).not.toThrow()
  })
})

describe('«Скопировать все» компактный', () => {
  it('tick реже, одинаковые подряд строки схлопнуты — короче полного отчёта одного старта', () => {
    const r = jumpRec()
    for (let i = 0; i < 40; i++) r.ev.push([4400 + i * 100, 'tick', '='], [4400 + i * 100 + 50, 'sample', 'dt=16'])
    const full = formatStartLog(r)
    const all = formatStartLogs([r])
    expect(all.length).toBeLessThan(full.length)
    expect(all).toMatch(/\| sample \| dt=16 \(x\d+\)|t=\d+\.\.\d+ms \| tick/)
    expect(all.match(/\| tick \|/g).length).toBeLessThan(full.match(/\| tick \|/g).length)
  })
})
