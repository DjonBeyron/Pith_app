import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { inflateSync } from 'node:zlib'
import { Buffer } from 'node:buffer'
import { LAB_PAGES, LAB_INDEX_PATH, LAB_RESULTS, LAB_HOWTO } from './startLabInfo.js'

// Страж «Лаборатории запуска» (Админ → «Старт», public/lab/*): пять страниц-веб-клипов с нужными meta и ссылками на существующие
// стартовые PNG, список страниц, лабораторный service worker и то, что основной воркер /lab/ не перехватывает
const ROOT = resolve(import.meta.dirname, '../../../..')
const PUB = resolve(ROOT, 'public')
const read = f => readFileSync(resolve(PUB, f), 'utf8')
const IPHONES = [
  [320, 568, 2], [375, 667, 2], [414, 736, 3], [375, 812, 3], [414, 896, 2], [414, 896, 3],
  [390, 844, 3], [428, 926, 3], [393, 852, 3], [430, 932, 3], [402, 874, 3], [440, 956, 3], [420, 912, 3],
]
const mediaOf = (w, h, r) => `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`
const mainHtml = readFileSync(resolve(ROOT, 'index.html'), 'utf8')
const startupLinks = html => [...html.matchAll(/<link rel="apple-touch-startup-image" media="([^"]+)" href="([^"]+)"/g)].map(m => ({ media: m[1], href: m[2] }))

// страница: [файл, папка PNG или null, цвет фона]
const PAGES = {
  1: ['/splash', '#000'], 2: ['/lab/splash-blue', '#000'], 3: ['/lab/splash-gray', '#1b1b1b'], 4: [null, '#000'], 5: ['/splash', '#000'],
}

describe('лаборатория запуска: страницы', () => {
  for (const [n, [dir, bg]] of Object.entries(PAGES)) {
    describe(`ЛАБ-${n}`, () => {
      const file = `lab/l${n}.html`
      it('существует и настроена как веб-клип без лишнего', () => {
        expect(existsSync(resolve(PUB, file))).toBe(true)
        const h = read(file)
        expect(h).toMatch(new RegExp(`<title>ЛАБ-${n} `))
        expect(h).toMatch(new RegExp(`<meta name="apple-mobile-web-app-title" content="ЛАБ-${n}"`))
        expect(h).toMatch(/<meta name="apple-mobile-web-app-capable" content="yes"/)
        expect(h).toMatch(/<meta name="apple-mobile-web-app-status-bar-style" content="black"/)
        expect(h).toMatch(/<link rel="apple-touch-icon" href="\/icons\/icon-180\.png"/)
        expect(h).toMatch(/viewport-fit=cover/)
        expect(h).toMatch(new RegExp(`<html lang="ru" style="background:${bg}"`))
        // чистый эксперимент: без манифеста, color-scheme и theme-color
        expect(h).not.toMatch(/rel="manifest"|name="color-scheme"|name="theme-color"/)
        expect(h).toMatch(new RegExp(`class="lab">ЛАБ-${n}`))
        expect(h).toMatch(/animation: labIn 0\.5s ease 700ms forwards/)
      })

      it(dir ? `ссылки на стартовые PNG (${dir}): 13 устройств, media как в основном index.html, файлы есть` : 'НИ ОДНОЙ ссылки apple-touch-startup-image', () => {
        const links = startupLinks(read(file))
        if (!dir) { expect(read(file)).not.toMatch(/<link[^>]*startup-image/); expect(links).toHaveLength(0); return }
        expect(links).toHaveLength(IPHONES.length)
        const main = startupLinks(mainHtml)
        for (const [w, h, r] of IPHONES) {
          const l = links.find(x => x.media === mediaOf(w, h, r))
          expect(l, `${w}x${h}@${r}x`).toBeTruthy()
          expect(l.href).toBe(`${dir}/startup-${w * r}x${h * r}.png`)
          expect(existsSync(resolve(PUB, l.href.slice(1))), l.href).toBe(true)
          expect(main.some(m => m.media === l.media), 'media совпадает с основным index.html').toBe(true)
        }
      })
    })
  }

  it('ЛАБ-1…4 без скриптов; ЛАБ-5 регистрирует lab-sw.js со scope /lab/', () => {
    for (const n of [1, 2, 3, 4]) expect(read(`lab/l${n}.html`), `l${n}`).not.toMatch(/<script/)
    expect(read('lab/l5.html')).toMatch(/register\('\/lab\/lab-sw\.js', \{ scope: '\/lab\/' \}\)/)
  })

  it('цветные наборы PNG: 13 размеров × 2, truecolor RGB, ровный цвет', () => {
    for (const [dir, rgb] of [['splash-blue', [10, 42, 102]], ['splash-gray', [27, 27, 27]]]) {
      const files = readdirSync(resolve(PUB, 'lab', dir)).filter(f => f.endsWith('.png'))
      expect(files, dir).toHaveLength(13)
      for (const f of files) {
        const b = readFileSync(resolve(PUB, 'lab', dir, f))
        expect(`${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`).toBe(f.match(/(\d+x\d+)/)[1])
        expect([b[24], b[25]], `${dir}/${f}: 8 бит, RGB`).toEqual([8, 2])
        // один IDAT после IHDR (8 + 25 байт): все строки = байт фильтра 0 + пиксели цвета набора
        const raw = inflateSync(Buffer.from(b.subarray(41, 41 + b.readUInt32BE(33))))
        const row = Buffer.from([0, ...Array(b.readUInt32BE(16)).fill(rgb).flat()])
        expect(raw.length, f).toBe(row.length * b.readUInt32BE(20))
        for (let y = 0; y < b.readUInt32BE(20); y += 97) expect(raw.subarray(y * row.length, (y + 1) * row.length).equals(row), `${dir}/${f} строка ${y}`).toBe(true)
      }
    }
  })
})

