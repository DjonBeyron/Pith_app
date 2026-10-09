import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import {
  NETWORK_TEXTS, OFFLINE_CONFIRM_MS,
  SERVER_PROBE_TIMEOUT_MS, SERVER_PROBE_PAUSE_MS, SERVER_RECHECK_MS, SERVER_RECHECK_TIMEOUT_MS,
} from './networkGuard.js'

// Поведение public/net-guard.js: сам файл исполняется как есть, в песочнице с поддельными DOM и fetch, время — fake timers.
// Чистое решение и зеркало констант — в serverReach.test.js
const SRC = readFileSync(resolve(import.meta.dirname, '../../public/net-guard.js'), 'utf8')
const URL_OK = 'https://abc.supabase.co'
const HEALTH = `${URL_OK}/auth/v1/health`

// ─── поведение сторожа: net-guard.js как есть, поддельные DOM и fetch, время — fake timers ───
function startGuard({ meta = URL_OK, online = true, mounted = true, script = () => 'ok' } = {}) {
  const listeners = {}
  const calls = []
  const body = {
    children: [],
    appendChild(n) { n.parentNode = body; body.children.push(n); return n },
    removeChild(n) { body.children = body.children.filter(c => c !== n); n.parentNode = null },
  }
  const element = () => {
    const parts = {}
    return {
      id: '', className: '', innerHTML: '', parentNode: null, setAttribute() {},
      querySelector(sel) { return (parts[sel] ??= { textContent: '', disabled: false, onclick: null }) },
    }
  }
  const root = { firstChild: mounted ? {} : null }
  const doc = {
    body, hidden: false,
    getElementById: id => (id === 'root' ? root : null),
    querySelector: sel => (sel.includes('pithy-supabase-url') && meta !== null ? { getAttribute: () => meta } : null),
    createElement: element,
    addEventListener() {},
  }
  const env = { navigator: { onLine: online }, location: { origin: 'https://x', reload: vi.fn() } }
  // fetch: сценарий script(n, url) → 'ok' | 'status' (HTTP 500 — тоже ответ) | 'fail' (сетевая ошибка) | 'hang' (молчит до abort) | число мс до ok
  const fetchMock = (url, opts = {}) => {
    if (!String(url).includes('/auth/v1/health')) { // пинг самого сайта (/favicon.svg) — живой
      return Promise.resolve({ ok: true, headers: { get: () => 'image/svg+xml' } })
    }
    calls.push({ url, opts })
    const what = script(calls.length, url)
    if (what === 'ok') return Promise.resolve({ type: 'opaque', status: 0 })
    if (what === 'status') return Promise.resolve({ status: 500, ok: false })
    if (what === 'fail') return Promise.reject(new TypeError('Failed to fetch'))
    return new Promise((res, rej) => {
      opts.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
      if (typeof what === 'number') setTimeout(() => res({ type: 'opaque', status: 0 }), what)
    })
  }
  const ctx = {
    ...env, document: doc, fetch: fetchMock, AbortController, Date, setTimeout, clearTimeout, setInterval, clearInterval,
    window: { addEventListener: (name, fn) => { (listeners[name] ??= []).push(fn) } },
  }
  vm.runInNewContext(SRC, ctx)
  const screen = () => body.children.find(c => c.id === 'serverGuard')
  return { ctx, env, calls, body, root, screen, fire: name => (listeners[name] ?? []).forEach(fn => fn()), doc }
}
const tick = ms => vi.advanceTimersByTimeAsync(ms)

