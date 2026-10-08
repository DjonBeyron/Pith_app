import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import {
  decideNetworkState, isChunkLoadError, networkKindNow, SLOW_SHOW_DELAY_MS, BOOT_TIMEOUT_MS, NETWORK_TEXTS,
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

describe('тексты экрана «нет связи»: одни и те же во всех копиях', () => {
  const read = f => readFileSync(resolve(PUBLIC, f), 'utf8')
  const ctx = { navigator: { onLine: true }, location: { origin: 'https://x' }, Date, setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0 }
  ctx.window = { addEventListener: () => {} }
  ctx.document = { getElementById: () => null, body: null, addEventListener: () => {} }
  vm.runInNewContext(read('net-guard.js'), ctx)

  it('простые и дружелюбные: «Нет подключения» / «Слабое соединение», на «ты», без прежних «Нет интернета»', () => {
    expect(NETWORK_TEXTS.offline.title).toBe('Нет подключения')
    expect(NETWORK_TEXTS.offline.text).toBe('Проверь соединение с интернетом. Как только оно появится, мы продолжим')
    expect(NETWORK_TEXTS.slow.title).toBe('Слабое соединение')
    expect(NETWORK_TEXTS.slow.text).toBe('Проверь соединение с интернетом — мы продолжим сами')
    expect(NETWORK_TEXTS.retry).toBe('Повторить')
  })

  it('net-guard.js (оверлей) совпадает с NETWORK_TEXTS', () => {
    expect(JSON.parse(JSON.stringify(ctx.window.__ngTexts))).toEqual(NETWORK_TEXTS)
  })

  it('offline.html содержит те же строки (заголовок/подпись обоих видов, кнопка)', () => {
    const html = read('offline.html')
    for (const k of ['offline', 'slow']) {
      expect(html).toContain(`'${NETWORK_TEXTS[k].title}'`)
      expect(html).toContain(`'${NETWORK_TEXTS[k].text}'`)
    }
    expect(html).toContain(`>${NETWORK_TEXTS.offline.title}</h1>`) // без JS видно текст «нет сети»
    expect(html).toContain(`>${NETWORK_TEXTS.offline.text}</p>`)
    expect(html).toContain(`>${NETWORK_TEXTS.retry}</a>`)
  })

  it('NetworkProblem.jsx берёт тексты из NETWORK_TEXTS, а не пишет свои', () => {
    const jsx = readFileSync(resolve(import.meta.dirname, 'NetworkProblem.jsx'), 'utf8')
    expect(jsx).toMatch(/NETWORK_TEXTS\[kind\]/)
    expect(jsx).not.toMatch(/Нет интернета|Слабый интернет|Проверь соединение —/)
  })
})

describe('стартовый сплэш index.html: без скачков фона и лого', () => {
  const index = readFileSync(resolve(PUBLIC, '../index.html'), 'utf8')
  const splashCss = index.match(/#splash \{[^}]*\}/)?.[0] ?? ''
  const bodyCss = readFileSync(resolve(PUBLIC, '../src/styles/base.css'), 'utf8').match(/\nbody \{[^}]*\}/)?.[0] ?? ''

  it('сплэш непрозрачный с первого кадра: без opacity/анимации на самом #splash (иначе под ним просвечивает интерфейс)', () => {
    expect(splashCss).toMatch(/background: #0b0d10/)
    expect(splashCss).not.toMatch(/opacity|animation/)
  })

  it('лого повторяет стартовый экран iOS (scripts/make-brand-assets.mjs: 92px, на 19px выше центра) и видно сразу', () => {
    const logo = index.match(/#splash \.splash-logo \{[^}]*\}/)?.[0] ?? ''
    expect(logo).toMatch(/width: 92px; height: 92px; margin-bottom: 38px/)
    expect(logo).not.toMatch(/opacity/)
  })

  it('все этапы запуска одного цвета: html/body до CSS, body в base.css, манифест, theme-color', () => {
    expect(index).toMatch(/html, body \{ margin: 0; background: #0b0d10; \}/)
    expect(bodyCss).toMatch(/background: #0b0d10/)
    expect(index).toMatch(/name="theme-color" content="#0b0d10"/)
    const manifest = JSON.parse(readFileSync(resolve(PUBLIC, 'manifest.webmanifest'), 'utf8'))
    expect(manifest.background_color).toBe('#0b0d10')
    expect(manifest.theme_color).toBe('#0b0d10')
  })
})
