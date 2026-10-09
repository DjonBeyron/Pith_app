import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import {
  decideNetworkState, isChunkLoadError, networkKindNow, SLOW_SHOW_DELAY_MS, BOOT_TIMEOUT_MS, OFFLINE_CONFIRM_MS, NETWORK_TEXTS,
} from './networkGuard.js'
import { NETWORK_CABLE_SVG } from './networkCableSvg.js'

const PUBLIC = resolve(import.meta.dirname, '../../public')

describe('decideNetworkState', () => {
  const base = { online: true, mounted: false, resourceFailedMs: null, elapsedMs: 0 }

  it('приложение смонтировано — ничего не показываем (даже офлайн)', () => {
    expect(decideNetworkState({ ...base, mounted: true, online: false })).toBe('none')
  })
  it('нет сети на старте — offline, но не раньше 0.7с подряд (iOS на холодном старте на миг отдаёт false)', () => {
    expect(decideNetworkState({ ...base, online: false })).toBe('offline') // длительность не передана = подтверждено
    expect(decideNetworkState({ ...base, online: false, offlineForMs: OFFLINE_CONFIRM_MS - 1 })).toBe('none')
    expect(decideNetworkState({ ...base, online: false, offlineForMs: OFFLINE_CONFIRM_MS })).toBe('offline')
    // непрошедшая пауза не заглушает остальные причины
    expect(decideNetworkState({ ...base, online: false, offlineForMs: 0, elapsedMs: BOOT_TIMEOUT_MS })).toBe('slow')
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
    expect(src).toMatch(new RegExp(`OFFLINE_CONFIRM = ${OFFLINE_CONFIRM_MS}\\b`))
  })

  it('решение совпадает с decideNetworkState на сетке входов', () => {
    for (const online of [true, false])
      for (const mounted of [true, false])
        for (const failed of [null, 0, 2499, 2500, 9000])
          for (const elapsed of [0, 7999, 8000, 20000])
            for (const offMs of [undefined, 0, OFFLINE_CONFIRM_MS - 1, OFFLINE_CONFIRM_MS, 5000]) {
              expect(ctx.window.__netGuardDecide(online, mounted, failed, elapsed, offMs))
                .toBe(decideNetworkState({ online, mounted, resourceFailedMs: failed, elapsedMs: elapsed, offlineForMs: offMs }))
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
    const bg = index.indexOf('background: #000;')
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

  it('тёплые и простые, на «ты»: «Связь пропала» / «Что-то со связью» / «Нет связи с сервером»; без сухих прежних формулировок', () => {
    expect(NETWORK_TEXTS.offline.title).toBe('Связь пропала')
    expect(NETWORK_TEXTS.offline.text).toBe('Проверь интернет или режим полёта — как только связь вернётся, мы продолжим сами')
    expect(NETWORK_TEXTS.slow.title).toBe('Что-то со связью')
    // в iOS в режиме полёта navigator.onLine бывает true — «медленный» вариант обязан быть верным и для него
    expect(NETWORK_TEXTS.slow.text).toBe('Подожди немного или проверь интернет и режим полёта — мы продолжим сами')
    expect(NETWORK_TEXTS.server.title).toBe('Нет связи с сервером')
    expect(NETWORK_TEXTS.server.text).toMatch(/VPN/)
    expect(NETWORK_TEXTS.retry).toBe('Повторить')
    for (const k of ['offline', 'slow', 'server']) expect(JSON.stringify(NETWORK_TEXTS[k])).not.toMatch(/Нет подключения|Слабое соединение|Проверь соединение с интернетом/)
  })

  it('net-guard.js (оверлей) совпадает с NETWORK_TEXTS', () => {
    expect(JSON.parse(JSON.stringify(ctx.window.__ngTexts))).toEqual(NETWORK_TEXTS)
  })

  it('offline.html содержит те же строки (заголовок/подпись обоих видов, кнопка)', () => {
    const html = read('offline.html')
    for (const k of ['offline', 'slow']) { // у офлайн-страницы нет вида «сервер недоступен»: он живёт только в net-guard.js
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
    expect(jsx).not.toMatch(/Нет интернета|Слабый интернет|Проверь соединение/)
  })
})

describe('стартовый сплэш index.html: нечему не совпасть с нативным кадром iOS', () => {
  // Журнал старта (первый inline-скрипт в <head>, startLogScript.test.js) ТОЛЬКО наблюдает за страницей: читает standalone,
  // innerHeight, слушает resize — он не двигает лого, поэтому проверки «позиция не зависит от JS» его не касаются
  const index = readFileSync(resolve(PUBLIC, '../index.html'), 'utf8').replace(/<script>[\s\S]*?<\/script>/, '')
  const splashCss = index.match(/#splash \{[^}]*\}/)?.[0] ?? ''
  const bodyCss = readFileSync(resolve(PUBLIC, '../src/styles/base.css'), 'utf8').match(/\nbody \{[^}]*\}/)?.[0] ?? ''

  it('сплэш непрозрачный чёрный с первого кадра: без opacity/анимации на самом #splash (иначе просвечивает интерфейс)', () => {
    expect(splashCss).toMatch(/background: #000;/)
    expect(splashCss).not.toMatch(/opacity|animation/)
  })

  it('лого, свечение и версия проявляются ОДНОЙ анимацией (только opacity, ease-out, 250–300мс), без движения', () => {
    const fade = index.match(/#splash \.splash-fade \{[^}]*\}/)?.[0] ?? ''
    expect(fade).toMatch(/animation: splashIn 2[5-9]\dms ease-out;/)
    expect(fade).toMatch(/position: absolute; inset: 0;/)
    expect(index.match(/@keyframes splashIn \{[^}]*\}[^}]*\}/)?.[0].replace(/\s+/g, ' ')).toBe('@keyframes splashIn { from { opacity: 0; } }')
    // лого и версия лежат внутри .splash-fade и сами не анимируются (нет «ступеней»); свечение — обычный filter, проявляется вместе с opacity
    const markup = index.slice(index.indexOf('<div id="splash"'), index.indexOf('<script>', index.indexOf('<div id="splash"')))
    expect(markup).toMatch(/<div class="splash-fade">[\s\S]*splash-logo[\s\S]*splash-version[\s\S]*<\/div>\s*<\/div>/)
    const parts = [index.match(/#splash \.splash-logo \{[^}]*\}/)?.[0], index.match(/#splash \.splash-version \{[^}]*\}/)?.[0]]
    for (const part of parts) expect(part).not.toMatch(/animation|opacity/)
    expect(parts[0]).toMatch(/width: 92px; height: 92px; margin-bottom: 38px/)
    expect(parts[0]).toMatch(/drop-shadow/)
  })

  it('позиция лого не зависит от JS: ни замеров зоны статус-бара, ни resize-пересчётов, ни padding от скрипта; версия подставлена при сборке', () => {
    expect(index).not.toMatch(/navigator\.standalone|screen\.height|innerHeight|paddingBottom|__splashFit/)
    expect(index).not.toMatch(/addEventListener\('resize'/)
    expect(splashCss).not.toMatch(/vh|dvh|svh|padding/)
    expect(index).toMatch(/id="splash-version">v__APP_VERSION__</)
    expect(index).not.toMatch(/import \{ APP_VERSION \}/)
    expect(readFileSync(resolve(PUBLIC, '../vite.config.js'), 'utf8')).toMatch(/replaceAll\('__APP_VERSION__', APP_VERSION\)/)
  })

  it('уход сплэша — только растворение (opacity), без масштаба и сдвигов', () => {
    expect(index.match(/#splash\.splash-out \{[^}]*\}/)?.[0]).toMatch(/animation: splashOut 350ms ease forwards;/)
    expect(index.match(/@keyframes splashOut \{[^}]*\}[^}]*\}/)?.[0]).not.toMatch(/transform|scale/)
    expect(index).not.toMatch(/splashZoom|scale\(1\.6\)/)
  })

  it('все этапы запуска ОДНОГО цвета (#000, как нативные чёрные кадры iOS): html/body до CSS, сплэш, экран «нет сети», body/html/shell, манифест, theme-color, offline.html', () => {
    const read = f => readFileSync(resolve(PUBLIC, '../', f), 'utf8')
    const css = f => read(f).replace(/\/\*[\s\S]*?\*\//g, '')
    expect(index).toMatch(/html, body \{ margin: 0; background: #000; color-scheme: dark; \}/)
    expect(index).toMatch(/name="color-scheme" content="dark"/)
    expect(index).toMatch(/name="apple-mobile-web-app-status-bar-style" content="black"/)
    expect(index.match(/\.ngScreen \{[^}]*\}/)?.[0]).toMatch(/background: #000;/)
    expect(bodyCss).toMatch(/background: #000;/)
    expect(css('src/styles/base.css')).toMatch(/\nhtml \{\s*background: #000;/)
    expect(css('src/styles/shell-v2.css').match(/\n\.shellV2 \{[^}]*\}/)?.[0]).toMatch(/background: #000;/)
    expect(index).toMatch(/name="theme-color" content="#000000"/)
    const manifest = JSON.parse(read('public/manifest.webmanifest'))
    expect(manifest.background_color).toBe('#000000')
    expect(manifest.theme_color).toBe('#000000')
    const offline = read('public/offline.html')
    expect(offline).toMatch(/html, body \{ margin: 0; height: 100%; background: #000; color-scheme: dark; \}/)
    expect(offline.match(/\.ngScreen \{[^}]*\}/)?.[0]).toMatch(/background: #000;/)
    expect(offline).toMatch(/name="theme-color" content="#000000"/)
    // после «чёрного» запуска нигде не должен всплыть прежний #0b0d10 на этапах до ленты
    for (const t of [index.match(/<style>html[^<]*<\/style>/)[0], splashCss, offline.match(/<style>[\s\S]*?<\/style>/)[0]]) {
      expect(t).not.toMatch(/#0b0d10/i)
    }
  })
})
