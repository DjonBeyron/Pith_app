import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'

// Чистая логика service worker'а (public/sw-core.js) — исполняется как есть в vm-песочнице, как в воркере (UMD, self.PithySwCore)
const SRC = readFileSync(resolve(import.meta.dirname, '../../../public/sw-core.js'), 'utf8')
const ctx = {}
vm.runInNewContext(SRC, ctx)
const C = ctx.PithySwCore
const NOW = 1_700_000_000_000
const STATICS = new Set(['/net-guard.js', '/manifest.webmanifest', '/icons/icon-192.png'])
const req = (o = {}) => ({ pathname: '/', search: '', sameOrigin: true, method: 'GET', mode: 'no-cors', cache: 'default', ...o })
const nav = (o = {}) => ({ configured: true, buildId: 'B1', search: '', state: C.normState(null), now: NOW, online: true, hasShell: true, ...o })

describe('sw-core: подключение и конфигурация', () => {
  it('UMD: в воркере кладёт себя в self.PithySwCore, в node — в module.exports', () => {
    expect(typeof C.route).toBe('function')
    const m = { exports: {} }
    vm.runInNewContext(SRC, { module: m })
    expect(typeof m.exports.decideNav).toBe('function')
  })

  it('кеш оболочки включён только при подставленных BUILD_ID и списке (токены остались — выключен)', () => {
    expect(C.configured('__BUILD_ID__', '__PRECACHE__')).toBe(false)
    expect(C.configured('3.2.1-ab12', '__PRECACHE__')).toBe(false)
    expect(C.configured('3.2.1-ab12', [])).toBe(false)
    expect(C.configured('3.2.1-ab12', ['/'])).toBe(true)
    expect(C.cacheName('3.2.1-ab12')).toBe('shell-3.2.1-ab12')
    expect(C.isShellName('shell-x')).toBe(true)
    expect(C.isShellName('offline-v7')).toBe(false)
  })
})

describe('sw-core: route — какой это запрос', () => {
  it('страница приложения: «/» и /index.html с любым ?query', () => {
    expect(C.route(req({ mode: 'navigate' }), STATICS)).toBe('shell-nav')
    expect(C.route(req({ mode: 'navigate', pathname: '/index.html' }), STATICS)).toBe('shell-nav')
    expect(C.route(req({ mode: 'navigate', search: '?source=pwa&nativeinstall=1' }), STATICS)).toBe('shell-nav')
  })

  it('прочие страницы — прежняя логика (nav); /lab/ воркер не трогает', () => {
    expect(C.route(req({ mode: 'navigate', pathname: '/offline.html' }), STATICS)).toBe('nav')
    expect(C.route(req({ mode: 'navigate', pathname: '/design/x.html' }), STATICS)).toBe('nav')
    expect(C.route(req({ mode: 'navigate', pathname: '/lab/l5.html' }), STATICS)).toBe('lab')
    expect(C.route(req({ pathname: '/lab/splash-blue/a.png' }), STATICS)).toBe('lab')
  })

  it('/assets/* — asset; предзагруженная статика — static; всё остальное (API, Supabase, звуки) — мимо', () => {
    expect(C.route(req({ pathname: '/assets/index-abc.js' }), STATICS)).toBe('asset')
    expect(C.route(req({ pathname: '/net-guard.js' }), STATICS)).toBe('static')
    expect(C.route(req({ pathname: '/icons/icon-192.png' }), STATICS)).toBe('static')
    expect(C.route(req({ pathname: '/sounds/a.mp3' }), STATICS)).toBe('other')
    expect(C.route(req({ pathname: '/version.json' }), STATICS)).toBe('other')
    expect(C.route(req({ pathname: '/auth/v1/health', sameOrigin: false }), STATICS)).toBe('skip')
    expect(C.route(req({ pathname: '/assets/x.js', method: 'POST' }), STATICS)).toBe('skip')
  })

  it('запросы с cache no-store (пинг net-guard /favicon.svg, проверка версии) идут только в сеть; reload/no-cache кеш оболочки не обходят', () => {
    expect(C.route(req({ pathname: '/net-guard.js', cache: 'no-store' }), STATICS)).toBe('other')
    expect(C.route(req({ pathname: '/assets/a.js', cache: 'no-store' }), STATICS)).toBe('other')
    expect(C.route(req({ pathname: '/assets/a.js', cache: 'reload' }), STATICS)).toBe('asset')
    expect(C.route(req({ pathname: '/', mode: 'navigate', cache: 'no-cache' }), STATICS)).toBe('shell-nav')
    expect(C.route(req({ pathname: '/favicon.svg' }), STATICS)).toBe('other')
  })
})

