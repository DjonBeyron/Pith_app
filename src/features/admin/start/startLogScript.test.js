import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { readIndex, firstHeadScript, makeEnv, boot, evTypes as types, evOf as of } from './startLogHarness.js'

const SCRIPT = firstHeadScript()

describe('start-log: страж index.html', () => {
  const html = readIndex()

  it('это ПЕРВЫЙ <script> в <head>, inline, раньше net-guard.js и модульного скрипта', () => {
    expect(SCRIPT).toBeTruthy()
    expect(SCRIPT.attrs.trim()).toBe('') // обычный inline: без src / type=module / async
    expect(SCRIPT.body).toContain("'pithy_start_logs_v1'")
    expect(SCRIPT.index).toBeLessThan(html.indexOf('<script src="/net-guard.js">'))
    expect(SCRIPT.index).toBeLessThan(html.indexOf('type="module"'))
    expect(html.slice(0, SCRIPT.index)).not.toMatch(/<script/)
  })

  it('чёрный фон html задан раньше скрипта (журнал не должен задерживать первый кадр)', () => {
    expect(html.indexOf('background: #000;')).toBeLessThan(SCRIPT.index)
  })

  it('скрипт небольшой и целиком обёрнут в try/catch', () => {
    expect(SCRIPT.body.split('\n').length).toBeLessThanOrEqual(220)
    expect(SCRIPT.body).toMatch(/try \{ run\(\) \} catch/)
  })

  it('никаких сетевых вызовов', () => {
    expect(SCRIPT.body).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|new Image|\.src\s*=/)
  })

  it('ключевые поля контекста и события описаны в тексте скрипта', () => {
    for (const k of ['standalone', 'display-mode', 'devicePixelRatio', 'visualViewport', 'safe-area-inset-top', 'prefers-color-scheme',
      'prefers-reduced-motion', 'visibilityState', 'referrer', "getEntriesByType('navigation')", 'redirectCount', 'pithy_start_n',
      'readystatechange', 'DOMContentLoaded', "'load'", 'pageshow', 'pagehide', 'visibilitychange', 'resize', 'orientationchange',
      "'focus'", "'blur'", "'online'", "'offline'", 'beforeunload', 'controllerchange', 'getRegistration', 'unhandledrejection',
      'largest-contentful-paint', 'layout-shift', 'longtask', "'paint'", 'requestAnimationFrame', 'fonts', 'offlineGuard', 'serverGuard',
      '__splashLog', '__startMark', '__startLog', 'History.prototype', 'elementsFromPoint', 'nav.shellV2Nav', '.feedSwiper', '--sab', '__safeStable']) {
      expect(SCRIPT.body, k).toContain(k)
    }
  })

  it('метки приложения: сплэш-скрипт (pithyReady), main.jsx и App.jsx зовут __startMark через ?. (без журнала не падают)', () => {
    expect(html).toMatch(/window\.__startMark\('pithyReady'/)
    expect(readFileSync(resolve(import.meta.dirname, '../../../main.jsx'), 'utf8')).toContain("window.__startMark?.('main-render')")
    expect(readFileSync(resolve(import.meta.dirname, '../../../app/App.jsx'), 'utf8')).toContain("window.__startMark?.('app-mounted')")
  })
})

