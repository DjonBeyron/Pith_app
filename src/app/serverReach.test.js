import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import {
  decideServerReach, serverHealthUrl, NETWORK_TEXTS,
  SERVER_PROBE_TIMEOUT_MS, SERVER_PROBE_PAUSE_MS, SERVER_PROBE_ATTEMPTS, SERVER_RECHECK_MS, SERVER_RECHECK_TIMEOUT_MS,
} from './networkGuard.js'

// «Сервер недоступен» при запуске: чистое решение (networkGuard.js) и его зеркало в public/net-guard.js.
// Поведение самого сторожа на fake-таймерах — serverGuardBehavior.test.js
const PUBLIC = resolve(import.meta.dirname, '../../public')
const SRC = readFileSync(resolve(PUBLIC, 'net-guard.js'), 'utf8')
const URL_OK = 'https://abc.supabase.co'
const HEALTH = `${URL_OK}/auth/v1/health`

describe('decideServerReach', () => {
  it('достаточно одного ответа: любая попытка ok = достижим, даже если до неё были неудачи', () => {
    expect(decideServerReach({ results: ['ok'], online: true })).toBe('reachable')
    expect(decideServerReach({ results: ['fail', 'ok'], online: true })).toBe('reachable')
    expect(decideServerReach({ results: ['ok'], online: false })).toBe('reachable')
  })
  it('одна неудача — ещё не вывод (медленная сеть), две подряд — недоступен', () => {
    expect(decideServerReach({ results: [], online: true })).toBe('pending')
    expect(decideServerReach({ results: ['fail'], online: true })).toBe('pending')
    expect(decideServerReach({ results: ['fail', 'fail'], online: true })).toBe('unreachable')
    expect(SERVER_PROBE_ATTEMPTS).toBe(2)
  })
  it('сети нет совсем (onLine === false) — это не вина сервера, экран «сервер» не показываем', () => {
    expect(decideServerReach({ results: ['fail', 'fail'], online: false })).toBe('offline')
  })
  it('бюджет до показа: таймаут + пауза + таймаут ≤ ~10с; на показанном экране проверки реже и терпеливее', () => {
    expect(SERVER_PROBE_TIMEOUT_MS * SERVER_PROBE_ATTEMPTS + SERVER_PROBE_PAUSE_MS).toBeLessThanOrEqual(10_000)
    expect(SERVER_PROBE_PAUSE_MS).toBe(1500)
    expect(SERVER_RECHECK_MS).toBeGreaterThanOrEqual(3000)
    expect(SERVER_RECHECK_MS).toBeLessThanOrEqual(4000)
    expect(SERVER_RECHECK_TIMEOUT_MS).toBeGreaterThan(SERVER_PROBE_TIMEOUT_MS)
  })
})

describe('serverHealthUrl', () => {
  it('адрес из VITE_SUPABASE_URL → /auth/v1/health; лишние пробелы и слэши убираются', () => {
    expect(serverHealthUrl(URL_OK)).toBe(HEALTH)
    expect(serverHealthUrl(`  ${URL_OK}// `)).toBe(HEALTH)
    expect(serverHealthUrl('http://127.0.0.1:54321')).toBe('http://127.0.0.1:54321/auth/v1/health')
  })
  it('нет переменной / не заменённый Vite плейсхолдер / мусор — null (проверка не запускается)', () => {
    for (const bad of [undefined, null, '', '   ', '%VITE_SUPABASE_URL%', 'abc.supabase.co', 'javascript:alert(1)', 'https://a b']) {
      expect(serverHealthUrl(bad), String(bad)).toBeNull()
    }
  })
})

describe('зеркало в public/net-guard.js', () => {
  const ctx = { navigator: { onLine: true }, location: { origin: 'https://x' }, Date, setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {} }
  ctx.window = { addEventListener: () => {} }
  ctx.document = { getElementById: () => null, body: null, addEventListener: () => {} }
  vm.runInNewContext(SRC, ctx)

  it('константы совпадают', () => {
    const num = name => Number(SRC.match(new RegExp(`${name} = (\\d+)`))[1])
    expect(num('SRV_TIMEOUT')).toBe(SERVER_PROBE_TIMEOUT_MS)
    expect(num('SRV_PAUSE')).toBe(SERVER_PROBE_PAUSE_MS)
    expect(num('SRV_ATTEMPTS')).toBe(SERVER_PROBE_ATTEMPTS)
    expect(num('SRV_RECHECK')).toBe(SERVER_RECHECK_MS)
    expect(num('SRV_RECHECK_TIMEOUT')).toBe(SERVER_RECHECK_TIMEOUT_MS)
  })
  it('решение и разбор адреса совпадают с networkGuard.js', () => {
    const lists = [[], ['fail'], ['fail', 'fail'], ['fail', 'fail', 'fail'], ['ok'], ['fail', 'ok']]
    for (const results of lists) for (const online of [true, false, undefined]) {
      expect(ctx.window.__srvDecide(results, online)).toBe(decideServerReach({ results, online }))
    }
    for (const u of [URL_OK, `${URL_OK}/`, ' ', '%VITE_X%', undefined, null, 'ftp://x', 'http://localhost:54321']) {
      expect(ctx.window.__srvHealthUrl(u)).toBe(serverHealthUrl(u))
    }
  })
  it('index.html подставляет адрес Supabase в <meta> ДО синхронного net-guard.js', () => {
    const html = readFileSync(resolve(PUBLIC, '../index.html'), 'utf8')
    const meta = html.indexOf('<meta name="pithy-supabase-url" content="%VITE_SUPABASE_URL%"')
    expect(meta).toBeGreaterThan(-1)
    expect(meta).toBeLessThan(html.indexOf('<script src="/net-guard.js">'))
  })
  it('тексты экрана «сервер» в net-guard.js те же, что в NETWORK_TEXTS', () => {
    expect(JSON.parse(JSON.stringify(ctx.window.__ngTexts)).server).toEqual(NETWORK_TEXTS.server)
    expect(NETWORK_TEXTS.server.text).toMatch(/VPN/)
  })
  it('запрос лёгкий и безличный: GET без ключа, cookie, реферера и кэша; никаких тел и заголовков', () => {
    expect(SRC).toMatch(/mode: 'no-cors', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'/)
    expect(SRC).not.toMatch(/apikey|Authorization|method:\s*'(POST|PUT)'/i)
  })
})
