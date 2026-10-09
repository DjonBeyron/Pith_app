import { describe, it, expect } from 'vitest'
import { analyzeStartLog } from './analyzeStartLog.js'
import { goodRec, badRec, CTX } from './startLogFixtures.js'

const codes = r => analyzeStartLog(r).suspects.map(s => s.code)
const warns = r => analyzeStartLog(r).suspects.filter(s => s.level === 'warn')

describe('analyzeStartLog: здоровый старт', () => {
  it('подозрений нет', () => {
    expect(warns(goodRec())).toEqual([])
  })
  it('итоги: первый кадр, уход сплэша, CLS, jank', () => {
    const { stats } = analyzeStartLog(goodRec())
    expect(stats).toMatchObject({ firstFrame: 40, splashGone: 1200, cls: 0, jank: 0, jankMax: 0, longtasks: 0, errors: 0 })
  })
  it('уход сплэша берётся из журнала сплэша, если события splash-gone нет', () => {
    const r = goodRec(); r.ev = r.ev.filter(e => e[1] !== 'splash-gone')
    expect(analyzeStartLog(r).stats.splashGone).toBe(1200)
  })
})

describe('analyzeStartLog: подозрительные места', () => {
  const bad = analyzeStartLog(badRec())
  const byCode = c => bad.suspects.filter(s => s.code === c)

  it('смена цвета фона и нечёрный фон в первом кадре', () => {
    const msgs = byCode('color').map(s => s.text)
    expect(msgs.some(m => /не чёрный/.test(m))).toBe(true)
    expect(msgs.some(m => /html: rgb\(11,13,16\) -> rgb\(0,0,0\)/.test(m))).toBe(true)
  })
  it('скачок прозрачности лого за один кадр и сдвиг лого', () => {
    expect(byCode('opacity-jump')[0].text).toContain('0 -> 1')
    expect(byCode('logo-move')[0].text).toContain('163,376,92x92 -> 163,346,92x92')
  })
  it('layout-shift >0 (без недавнего ввода) и итоговая сумма; сдвиг с recentInput не считается', () => {
    expect(byCode('cls')).toHaveLength(1)
    expect(byCode('cls')[0].text).toContain('0.0423')
    expect(bad.stats.cls).toBe(0.0423)
  })
  it('resize после первого кадра — warn', () => {
    expect(byCode('resize')[0]).toMatchObject({ level: 'warn', t: 150 })
  })
  it('pageshow persisted, тип навигации reload, controllerchange до 3 с, offline/online до 3 с', () => {
    expect(byCode('bfcache')).toHaveLength(1)
    expect(byCode('nav')[0].text).toContain('reload')
    expect(byCode('sw-ctrl').map(s => s.level)).toEqual(['warn', 'info']) // 800 мс — подозрительно, 4000 мс — нет
    expect(byCode('net').map(s => s.level)).toEqual(['warn', 'warn'])
  })
  it('jank (≥80 мс — warn, меньше — info), longtask, ошибки, beforeunload, visibilitychange', () => {
    expect(byCode('jank').map(s => s.level)).toEqual(['warn', 'info'])
    expect(byCode('longtask')[0].level).toBe('warn')
    expect(byCode('error')[0].text).toContain('boom')
    expect(byCode('unload')).toHaveLength(1)
    expect(byCode('vis')[0].text).toContain('hidden')
    expect(bad.stats.jank).toBe(2)
    expect(bad.stats.jankMax).toBe(120)
  })
  it('сплэш уходит, а #root пуст — пустой кадр; шрифты позже ухода сплэша', () => {
    expect(byCode('blank')).toHaveLength(1)
    const r = goodRec(); r.ev.push([1300, 'sample', 'fn=loading'])
    expect(codes(r)).toContain('fonts-late')
  })
  it('экран связи на старте и резкий обрыв сплэша', () => {
    const r = goodRec(); r.ev.push([500, 'sample', 'ng=o'])
    expect(codes(r)).toContain('net-screen')
    const r2 = goodRec(); r2.ev = r2.ev.filter(e => !/so=0\.5|so=0\.1/.test(e[2])); r2.ev = r2.ev.map(e => (e[2] === 'so=-' ? [e[0], e[1], 'so=- rt=1'] : e))
    expect(codes(r2)).toContain('splash-cut')
  })
  it('сравнение с предыдущим стартом: тип навигации в сообщении', () => {
    const r = goodRec(); r.ctx = { ...CTX, nav: 'reload' }
    const s = analyzeStartLog(r, goodRec()).suspects.find(x => x.code === 'nav')
    expect(s.text).toContain('прошлый старт: navigate')
  })
  it('контекст: тёплый старт, не PWA, скрытый старт, редиректы, safe-area сменилась', () => {
    const r = goodRec(); r.ctx = { ...CTX, cold: false, n: 3, sa: false, dm: false, vis: 'hidden hidden', rc: 1 }
    r.ev.push([6000, 'safe-changed', '59px/0px/0px/0px'])
    const c = codes(r)
    for (const k of ['warm', 'not-pwa', 'vis', 'redirect', 'safe-area']) expect(c).toContain(k)
  })
  it('обрезанный журнал помечается', () => {
    expect(codes(goodRec({ cut: { sample: 12 }, drop: { resize: 3 } }))).toContain('trimmed')
  })
  it('подозрения отсортированы по времени, внутри момента warn раньше info', () => {
    const t = bad.suspects.map(s => s.t)
    expect([...t].sort((a, b) => a - b)).toEqual(t)
  })
  it('пустая запись не падает', () => {
    expect(() => analyzeStartLog({ ev: [], ctx: {} })).not.toThrow()
    expect(analyzeStartLog({ ev: [] }).stats.firstFrame).toBeNull()
  })
})
