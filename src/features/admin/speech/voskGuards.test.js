import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { collectPrecache, NEVER_PRECACHE } from '../../../../tools/viteShellCache.js'

// Стражи Vosk: нет авто-скачивания/авто-загрузки без кнопки; чанк библиотеки и модель не попадают в кеш оболочки;
// service worker не трогает чужие хосты (R2 / github.io) и кеш vosk-models-v1; CSP остаётся Report-Only.
const here = name => readFileSync(resolve(import.meta.dirname, name), 'utf8')
const root = name => readFileSync(resolve(import.meta.dirname, '../../../../', name), 'utf8')
const SW_CORE = (() => { const ctx = {}; vm.runInNewContext(root('public/sw-core.js'), ctx); return ctx.PithySwCore })()

describe('нет скачивания и загрузки без нажатия кнопки', () => {
  const block = here('VoskModelBlock.jsx')
  it('сетевое скачивание разрешается в одном месте (start) и вызывается только из обработчиков кнопок', () => {
    expect(block.match(/allowNetwork: true/g)).toHaveLength(1)
    const starts = [...block.matchAll(/(?<!function )\bstart\(\)/g)].length
    expect(starts).toBe(1) // единственный вызов — в press() (onClick «Скачать»)
    expect(block).toMatch(/function press\(\)[^}]*start\(\)/)
    expect(block).toMatch(/onClick=\{press\}/)
    expect(block).toMatch(/onClick=\{start\}/) // подтверждение на мобильной сети
  })
  it('эффекты (useEffect) только читают статус кеша: ни start, ни getModel, ни fetch', () => {
    for (const m of block.matchAll(/useEffect\(([^\n]*)\n?/g)) expect(m[1]).not.toMatch(/start|getModel|fetch|download/)
  })
  it('VoskLab не качает из сети и грузит движок только из loadIt по кнопке', () => {
    const lab = here('VoskLab.jsx')
    expect(lab).not.toMatch(/allowNetwork|downloadModel|fetch\(/)
    expect(lab.match(/\bloadEngine\(/g)).toHaveLength(1)
    expect(lab).toMatch(/onClick=\{loadIt\}/)
    expect(lab).not.toMatch(/useEffect\([^\n]*loadIt/)
  })
  it('библиотека vosk-browser подключается только динамически (в бандл приложения не входит)', () => {
    for (const f of ['voskEngine.js', 'VoskLab.jsx', 'VoskModelBlock.jsx', 'VoskVocabTest.jsx']) expect(here(f)).not.toMatch(/^import[^\n]*['"]vosk-browser['"]/m)
    expect(here('voskEngine.js')).toMatch(/await import\('vosk-browser'\)/)
  })
})

describe('кеш оболочки и service worker не трогают модель', () => {
  it('чанк vosk исключён из предзагрузки', () => {
    expect(NEVER_PRECACHE.test('assets/vosk-Cza5_fLh.js')).toBe(true)
    const { urls } = collectPrecache([{ path: 'index.html', size: 1 }, { path: 'assets/index-a.js', size: 1 }, { path: 'assets/vosk-Cza5_fLh.js', size: 5800000 }])
    expect(urls.some(u => u.includes('vosk'))).toBe(false)
  })
  it('запросы к чужому хосту (R2, github.io) воркер не перехватывает', () => {
    for (const pathname of ['/chat/abc.gz', '/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz', '/assets/vosk-x.js']) {
      expect(SW_CORE.route({ pathname, search: '', sameOrigin: false, method: 'GET', mode: 'cors', cache: 'no-store' }, new Set())).toBe('skip')
    }
  })
  it('кеш vosk-models-v1 воркер не считает своим и не удаляет', () => {
    expect(SW_CORE.isShellName('vosk-models-v1')).toBe(false)
    const sw = root('public/push-sw.js')
    expect(sw).not.toMatch(/vosk|r2\.dev|github\.io/i)
    for (const m of sw.matchAll(/caches\.delete\(([^)]*)\)/g)) expect(m[1]).not.toMatch(/vosk/)
    expect(sw).toMatch(/k\.startsWith\('offline-'\)/) // чистка по префиксу, а не «всё, что не наше»
  })
  it('CSP на Vercel пока только Report-Only (блокирует лишь frame-ancestors); worker-src и connect-src знают blob:', () => {
    const headers = JSON.parse(root('vercel.json')).headers.flatMap(h => h.headers)
    const enforced = headers.find(h => h.key === 'Content-Security-Policy').value
    const report = headers.find(h => h.key === 'Content-Security-Policy-Report-Only').value
    expect(enforced).toBe("frame-ancestors 'self' https://web.telegram.org")
    expect(report).toMatch(/worker-src[^;]*blob:/)
    expect(report).toMatch(/connect-src[^;]*blob:/)
  })
})