describe('лаборатория запуска: список, воркеры, vercel.json', () => {
  it('список /lab/index.html — обычная страница (не веб-клип) со ссылками на все пять', () => {
    const h = read('lab/index.html')
    expect(h).not.toMatch(/apple-mobile-web-app|apple-touch-startup-image/)
    for (const p of LAB_PAGES) expect(h, p.path).toContain(`href="${p.path}"`)
    expect(LAB_INDEX_PATH).toBe('/lab/index.html')
    expect(LAB_PAGES).toHaveLength(5)
    for (const p of LAB_PAGES) expect(existsSync(resolve(PUB, p.path.slice(1))), p.path).toBe(true)
    expect(LAB_HOWTO.length).toBeGreaterThan(0)
    expect(LAB_RESULTS.join(' ')).toMatch(/ЛАБ-1.*ЛАБ-2.*ЛАБ-3.*ЛАБ-4.*ЛАБ-5/)
  })

  it('lab-sw.js: cache-first только для /lab/l5.html, остальное не трогает', () => {
    const sw = read('lab/lab-sw.js')
    expect(sw).toMatch(/PAGE = '\/lab\/l5\.html'/)
    expect(sw).toMatch(/pathname !== PAGE\) return/)
    expect(sw).toMatch(/caches\.match\(PAGE/)
    expect(sw).toMatch(/skipWaiting/)
    expect(sw).toMatch(/clients\.claim/)
  })

  it('основной push-sw.js не перехватывает /lab/', () => {
    expect(read('push-sw.js')).toMatch(/startsWith\('\/lab\/'\)\) return/)
  })

  it('vercel.json: no-cache для /lab/*, Service-Worker-Allowed для lab-sw.js, нет rewrites на index.html', () => {
    const cfg = JSON.parse(readFileSync(resolve(ROOT, 'vercel.json'), 'utf8'))
    expect(cfg.rewrites).toBeUndefined()
    const lab = cfg.headers.find(h => h.source === '/lab/(.*)')
    expect(lab.headers).toContainEqual({ key: 'Cache-Control', value: 'no-cache' })
    const sw = cfg.headers.find(h => h.source === '/lab/lab-sw.js')
    expect(sw.headers).toContainEqual({ key: 'Service-Worker-Allowed', value: '/lab/' })
    expect(sw.headers).toContainEqual({ key: 'Cache-Control', value: 'no-cache' })
  })

  it('основной index.html не менялся под лабораторию (нет ссылок на /lab/)', () => {
    expect(mainHtml).not.toMatch(/\/lab\//)
  })
})