describe('sw-core: decideNav — отдавать ли оболочку из кеша', () => {
  it('кеш есть → оболочка; ключ — «/», query ignoreSearch делает сам воркер', () => {
    expect(C.decideNav(nav())).toMatchObject({ mode: 'shell', why: 'ok' })
    expect(C.SHELL_KEY).toBe('/')
  })

  it('кеша нет → прежняя логика (network-first) и просьба пересобрать кеш; без сети пересобирать не просим', () => {
    expect(C.decideNav(nav({ hasShell: false }))).toMatchObject({ mode: 'legacy', why: 'nocache', ensure: true })
    expect(C.decideNav(nav({ hasShell: false, online: false }))).toMatchObject({ mode: 'legacy', why: 'offline' })
    expect(C.decideNav(nav({ configured: false }))).toEqual({ mode: 'legacy', why: 'unconfigured' })
  })

  it('без сети (navigator.onLine === false) — офлайн-страница, как до кеша оболочки', () => {
    expect(C.OFFLINE_SHELL).toBe(false)
    expect(C.decideNav(nav({ online: false }))).toMatchObject({ mode: 'legacy', why: 'offline' })
  })

  it('?nosw=1: с сети, очистить кеши, отключить на 24 ч (только точное nosw=1)', () => {
    const d = C.decideNav(nav({ search: '?source=pwa&nosw=1' }))
    expect(d).toMatchObject({ mode: 'legacy', why: 'nosw', purge: true, disableFor: 24 * 3600 * 1000 })
    expect(C.isNosw('?nosw=1')).toBe(true)
    expect(C.isNosw('?nosw=10')).toBe(false)
    expect(C.isNosw('?xnosw=1')).toBe(false)
    expect(C.decideNav(nav({ search: '?nosw=0' })).mode).toBe('shell')
  })

  it('флаг отключения: пока не вышел срок — с сети; после срока кеш снова включается', () => {
    const st = C.disableState(C.normState(null), NOW, C.DISABLE_MS, 'manual')
    expect(st.disabledUntil).toBe(NOW + 24 * 3600 * 1000)
    expect(C.decideNav(nav({ state: st, now: NOW + 1000 }))).toMatchObject({ mode: 'legacy', why: 'disabled' })
    expect(C.shellActive(st, NOW + 1000)).toBe(false)
    const later = NOW + 25 * 3600 * 1000
    expect(C.decideNav(nav({ state: st, now: later, hasShell: false }))).toMatchObject({ mode: 'legacy', why: 'nocache', reenable: true, ensure: true })
    expect(st.disabledUntil).toBe(0)
    expect(C.shellActive(st, later)).toBe(true)
  })

  it('enableState снимает флаг, счётчики и блокировку пересборки', () => {
    const st = C.blockBuild(C.disableState(C.normState(null), NOW, 1000, 'boot'), 'B1', NOW)
    C.enableState(st)
    expect(C.isDisabled(st, NOW)).toBe(false)
    expect(C.isBlocked(st, 'B1', NOW)).toBe(false)
  })

  it('после purge-shell тот же BUILD_ID не пересобираем 30 минут; другой — сразу', () => {
    const st = C.blockBuild(C.normState(null), 'B1', NOW)
    expect(C.isBlocked(st, 'B1', NOW + 1000)).toBe(true)
    expect(C.isBlocked(st, 'B2', NOW + 1000)).toBe(false)
    expect(C.isBlocked(st, 'B1', NOW + C.BLOCK_MS + 1)).toBe(false)
    expect(C.decideNav(nav({ state: st, hasShell: false }))).toMatchObject({ why: 'nocache', ensure: false })
  })
})

describe('sw-core: защита «страница не загрузилась» (boot-ok)', () => {
  const serve = (st, at) => { const d = C.decideNav(nav({ state: st, now: at })); if (d.mode === 'shell') st.pending = { build: 'B1', at }; return d }

  it('boot-ok приходит вовремя — счётчик неудач не растёт, кеш не отключается', () => {
    const st = C.normState(null)
    for (let i = 0; i < 5; i++) { expect(serve(st, NOW + i * 60000).mode).toBe('shell'); expect(C.confirmBoot(st, 'B1')).toBe(true) }
    expect(st.fails).toBe(0)
  })

  it('два запуска из кеша подряд без boot-ok за 10 с → третий идёт с сети, кеш отключён на 24 ч и очищается', () => {
    const st = C.normState(null)
    expect(serve(st, NOW).mode).toBe('shell') // запуск 1: boot-ok нет
    expect(serve(st, NOW + 20000).mode).toBe('shell') // запуск 2: прошлый не подтверждён (1 неудача)
    expect(st.fails).toBe(1)
    const third = serve(st, NOW + 40000) // запуск 3: вторая неудача
    expect(third).toMatchObject({ mode: 'legacy', why: 'boot', purge: true, disableFor: C.DISABLE_MS })
  })

  it('быстрая перезагрузка (< 10 с) неудачей не считается', () => {
    const st = C.normState(null)
    for (let i = 0; i < 6; i++) expect(serve(st, NOW + i * 2000).mode).toBe('shell')
    expect(st.fails).toBe(0)
  })

  it('boot-ok посреди серии сбрасывает счётчик; чужой BUILD_ID его не сбрасывает', () => {
    const st = C.normState(null)
    serve(st, NOW); serve(st, NOW + 20000)
    expect(st.fails).toBe(1)
    expect(C.confirmBoot(st, 'OTHER')).toBe(false)
    expect(st.pending).not.toBeNull()
    expect(C.confirmBoot(st, 'B1')).toBe(true)
    expect(st).toMatchObject({ fails: 0, pending: null })
    expect(C.confirmBoot(st, 'B1')).toBe(false) // нечего подтверждать
  })

  it('закончившееся отключение начинает счёт с нуля', () => {
    const st = C.disableState(C.normState(null), NOW, 1000, 'boot')
    st.fails = 5
    const d = C.decideNav(nav({ state: st, now: NOW + 5000 }))
    expect(d.mode).toBe('shell')
    expect(st.fails).toBe(0)
  })
})