describe('start-log: поведение скрипта в песочнице', () => {
  it('контекст запуска собран', () => {
    const env = boot()
    env.advance(100)
    const c = env.log().ctx
    expect(c).toMatchObject({ sa: true, dm: true, scr: '402x874', dpr: 3, or: 'portrait-primary', dark: true, rm: false, nav: 'navigate', rc: 0, size: 1234, n: 1, cold: true, sw: 'activated', reloadHook: 'unforgeable' })
    expect(c.win).toBe('402x814 vv=402x814@0')
    expect(c.vis).toBe('visible')
    expect(c.safe).toBe('59px/0px/34px/0px') // после первого кадра
    expect(c.ua).not.toContain('Mozilla/5.0')
    expect(c.t0).toBe('2026-10-09T10:00:00.000Z')
    expect(env.log().id).toBe('2026-10-09T10:00:00.000Z')
  })

  it('номер загрузки в сессии: второй старт в той же жизни — тёплый', () => {
    const session = {}
    const a = boot({ session }); const b = boot({ session })
    expect(a.log().ctx).toMatchObject({ n: 1, cold: true })
    expect(b.log().ctx).toMatchObject({ n: 2, cold: false })
  })

  it('события пишутся с метками t и деталями', async () => {
    const env = boot()
    env.advance(50)
    env.doc.readyState = 'interactive'; env.doc.fire('readystatechange'); env.doc.fire('DOMContentLoaded')
    env.win.fire('load'); env.win.fire('pageshow', { persisted: true })
    env.doc.visibilityState = 'hidden'; env.doc.fire('visibilitychange'); env.doc.visibilityState = 'visible'; env.doc.fire('visibilitychange')
    env.win.innerHeight = 800; env.win.fire('resize'); env.win.fire('orientationchange')
    env.win.fire('focus'); env.win.fire('blur'); env.win.fire('offline'); env.win.fire('online'); env.win.fire('beforeunload')
    env.swTarget.fire('controllerchange')
    env.advance(20)
    await Promise.resolve() // getRegistration() — промис
    const ev = env.log().ev
    for (const t of ['start', 'rs', 'dcl', 'load', 'pageshow', 'vis', 'resize', 'orient', 'focus', 'blur', 'offline', 'online', 'beforeunload', 'sw-ctrl', 'sw-reg', 'nav-timing']) {
      expect(types(env), t).toContain(t)
    }
    expect(of(env, 'pageshow')[0][2]).toBe('persisted=true')
    expect(of(env, 'vis').map(e => e[2])).toEqual(['hidden', 'visible'])
    expect(of(env, 'resize')[0][2]).toContain('402x800')
    expect(ev.every(e => typeof e[0] === 'number' && typeof e[1] === 'string' && typeof e[2] === 'string')).toBe(true)
  })

  it('ошибки: js, промис, ресурс (первые 10)', () => {
    const env = boot()
    for (let i = 0; i < 14; i++) env.win.fire('error', { message: 'boom' + i, filename: 'https://x/a.js', lineno: 7 })
    env.win.fire('error', { target: { nodeName: 'SCRIPT', src: 'https://x/assets/index-abc.js' }, message: undefined })
    env.win.fire('unhandledrejection', { reason: new Error('rej!') })
    expect(of(env, 'js-error')).toHaveLength(10)
    expect(of(env, 'js-error')[0][2]).toBe('boom0 @a.js:7')
    expect(of(env, 'res-error')[0][2]).toBe('script https://x/assets/index-abc.js')
    expect(of(env, 'rej')[0][2]).toContain('rej!')
    expect(env.log().drop['js-error']).toBe(4)
  })

  it('PerformanceObserver: paint, lcp, layout-shift (с источниками), longtask (первые 10)', () => {
    const env = boot()
    env.advance(50) // наблюдатели подключаются сразу после первого кадра (buffered — ранние записи не теряются)
    env.emit('paint', { name: 'first-contentful-paint', startTime: 120.44 })
    env.emit('largest-contentful-paint', { size: 4000, element: { nodeName: 'DIV', id: 'splash' }, startTime: 130 })
    env.emit('layout-shift', { value: 0.0123456, hadRecentInput: false, startTime: 400, sources: [{ node: { nodeName: 'DIV', id: '', className: 'feedSkeleton x' }, previousRect: { x: 0, y: 0, width: 402, height: 800 }, currentRect: { x: 0, y: 59, width: 402, height: 741 } }] })
    for (let i = 0; i < 13; i++) env.emit('longtask', { duration: 80 + i, startTime: 200 + i })
    expect(of(env, 'paint')[0]).toEqual([120.4, 'paint', 'first-contentful-paint'])
    expect(of(env, 'lcp')[0][2]).toContain('div#splash')
    expect(of(env, 'cls')[0][2]).toBe('v=0.0123 div.feedSkeleton@0,0,402x800>0,59,402x741')
    expect(of(env, 'longtask')).toHaveLength(10)
  })

  it('просадка кадра >40 мс помечается jank с длительностью', () => {
    const env = boot()
    env.advance(64); env.frame(120); env.advance(32)
    const j = of(env, 'jank')
    expect(j).toHaveLength(1)
    expect(j[0][2]).toBe('120ms')
  })

  it('уход сплэша: отметка splash-gone, семплер доходит до итоговой записи', () => {
    const env = boot()
    env.advance(3500)
    env.win.fire('pithy:splash-gone')
    env.splash.st.opacity = '0.5'; env.advance(800)
    expect(of(env, 'splash-gone')).toHaveLength(1)
    expect(of(env, 'sample').some(e => e[2].includes('so=0.5'))).toBe(true)
  })

  it('location.reload перехватывается, только если браузер позволяет (в норме — нет)', () => {
    const env = makeEnv({ reloadConfigurable: true }); env.run(SCRIPT.body); env.advance(50)
    expect(env.log().ctx.reloadHook).toBe('hooked')
    env.win.location.reload()
    expect(of(env, 'location.reload')).toHaveLength(1)
    expect(env.saved()[0].end).toBe('reload-call')
  })

  it('пустой #splash и нет #root — не падает, пишет «-»', () => {
    const env = makeEnv(); env.elements.splash = null; env.elements.root = null
    env.run(SCRIPT.body); env.advance(50)
    expect(of(env, 'sample')[0][2]).toContain('so=- sd=- fd=- lg=- rt=-')
  })

  it('метки приложения и перехват history (вызов проходит дальше, стек пишется)', () => {
    const env = boot()
    env.advance(50)
    env.win.__startMark('app-mounted', 'ok')
    env.history.pushState({}, '', '/x')
    expect(of(env, 'mark:app-mounted')[0][2]).toBe('ok')
    expect(of(env, 'hist')[0][2]).toMatch(/^pushState/)
    expect(env.history.calls).toEqual(['pushState'])
  })
})
