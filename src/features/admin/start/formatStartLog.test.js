import { describe, it, expect } from 'vitest'
import { formatStartLog, formatStartLogs, startSummary } from './formatStartLog.js'
import { goodRec, badRec } from './startLogFixtures.js'

describe('formatStartLog', () => {
  const text = formatStartLog(goodRec())
  const lines = text.split('\n')

  it('заголовок с контекстом', () => {
    expect(lines[0]).toBe('=== СТАРТ 2026-10-09T10:00:00.000Z · v2.0.9 · ВАРИАНТ=? · оболочка=? · ХОЛОДНЫЙ (№1 в сессии) ===')
    expect(text).toContain('навигация: navigate · redirects=0 · transferSize=900')
    expect(text).toContain('navigator.standalone=да · display-mode:standalone=да')
    expect(text).toContain('screen=402x874@3x · окно=402x814 · safe-area(t/r/b/l)=59px/0px/34px/0px · orientation=portrait-primary')
    expect(text).toContain('dark=да · reducedMotion=нет · sw-controller=activated · location.reload=unforgeable')
    expect(text).toContain('итог: первый кадр 40 мс · сплэш ушёл 1200 мс · CLS 0 · jank 0')
    const withShell = shell => formatStartLog((r => ({ ...r, ctx: { ...r.ctx, ...shell } }))(goodRec()))
    expect(withShell({ shell: 'cache', shellBuild: '2.0.9-ab12cd34', shellMs: 3 })).toContain('оболочка=cache (build 2.0.9-ab12cd34) 3мс')
    expect(withShell({ shell: 'network', shellWhy: 'nocache' })).toContain('оболочка=network [nocache]')
  })

  it('«Подозрения» стоят над таймлайном', () => {
    const s = lines.findIndex(l => l.startsWith('--- ПОДОЗРЕНИЯ'))
    const t = lines.findIndex(l => l.startsWith('--- ТАЙМЛАЙН'))
    expect(s).toBeGreaterThan(0)
    expect(t).toBeGreaterThan(s)
    expect(lines[s + 1]).toBe('нет')
  })

  it('таймлайн: `t=…ms | событие | детали`, серия tick схлопнута, журнал сплэша вмешан по времени', () => {
    expect(lines).toContain('t=40ms | raf-first | ')
    expect(lines).toContain('t=3ms | start | rs=loading')
    expect(lines).toContain('t=56ms | sample | fd=0.3')
    expect(lines).toContain('t=100..300ms | tick | без изменений (x3)')
    expect(lines).toContain('t=1200ms | splash-log | splash: улетает')
    const idx = l => lines.indexOf(l)
    expect(idx('t=3ms | start | rs=loading')).toBeLessThan(idx('t=40ms | raf-first | '))
    expect(idx('t=1200ms | splash-log | splash: улетает')).toBeLessThan(idx('t=1216ms | sample | so=0.5'))
  })

  it('подозрительный старт: список с пометками ! и тёплый заголовок', () => {
    const t = formatStartLog(badRec(), goodRec())
    expect(t).toContain('ТЁПЛЫЙ (загрузка №2 в этой сессии)')
    expect(t).toMatch(/^! t=150ms \| resize \|/m)
    expect(t).toMatch(/^i t=270ms \| jank \| просадка кадра 55 мс/m)
    expect(t).toContain('с прошлого старта: 5 мин')
  })

  it('несколько стартов подряд: старые первыми, разделены пустыми строками', () => {
    const all = formatStartLogs([goodRec(), badRec()])
    expect(all.indexOf('10:00:00.000Z')).toBeLessThan(all.indexOf('10:05:00.000Z'))
    expect(all.match(/^=== СТАРТ/gm)).toHaveLength(2)
    expect(all).toContain('\n\n\n=== СТАРТ')
    expect(all).toContain('прошлый старт: navigate') // у второго старта «прошлый» передан
  })

  it('пустая и «плохая» запись не падает', () => {
    expect(() => formatStartLog({ id: 'x', ev: [] })).not.toThrow()
    expect(formatStartLog({ id: 'x', ev: [] })).toContain('первый кадр —')
  })
})

describe('startSummary (строка списка)', () => {
  it('итоговые поля: холодный/тёплый, навигация, standalone, сплэш, CLS, первый кадр, jank', () => {
    const s = startSummary(goodRec())
    expect(s).toMatchObject({ launch: 'холодный', nav: 'navigate', standalone: true, warns: 0 })
    expect(s.parts).toEqual(['сплэш ушёл на 1200 мс', 'CLS 0', 'первый кадр 40 мс', 'jank 0'])
    const b = startSummary(badRec())
    expect(b.launch).toBe('тёплый')
    expect(b.warns).toBeGreaterThan(5)
    expect(b.parts[3]).toBe('jank 2 (до 120 мс)')
  })
})
