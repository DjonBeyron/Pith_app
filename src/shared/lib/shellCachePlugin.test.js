import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { collectPrecache, computeBuildId, applySwPlaceholders, applyHtmlBuild, walk, shellCachePlugin, PRECACHE_LIMIT } from '../../../tools/viteShellCache.js'

// Плагин кеша оболочки (tools/viteShellCache.js): список предзагрузки, BUILD_ID, подстановка токенов в push-sw.js и index.html
const SW_SRC = readFileSync(resolve(import.meta.dirname, '../../../public/push-sw.js'), 'utf8')
const f = (path, size = 1000) => ({ path, size })
const FILES = [f('index.html'), f('assets/index-a.js', 5000), f('assets/Lazy-b.js', 4000), f('assets/index-c.css', 3000),
  f('manifest.webmanifest'), f('net-guard.js'), f('icons/icon-192.png'), f('favicon.svg'), f('sounds/a.mp3', 90000), f('lab/l1.html'),
  f('offline.html'), f('push-sw.js'), f('sw-core.js'), f('version.json'), f('splash/x.png')]

describe('collectPrecache', () => {
  it('index.html («/»), все /assets/*, манифест, net-guard.js и иконки; звуки, лаборатория, воркер, favicon, offline — нет', () => {
    const { urls, lazyOmitted } = collectPrecache(FILES)
    expect(urls[0]).toBe('/')
    expect(urls).toEqual(['/', '/assets/Lazy-b.js', '/assets/index-a.js', '/assets/index-c.css', '/icons/icon-192.png', '/manifest.webmanifest', '/net-guard.js'])
    expect(urls).not.toContain('/favicon.svg') // net-guard пингует его мимо кеша
    expect(lazyOmitted).toBe(0)
  })

  it('тяжелее лимита — только файлы из index.html (первый кадр), ленивые чанки докладываются по мере использования', () => {
    const html = '<script type="module" src="/assets/index-a.js"></script><link href="/assets/index-c.css" rel="stylesheet">'
    const { urls, lazyOmitted } = collectPrecache(FILES, { limit: 10000, html })
    expect(urls).toContain('/assets/index-a.js')
    expect(urls).toContain('/assets/index-c.css')
    expect(urls).not.toContain('/assets/Lazy-b.js')
    expect(urls).toContain('/net-guard.js')
    expect(lazyOmitted).toBe(1)
    expect(PRECACHE_LIMIT).toBe(20 * 1024 * 1024)
  })
})

describe('computeBuildId', () => {
  const a = [{ path: '/', hash: 'h1' }, { path: '/assets/x.js', hash: 'h2' }]
  it('версия + 8 символов хеша; не зависит от порядка; меняется при изменении любого файла', () => {
    const id = computeBuildId('3.2.1', a)
    expect(id).toMatch(/^3\.2\.1-[0-9a-f]{8}$/)
    expect(computeBuildId('3.2.1', [...a].reverse())).toBe(id)
    expect(computeBuildId('3.2.1', [a[0], { path: '/assets/x.js', hash: 'CHANGED' }])).not.toBe(id)
    expect(computeBuildId('3.2.1', [...a, { path: '/n.js', hash: 'h3' }])).not.toBe(id)
  })
})

describe('подстановка токенов', () => {
  it('push-sw.js: BUILD_ID, версия и список подставлены, токенов не осталось, файл остаётся валидным JS', () => {
    const out = applySwPlaceholders(SW_SRC, { buildId: '3.2.1-ab12cd34', version: '3.2.1', precache: ['/', '/assets/a.js'] })
    expect(out).toContain('const BUILD_ID = "3.2.1-ab12cd34"')
    expect(out).toContain('const APP_VER = "3.2.1"')
    expect(out).toContain('const PRECACHE = ["/","/assets/a.js"]')
    expect(out).not.toMatch(/'__(BUILD_ID|APP_VERSION|PRECACHE)__'/)
    expect(() => new Function(out)).not.toThrow() // синтаксис цел (importScripts/self не вызываются)
  })

  it('исходник без токена — сборка падает громко, а не выпускает воркер с выключенным кешем', () => {
    expect(() => applySwPlaceholders('const x = 1', { buildId: 'b', version: 'v', precache: [] })).toThrow(/токен/)
  })

  it('спецпоследовательности $& в списке не ломают подстановку', () => {
    const out = applySwPlaceholders(SW_SRC, { buildId: 'b$&', version: 'v', precache: ['/$1'] })
    expect(out).toContain('"b$&"')
    expect(out).toContain('["/$1"]')
  })

  it('index.html: метка сборки подставлена', () => {
    expect(applyHtmlBuild('<meta name="pithy-build" content="__BUILD_ID__" />', 'X-1')).toBe('<meta name="pithy-build" content="X-1" />')
  })
})

describe('плагин на настоящей папке сборки', () => {
  let dir
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

  it('closeBundle: precache.json, подстановка в dist/push-sw.js и dist/index.html; повторная сборка того же — тот же BUILD_ID', () => {
    const build = () => {
      dir = mkdtempSync(join(tmpdir(), 'shell-'))
      mkdirSync(join(dir, 'assets')); mkdirSync(join(dir, 'icons'))
      writeFileSync(join(dir, 'index.html'), '<meta name="pithy-build" content="__BUILD_ID__"><script src="/assets/index-a.js"></script>')
      writeFileSync(join(dir, 'assets/index-a.js'), 'console.log(1)')
      writeFileSync(join(dir, 'icons/i.png'), 'png')
      writeFileSync(join(dir, 'net-guard.js'), 'guard')
      writeFileSync(join(dir, 'sw-core.js'), 'core')
      writeFileSync(join(dir, 'push-sw.js'), SW_SRC)
      const plugin = shellCachePlugin({ version: '9.9.9' })
      plugin.configResolved({ root: dir, build: { outDir: '.' } })
      plugin.closeBundle()
      return { json: JSON.parse(readFileSync(join(dir, 'precache.json'), 'utf8')), sw: readFileSync(join(dir, 'push-sw.js'), 'utf8'), html: readFileSync(join(dir, 'index.html'), 'utf8') }
    }
    const first = build()
    expect(first.json.files).toEqual(['/', '/assets/index-a.js', '/icons/i.png', '/net-guard.js'])
    expect(first.sw).toContain(`const BUILD_ID = "${first.json.buildId}"`)
    expect(first.html).toContain(`content="${first.json.buildId}"`)
    expect(walk(dir).map(x => x.path)).toContain('precache.json')
    rmSync(dir, { recursive: true, force: true })
    expect(build().json.buildId).toBe(first.json.buildId)
  })
})
