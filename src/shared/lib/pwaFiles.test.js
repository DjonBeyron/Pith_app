import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Сторож установки как приложения (PWA): манифест полный и ссылается на существующие иконки нужного размера,
// у иконки maskable — свой файл (не копия «any»), сервис-воркер с fetch-обработчиком, который ничего не кэширует
const PUBLIC = resolve(import.meta.dirname, '../../../public')
const manifest = JSON.parse(readFileSync(resolve(PUBLIC, 'manifest.webmanifest'), 'utf8'))
const pngSize = file => {
  const b = readFileSync(resolve(PUBLIC, file.replace(/^\//, '')))
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}` // IHDR: ширина и высота
}

describe('манифест приложения', () => {
  it('обязательные поля установки Chrome/Android', () => {
    expect(manifest.name).toBeTruthy()
    expect(manifest.short_name).toBeTruthy()
    expect(manifest.id).toBe('/')
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true)
    expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(manifest.display)
  })

  it('иконки: 192 и 512 «any» + отдельная 512 maskable; файлы есть, размеры настоящие', () => {
    const find = (size, purpose) => manifest.icons.find(i => i.sizes === size && i.purpose === purpose)
    for (const icon of [find('192x192', 'any'), find('512x512', 'any'), find('512x512', 'maskable')]) {
      expect(icon, 'иконка объявлена').toBeTruthy()
      expect(existsSync(resolve(PUBLIC, icon.src.replace(/^\//, ''))), icon.src).toBe(true)
      expect(pngSize(icon.src), `${icon.src}: размер файла = объявленному`).toBe(icon.sizes)
    }
    expect(find('512x512', 'maskable').src).not.toBe(find('512x512', 'any').src)
  })
})

describe('сервис-воркер push-sw.js', () => {
  const sw = readFileSync(resolve(PUBLIC, 'push-sw.js'), 'utf8')

  it('есть fetch-обработчик — только для загрузки страниц (navigate)', () => {
    expect(sw).toMatch(/addEventListener\('fetch'/)
    expect(sw).toMatch(/request\.mode === 'navigate'/)
  })

  it('кэширует только офлайн-страницу (кэш offline-*), ничего больше', () => {
    expect(sw).toMatch(/OFFLINE_CACHE = 'offline-v5'/) // версия поднимается при каждом изменении offline.html
    expect(sw).toMatch(/OFFLINE_URL = '\/offline\.html'/)
    expect(sw).not.toMatch(/cache\.put|addAll/)
    expect(sw.match(/c\.add\(/g)).toHaveLength(1)
    expect(existsSync(resolve(PUBLIC, 'offline.html'))).toBe(true)
  })

  it('навигация не ждёт молчащую сеть дольше ~4с и отдаёт офлайн-страницу сразу без сети', () => {
    expect(sw).toMatch(/NAV_TIMEOUT_MS = 4000/)
    expect(sw).toMatch(/navigator\.onLine === false/)
    expect(sw).toMatch(/type === 'net-ok'/)
  })

  it('офлайн-страница самодостаточна: без внешних ресурсов, с кнопкой «Повторить»', () => {
    const html = readFileSync(resolve(PUBLIC, 'offline.html'), 'utf8')
    expect(html).not.toMatch(/(src|href)="https?:/)
    expect(html).toMatch(/Повторить/)
    expect(html).toMatch(/location\.reload\(\)/)
  })

  it('push-уведомления на месте', () => {
    expect(sw).toMatch(/addEventListener\('push'/)
    expect(sw).toMatch(/addEventListener\('notificationclick'/)
  })
})

// Стартовые картинки iOS (apple-touch-startup-image): iOS берёт картинку ТОЛЬКО при точном совпадении
// device-width/height/ratio с экраном, иначе до загрузки страницы виден пустой кадр → «моргание» при запуске
describe('стартовые картинки iOS', () => {
  const ROOT = resolve(import.meta.dirname, '../../..')
  const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8')
  const script = readFileSync(resolve(ROOT, 'scripts/make-brand-assets.mjs'), 'utf8')
  // [ширина, высота, ratio] css-пикселей — все iPhone от SE 1 до 17 Pro Max
  const IPHONES = [
    [320, 568, 2], [375, 667, 2], [414, 736, 3], [375, 812, 3], [414, 896, 2], [414, 896, 3],
    [390, 844, 3], [428, 926, 3], [393, 852, 3], [430, 932, 3], [402, 874, 3], [440, 956, 3], [420, 912, 3],
  ]
  const links = [...html.matchAll(/<link rel="apple-touch-startup-image" media="([^"]+)" href="([^"]+)"/g)]
    .map(m => ({ media: m[1], href: m[2] }))
  const key = (w, h, r) => `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`

  it('каждый iPhone покрыт ссылкой с портретной ориентацией и точным размером', () => {
    for (const [w, h, r] of IPHONES) {
      const link = links.find(l => l.media === key(w, h, r))
      expect(link, `нет картинки для ${w}x${h}@${r}x`).toBeTruthy()
      expect(link.href).toBe(`/splash/startup-${w * r}x${h * r}.png`)
    }
    expect(links).toHaveLength(IPHONES.length)
  })

  it('файлы есть, пиксельный размер = css × ratio, весят мало (чёрный фон + лого)', () => {
    for (const { href } of links) {
      expect(existsSync(resolve(PUBLIC, href.replace(/^\//, ''))), href).toBe(true)
      expect(pngSize(href), href).toBe(href.match(/startup-(\d+x\d+)\.png/)[1])
      expect(readFileSync(resolve(PUBLIC, href.replace(/^\//, ''))).length, href).toBeLessThan(40_000)
    }
  })

  it('список устройств скрипта генерации совпадает со ссылками', () => {
    const block = script.match(/const DEVICES = \[([\s\S]*?)\n\]/)[1]
    const fromScript = [...block.matchAll(/\[(\d+), (\d+), (\d)\]/g)].map(m => m.slice(1).map(Number).join('x'))
    expect(fromScript.sort()).toEqual(IPHONES.map(d => d.join('x')).sort())
  })

  it('сплэш страницы подстраивается под зону статус-бара iOS (иначе лого прыгает при смене «система → страница»)', () => {
    expect(html).toMatch(/navigator\.standalone/)
    expect(html).toMatch(/window\.screen\.height - window\.innerHeight/)
    expect(html).toMatch(/el\.style\.paddingBottom = zone/)
    expect(html).toMatch(/#splash \{[^}]*position: fixed; inset: 0/) // без vh/dvh: размер от окна, не от высоты
  })

  it('net-guard не перезагружает идущую загрузку по событию online (iOS шлёт его на холодном старте)', () => {
    const guard = readFileSync(resolve(PUBLIC, 'net-guard.js'), 'utf8')
    expect(guard).toMatch(/!finished && !mounted\(\) && \(kind !== null \|\| failedAt !== null\)/)
  })

  it('нет автоматических перезагрузок на старте: reload только по кнопке/после ошибки', () => {
    const SRC = resolve(import.meta.dirname, '../..')
    expect(readFileSync(resolve(SRC, 'main.jsx'), 'utf8')).not.toMatch(/reload|controllerchange/)
    expect(readFileSync(resolve(PUBLIC, 'push-sw.js'), 'utf8')).not.toMatch(/\.reload\(/)
  })
})