describe('sw-core: ротация кешей, предзагрузка, статус', () => {
  it('остаются максимум 2 кеша shell-* (текущий + предыдущий), неполные и старые удаляются, чужие кеши не трогаем', () => {
    const names = ['offline-v7', 'pithy-sw-state', 'shell-A', 'shell-B', 'shell-C', 'shell-broken']
    const stamps = { 'shell-A': 100, 'shell-B': 200, 'shell-C': 300, 'shell-broken': null }
    expect(C.planRotation(names, 'shell-C', stamps).sort()).toEqual(['shell-A', 'shell-broken'])
    expect(C.planRotation(['shell-A', 'shell-B'], 'shell-B', { 'shell-A': 1, 'shell-B': 2 })).toEqual([])
    // свой кеш не собран (выключено/ошибка): остаются два самых свежих полных
    expect(C.planRotation(['shell-A', 'shell-B', 'shell-C'], 'shell-D', { 'shell-A': 1, 'shell-B': 2, 'shell-C': 3 })).toEqual(['shell-A'])
    expect(C.MAX_SHELL_CACHES).toBe(2)
  })

  it('предзагрузка: файл годится, только если 200, без редиректа и js/css не HTML (rewrite на index.html)', () => {
    expect(C.validPrecache('/assets/a.js', { ok: true, redirected: false, ct: 'text/javascript' })).toBe(true)
    expect(C.validPrecache('/assets/a.js', { ok: true, redirected: false, ct: 'text/html; charset=utf-8' })).toBe(false)
    expect(C.validPrecache('/assets/a.css', { ok: false, redirected: false, ct: 'text/css' })).toBe(false)
    expect(C.validPrecache('/', { ok: true, redirected: false, ct: 'text/html' })).toBe(true)
    expect(C.validPrecache('/', { ok: true, redirected: true, ct: 'text/html' })).toBe(false)
    expect(C.validPrecache('/x.js', null)).toBe(false)
  })

  it('режим запроса при предзагрузке: хешированные — из HTTP-кеша, остальное — свежим; порядок: страница и точка входа первыми', () => {
    expect(C.fetchMode('/assets/a-1.js')).toBe('default')
    expect(C.fetchMode('/')).toBe('reload')
    expect(C.fetchMode('/net-guard.js')).toBe('reload')
    expect(C.precacheOrder(['/assets/Z-1.js', '/assets/index-9.css', '/', '/icons/a.png', '/assets/index-8.js']).slice(0, 3)).toEqual(['/', '/assets/index-9.css', '/assets/index-8.js'])
  })

  it('статус для админки: включён/выключен, причина, свой кеш, блокировка', () => {
    const st = C.disableState(C.normState(null), NOW, 1000, 'nosw')
    const v = C.statusView({ configured: true, build: 'B1', version: '1', state: st, now: NOW + 10, own: true, caches: [{ name: 'shell-B1' }] })
    expect(v).toMatchObject({ type: 'shell-status', enabled: false, why: 'nosw', own: true, build: 'B1' })
    expect(C.statusView({ configured: false, build: 'x', state: C.normState(null), now: NOW }).enabled).toBe(false)
    expect(C.statusView({ configured: true, build: 'B1', state: C.normState(null), now: NOW, own: false }).enabled).toBe(true)
  })

  it('normState чинит мусор из хранилища', () => {
    expect(C.normState('битое')).toMatchObject({ v: 1, disabledUntil: 0, fails: 0, pending: null })
    expect(C.normState({ disabledUntil: '5', fails: 'x' })).toMatchObject({ disabledUntil: 5, fails: 0 })
  })
})
