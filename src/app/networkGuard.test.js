import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import {
  decideNetworkState, isChunkLoadError, networkKindNow, SLOW_SHOW_DELAY_MS, BOOT_TIMEOUT_MS,
} from './networkGuard.js'
import { NETWORK_CABLE_SVG } from './networkCableSvg.js'

const PUBLIC = resolve(import.meta.dirname, '../../public')

describe('decideNetworkState', () => {
  const base = { online: true, mounted: false, resourceFailedMs: null, elapsedMs: 0 }

  it('приложение смонтировано — ничего не показываем (даже офлайн)', () => {
    expect(decideNetworkState({ ...base, mounted: true, online: false })).toBe('none')
  })
  it('нет сети на старте — сразу offline', () => {
    expect(decideNetworkState({ ...base, online: false })).toBe('offline')
  })
  it('быстрая загрузка — none', () => {
    expect(decideNetworkState({ ...base, elapsedMs: 1000 })).toBe('none')
  })
  it('ошибка ресурса: slow только после паузы 2.5с, раньше — не мигаем', () => {
    expect(decideNetworkState({ ...base, resourceFailedMs: SLOW_SHOW_DELAY_MS - 1 })).toBe('none')
    expect(decideNetworkState({ ...base, resourceFailedMs: SLOW_SHOW_DELAY_MS })).toBe('slow')
  })
  it('не смонтировалось за 8с — slow', () => {
    expect(decideNetworkState({ ...base, elapsedMs: BOOT_TIMEOUT_MS - 1 })).toBe('none')
    expect(decideNetworkState({ ...base, elapsedMs: BOOT_TIMEOUT_MS })).toBe('slow')
  })
})

describe('isChunkLoadError / networkKindNow', () => {
  it('узнаёт ошибки ленивых модулей разных браузеров', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/a.js'))).toBe(true)
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true)
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(Object.assign(new Error('x'), { name: 'ChunkLoadError' }))).toBe(true)
    expect(isChunkLoadError(new Error('Loading chunk 12 failed.'))).toBe(true)
  })
  it('обычные ошибки не принимает за сетевые', () => {
    expect(isChunkLoadError(new Error('x is not a function'))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
  })
  it('вид экрана по navigator.onLine', () => {
    const orig = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true })
    expect(networkKindNow()).toBe('offline')
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
    expect(networkKindNow()).toBe('slow')
    if (orig) Object.defineProperty(globalThis, 'navigator', orig)
  })
})

describe('зеркало public/net-guard.js', () => {
  const src = readFileSync(resolve(PUBLIC, 'net-guard.js'), 'utf8')
  const ctx = { navigator: { onLine: true }, location: { origin: 'https://x' }, Date, setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {} }
  ctx.window = { addEventListener: () => {} }
  ctx.document = { getElementById: () => null, body: null, addEventListener: () => {} }
  vm.runInNewContext(src, ctx)

  it('константы совпадают', () => {
    expect(src).toMatch(new RegExp(`BOOT_TIMEOUT = ${BOOT_TIMEOUT_MS}\\b`))
    expect(src).toMatch(new RegExp(`SLOW_DELAY = ${SLOW_SHOW_DELAY_MS}\\b`))
  })

  it('решение совпадает с decideNetworkState на сетке входов', () => {
    for (const online of [true, false])
      for (const mounted of [true, false])
        for (const failed of [null, 0, 2499, 2500, 9000])
          for (const elapsed of [0, 7999, 8000, 20000]) {
            expect(ctx.window.__netGuardDecide(online, mounted, failed, elapsed))
              .toBe(decideNetworkState({ online, mounted, resourceFailedMs: failed, elapsedMs: elapsed }))
          }
  })

  it('единая точка готовности объявлена, index.html зовёт её и подключает сторож синхронно', () => {
    expect(typeof ctx.window.__netGuardDone).toBe('function')
    const html = readFileSync(resolve(PUBLIC, '../index.html'), 'utf8')
    expect(html).toMatch(/<script src="\/net-guard\.js"><\/script>/)
    expect(html).toMatch(/__netGuardDone/)
  })
})

describe('единый вид экрана «нет связи»: три копии кабеля и CSS', () => {
  const norm = t => t.replace(/>\s+</g, '><').trim()
  const cssBlock = t => t.match(/\/\* ng-cable-css \*\/([\s\S]*?)\/\* \/ng-cable-css \*\//)?.[1]
    .split('\n').map(l => l.trim()).filter(Boolean).join('\n')
  const offline = readFileSync(resolve(PUBLIC, 'offline.html'), 'utf8')
  const index = readFileSync(resolve(PUBLIC, '../index.html'), 'utf8')

  it('разметка в net-guard.js и offline.html совпадает с networkCableSvg.js', () => {
    const ctx = { navigator: { onLine: true }, location: { origin: 'https://x' }, Date, setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0 }
    ctx.window = { addEventListener: () => {} }
    ctx.document = { getElementById: () => null, body: null, addEventListener: () => {} }
    vm.runInNewContext(readFileSync(resolve(PUBLIC, 'net-guard.js'), 'utf8'), ctx)
    expect(ctx.window.__ngCableSvg).toBe(NETWORK_CABLE_SVG)
    expect(norm(offline)).toContain(NETWORK_CABLE_SVG)
  })

  it('CSS кабеля в offline.html и index.html одинаков', () => {
    expect(cssBlock(index)).toBeTruthy()
    expect(cssBlock(offline)).toBe(cssBlock(index))
  })

  it('анимация лёгкая: без filter/blur, только opacity/transform, не больше 8 анимируемых элементов', () => {
    const css = cssBlock(index)
    expect(css).not.toMatch(/filter|blur|backdrop/)
    expect(css).toMatch(/prefers-reduced-motion/)
    expect(NETWORK_CABLE_SVG).not.toMatch(/filter|<animate|<script/)
    expect((NETWORK_CABLE_SVG.match(/class="(ngBolt|ngFly)/g) ?? []).length).toBeLessThanOrEqual(8)
    for (const kf of css.match(/@keyframes [^{]+\{(?:[^{}]*\{[^}]*\})+[^}]*\}/g) ?? []) {
      expect(kf.replace(/@keyframes \S+|var\([^)]*\)/g, '')).not.toMatch(/(?<![-\w])(?!opacity|transform)(left|top|width|height|margin|stroke-width|fill|color)\s*:/)
    }
  })

  it('index.html: тёмный фон задан раньше синхронного net-guard.js (иначе белый экран, пока он качается)', () => {
    const bg = index.indexOf('background: #0b0d10')
    expect(bg).toBeGreaterThan(-1)
    expect(bg).toBeLessThan(index.indexOf('<script src="/net-guard.js">'))
  })

  it('net-guard.js: офлайн без ожидания, «молчащая сеть» — пинг через 1.5с + 1.5с', () => {
    const src = readFileSync(resolve(PUBLIC, 'net-guard.js'), 'utf8')
    expect(src).toMatch(/PROBE_AT = 1500, PROBE_WAIT = 1500/)
    expect(src).toMatch(/setInterval\(check, 100\)/)
  })
})

