import { describe, it, expect } from 'vitest'
import { firstHeadScript, makeEnv, boot, evOf as of } from './startLogHarness.js'

const KEY = 'pithy_start_logs_v1'
const SCRIPT = firstHeadScript()

describe('start-log: хранение (кольцо, размер, сбои)', () => {
  it('через 6 с запись сохранена в localStorage и в window.__startLog, ничего не отправлено', () => {
    const env = boot({ splashLog: ['[0.04] splash: первый кадр', '[1.20] splash: улетает'] })
    env.advance(5900)
    expect(env.saved()).toBeNull()
    env.advance(200)
    const list = env.saved()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ v: 1, end: 't6000', id: '2026-10-09T10:00:00.000Z' })
    expect(list[0].splash).toEqual(['[0.04] splash: первый кадр', '[1.20] splash: улетает'])
    expect(JSON.stringify(list[0]).length).toBeLessThan(24000)
    expect(env.net).toEqual([])
  })

  it('медленные ресурсы попадают в журнал в конце', () => {
    const env = boot({ resources: [{ name: 'https://x.app/assets/index-1.js', duration: 900, startTime: 80, responseEnd: 980, transferSize: 5000 }, { name: 'https://x/fast.js', duration: 10, startTime: 0, responseEnd: 10 }] })
    env.advance(1000); env.win.fire('pithy:splash-gone'); env.advance(2200) // итог пишется, когда семплер закончил (сплэш ушёл + 2 с)
    const r = of(env, 'res-slow')
    expect(r).toHaveLength(1)
    expect(r[0][2]).toBe('/assets/index-1.js 80>980 5000B')
  })

  it('кольцо: после 10 стартов остаётся 8 последних; gap считается от предыдущего старта', () => {
    const storage = {}
    for (let i = 0; i < 10; i++) {
      const env = makeEnv({ storage, startEpoch: Date.parse('2026-10-09T10:00:00Z') + i * 60000 })
      env.run(SCRIPT.body); env.advance(6100)
    }
    const list = JSON.parse(storage[KEY])
    expect(list).toHaveLength(8)
    expect(list[0].id).toBe('2026-10-09T10:02:00.000Z')
    expect(list[7].id).toBe('2026-10-09T10:09:00.000Z')
    expect(list[7].gap).toBe(60000)
  })

  it('повторное сохранение той же записи (pagehide) заменяет её, а не дублирует', () => {
    const env = boot()
    env.advance(500); env.win.fire('pagehide', { persisted: false })
    expect(env.saved()).toHaveLength(1)
    expect(env.saved()[0].end).toBe('pagehide')
    env.advance(6000)
    expect(env.saved()).toHaveLength(1)
    expect(env.saved()[0].end).toBe('t6000')
  })

  it('свернули приложение (hidden) — запись сохраняется сразу; после 6 с пишутся только pagehide/vis/beforeunload', () => {
    const env = boot()
    env.advance(300); env.doc.hidden = true; env.doc.visibilityState = 'hidden'; env.doc.fire('visibilitychange')
    expect(env.saved()[0].end).toBe('hidden')
    env.win.fire('pithy:splash-gone')
    env.advance(6000)
    env.win.fire('resize'); env.win.fire('focus')
    expect(of(env, 'focus')).toHaveLength(0)
    expect(of(env, 'resize')).toHaveLength(0)
    env.win.fire('beforeunload'); env.win.fire('pagehide', { persisted: false })
    expect(of(env, 'beforeunload')).toHaveLength(1)
    expect(env.saved()[0].end).toBe('pagehide')
  })

  it('переполнение: лишнее прореживается (самые частые повторы), начало и конец остаются, размер ≤ 24 КБ', () => {
    const env = boot()
    env.advance(100)
    for (let i = 0; i < 400; i++) {
      env.win.innerHeight = 700 + (i % 7)
      env.win.fire('resize')
      env.win.fire('error', { message: 'шумная ошибка номер ' + 'x'.repeat(80) + i, filename: 'a.js', lineno: i })
      env.win.__startMark('m' + (i % 40), 'y'.repeat(150))
    }
    env.advance(6100)
    const rec = env.saved()[0]
    expect(JSON.stringify(rec).length).toBeLessThanOrEqual(24000)
    expect(rec.ev[0][1]).toBe('start')
    expect(rec.ev.length).toBeGreaterThan(20)
  })

  it('лишнее по числу событий отбрасывается с учётом в drop (resize ≤ 20)', () => {
    const env = boot()
    for (let i = 0; i < 50; i++) env.win.fire('resize')
    expect(of(env, 'resize')).toHaveLength(20)
    expect(env.log().drop.resize).toBe(30)
  })

  it('сбой localStorage (квота / приватный режим) ничего не ломает', () => {
    const env = boot({ throwOnSet: true })
    expect(() => env.advance(6200)).not.toThrow()
    expect(env.log().end).toBe('t6000')
  })

  it('битый JSON в хранилище не мешает', () => {
    const env = boot({ storage: { [KEY]: '{не json' } })
    env.advance(6100)
    expect(env.saved()).toHaveLength(1)
  })

  it('в окружении без API (нет performance/serviceWorker) скрипт тихо молчит', () => {
    const env = makeEnv({ noSw: true })
    env.win.performance = undefined
    expect(() => env.run(SCRIPT.body)).not.toThrow()
    const e2 = makeEnv({ noSw: true })
    e2.run(SCRIPT.body)
    expect(e2.log().ctx.sw).toBe('unsupported')
  })
})