describe('поведение сторожа «сервер недоступен» (fake timers)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('нормальная сеть: один запрос на старте, экрана нет и позже его не будет', async () => {
    const g = startGuard()
    await tick(120_000)
    expect(g.calls).toHaveLength(1)
    expect(g.calls[0].url).toBe(HEALTH)
    expect(g.calls[0].opts).toMatchObject({ mode: 'no-cors', cache: 'no-store', credentials: 'omit' })
    expect(g.screen()).toBeUndefined()
  })

  it('медленная сеть: ответ через 3.9с — не недоступен', async () => {
    const g = startGuard({ script: () => 3900 })
    await tick(30_000)
    expect(g.calls).toHaveLength(1)
    expect(g.screen()).toBeUndefined()
  })

  it('любой HTTP-статус (500, 401, 404…) — сервер достижим', async () => {
    const g = startGuard({ script: () => 'status' })
    await tick(30_000)
    expect(g.calls).toHaveLength(1)
    expect(g.screen()).toBeUndefined()
  })

  it('сетевая ошибка дважды подряд (VPN нужен): вторая попытка через 1.5с, экран сразу после неё', async () => {
    const g = startGuard({ script: () => 'fail' })
    await tick(SERVER_PROBE_PAUSE_MS - 1)
    expect(g.calls).toHaveLength(1)
    expect(g.screen()).toBeUndefined()
    await tick(1)
    expect(g.calls).toHaveLength(2)
    await tick(0)
    const el = g.screen()
    expect(el).toBeTruthy()
    expect(el.querySelector('.ngTitle').textContent).toBe(NETWORK_TEXTS.server.title)
    expect(el.querySelector('.ngText').textContent).toBe(NETWORK_TEXTS.server.text)
    expect(el.innerHTML).toContain(`>${NETWORK_TEXTS.retry}</button>`)
    expect(el.innerHTML).toContain('class="ngCable"') // те же кабели
  })

  it('молчащий сервер (таймауты): экран ровно через 4+1.5+4 = 9.5с, не раньше', async () => {
    const g = startGuard({ script: () => 'hang' })
    const total = SERVER_PROBE_TIMEOUT_MS * 2 + SERVER_PROBE_PAUSE_MS
    await tick(total - 1)
    expect(g.screen()).toBeUndefined()
    await tick(1)
    expect(g.screen()).toBeTruthy()
    expect(total).toBeLessThanOrEqual(10_000)
  })

  it('разовый сбой (первая попытка упала, вторая ответила) — ложного срабатывания нет', async () => {
    const g = startGuard({ script: n => (n === 1 ? 'fail' : 'ok') })
    await tick(30_000)
    expect(g.calls).toHaveLength(2)
    expect(g.screen()).toBeUndefined()
  })

  it('сети нет совсем (onLine === false): «сервер» не винит; вернулась сеть — проверка стартует заново', async () => {
    const g = startGuard({ online: false, script: () => 'fail' })
    await tick(20_000)
    expect(g.screen()).toBeUndefined()
    expect(g.calls).toHaveLength(1) // дальше ждём события online
    g.env.navigator.onLine = true
    g.fire('online')
    await tick(SERVER_PROBE_PAUSE_MS + 10)
    expect(g.calls).toHaveLength(3)
    expect(g.screen()).toBeTruthy()
  })

  it('экран сам проверяет каждые 3.5с; ответили — экран уходит и (приложение уже смонтировано) страница перезагружается ОДИН раз', async () => {
    let up = false
    const g = startGuard({ script: () => (up ? 'ok' : 'fail') })
    await tick(SERVER_PROBE_PAUSE_MS + 10)
    expect(g.screen()).toBeTruthy()
    await tick(SERVER_RECHECK_MS * 2)
    expect(g.screen()).toBeTruthy()
    expect(g.ctx.location.reload).not.toHaveBeenCalled()
    const before = g.calls.length
    expect(before).toBeGreaterThanOrEqual(4)
    up = true
    await tick(SERVER_RECHECK_MS)
    expect(g.screen()).toBeUndefined()
    expect(g.ctx.location.reload).toHaveBeenCalledTimes(1)
    await tick(60_000)
    expect(g.ctx.location.reload).toHaveBeenCalledTimes(1)
    expect(g.calls).toHaveLength(before + 1) // после успеха проверки прекращаются
  })

  it('приложение ещё не смонтировано — перезагрузка не нужна, загрузка продолжается сама', async () => {
    let up = false
    const g = startGuard({ mounted: false, script: () => (up ? 'ok' : 'fail') })
    await tick(SERVER_PROBE_PAUSE_MS + 10)
    expect(g.screen()).toBeTruthy()
    up = true
    await tick(SERVER_RECHECK_MS)
    expect(g.screen()).toBeUndefined()
    expect(g.ctx.location.reload).not.toHaveBeenCalled()
  })

  it('кнопка «Повторить»: «Проверяем…» и блок на время запроса; неудача — кнопка снова активна, успех — экран уходит', async () => {
    let up = false
    const g = startGuard({ script: () => (up ? 'ok' : 'fail') })
    await tick(SERVER_PROBE_PAUSE_MS + 10)
    const btn = g.screen().querySelector('.ngBtn')
    btn.onclick()
    expect(btn.disabled).toBe(true)
    expect(btn.textContent).toBe(NETWORK_TEXTS.checking)
    await tick(0)
    expect(btn.disabled).toBe(false)
    expect(btn.textContent).toBe(NETWORK_TEXTS.retry)
    up = true
    btn.onclick()
    await tick(0)
    expect(g.screen()).toBeUndefined()
  })

  it('из фона (document.hidden) экран не стучится в сервер', async () => {
    const g = startGuard({ script: () => 'fail' })
    await tick(SERVER_PROBE_PAUSE_MS + 10)
    const n = g.calls.length
    g.doc.hidden = true
    await tick(SERVER_RECHECK_MS * 4)
    expect(g.calls).toHaveLength(n)
    g.doc.hidden = false
    await tick(SERVER_RECHECK_MS)
    expect(g.calls.length).toBeGreaterThan(n)
  })

  it('нет адреса (не заменённый плейсхолдер / нет meta) — сторож ничего не запрашивает', async () => {
    for (const meta of ['%VITE_SUPABASE_URL%', null]) {
      const g = startGuard({ meta, script: () => 'fail' })
      await tick(30_000)
      expect(g.calls).toHaveLength(0)
      expect(g.screen()).toBeUndefined()
    }
  })
})

describe('сторож загрузки: «нет сети» на старте не мигает (iOS на миг отдаёт onLine=false)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })
  const guardScreen = g => g.body.children.find(c => c.id === 'offlineGuard')

  it('кратковременный false (вернулся за 500мс) — экран с кабелем не появляется вовсе', async () => {
    const g = startGuard({ meta: null, mounted: false, online: false })
    await tick(500)
    g.env.navigator.onLine = true
    await tick(2000)
    expect(guardScreen(g)).toBeUndefined()
  })

  it('сети нет дольше 0.7с подряд — «Связь пропала»', async () => {
    const g = startGuard({ meta: null, mounted: false, online: false })
    await tick(OFFLINE_CONFIRM_MS - 150)
    expect(guardScreen(g)).toBeUndefined()
    await tick(300)
    expect(guardScreen(g)?.querySelector('.ngTitle').textContent).toBe(NETWORK_TEXTS.offline.title)
  })
})

