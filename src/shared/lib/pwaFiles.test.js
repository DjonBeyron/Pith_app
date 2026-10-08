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
    expect(sw).toMatch(/OFFLINE_CACHE = 'offline-v\d+'/)
    expect(sw).toMatch(/OFFLINE_URL = '\/offline\.html'/)
    expect(sw).not.toMatch(/cache\.put|addAll/)
    expect(sw.match(/c\.add\(/g)).toHaveLength(1)
    expect(existsSync(resolve(PUBLIC, 'offline.html'))).toBe(true)
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
