// Генерация растровых ассетов бренда из public/logo.svg:
//   public/icons/icon-{180,192,512}.png — иконка приложения (PWA, apple-touch)
//   public/icons/favicon-{32,64}.png     — вкладка браузера, знак без подложки
//   public/splash/startup-WxH.png       — стартовые экраны iOS: ЧИСТЫЙ ЧЁРНЫЙ #000 БЕЗ лого (по умолчанию)
//
// Иконки рендерим через headless Edge/Chrome: браузер уже есть в системе, а тянуть
// в проект бинарные зависимости ради разовой перерисовки логотипа незачем.
//   node scripts/make-brand-assets.mjs
// Стартовые экраны по умолчанию браузер не используют: однотонный PNG собирается напрямую
// (обычный 8-bit RGB, truecolor, без палитры и альфы; одни нули сжимаются deflate до ~3–11 КБ). SPLASH_LOGO=1 — старый вид (с лого).
import { execFileSync } from 'node:child_process'
import { deflateSync } from 'node:zlib'
import { Buffer } from 'node:buffer'
import { mkdirSync, readFileSync, writeFileSync, rmSync, renameSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// Фон стартовых экранов = фон всех этапов запуска (index.html, manifest, base.css): чистый чёрный, как
// системные кадры iOS, которые перекрасить нельзя (см. комментарий в index.html)
const BG = '#000000'

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
]
// NO_SANDBOX=1 — для запуска под root на Linux. BROWSER_PATH — свой путь к Chrome/Chromium (например, под Linux: BROWSER_PATH=/opt/pw-browsers/chromium)
const browser = process.env.BROWSER_PATH || BROWSERS.find(p => existsSync(p))
// Браузер нужен только для иконок и для стартовых экранов с лого — проверяем в момент рендера
function needBrowser() {
  if (browser) return
  console.error('Не найден Edge или Chrome — из чего рендерить PNG?')
  process.exit(1)
}

const logo = readFileSync(join(root, 'public/logo.svg'), 'utf8')
const logoPlain = readFileSync(join(root, 'public/logo-plain.svg'), 'utf8')
// PNG-запаска рисуется один раз и не умеет подстраиваться под тему вкладки,
// поэтому буквы в ней всегда тёмные — светлых вкладок подавляющее большинство
const logoFaviconPng = logoPlain.replaceAll('fill="white"', 'fill="#1B0D30"')

// Экраны iPhone, для которых iOS берёт стартовую картинку (нужен точный размер)
const DEVICES = [
  [320, 568, 2], [375, 667, 2], [414, 736, 3], [375, 812, 3],
  [414, 896, 2], [414, 896, 3], [390, 844, 3], [428, 926, 3],
  [393, 852, 3], [430, 932, 3], [402, 874, 3], [440, 956, 3],
  [420, 912, 3],
]

const work = join(tmpdir(), 'heta-brand')
mkdirSync(work, { recursive: true })

function shot(html, w, h, out, transparent = false) {
  needBrowser()
  const page = join(work, 'page.html')
  writeFileSync(page, html, 'utf8')
  execFileSync(browser, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    ...(process.env.NO_SANDBOX ? ['--no-sandbox'] : []), // Linux под root
    '--force-device-scale-factor=1',
    ...(transparent ? ['--default-background-color=00000000'] : []),
    `--screenshot=${join(work, 'shot.png')}`,
    `--window-size=${w},${h}`,
    `--user-data-dir=${join(work, 'profile')}`,
    'file:///' + page.replace(/\\/g, '/'),
  ], { stdio: 'ignore' })
  mkdirSync(dirname(out), { recursive: true })
  renameSync(join(work, 'shot.png'), out)
  console.log('  ' + out.replace(root, '.').replace(/\\/g, '/'))
}

// Иконка приложения: знак с подложкой, залитой в край — iOS скругляет сама
function iconHtml(size) {
  return `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent}
    .box{width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;overflow:hidden}
    svg{width:${size}px;height:${size}px}
  </style><div class="box">${logo}</div>`
}

// Вкладка браузера: тот же знак, но без подложки и на прозрачном фоне —
// на светлой и на тёмной теме браузера он ложится одинаково
function faviconHtml(size) {
  return `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent}
    .box{width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center}
    svg{width:${size}px;height:${size}px}
  </style><div class="box">${logoFaviconPng}</div>`
}

// Однотонный PNG без браузера: 8 бит на канал, RGB (colorType 2), без палитры и альфы, фильтр 0, все пиксели одного цвета.
// Раньше был 1-bit indexed (~0.5 КБ): iOS мог показать такую картинку не чисто чёрной (серой), поэтому теперь обычный truecolor
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function pngChunk(type, data) {
  const head = Buffer.alloc(4)
  head.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(body))
  return Buffer.concat([head, body, tail])
}
function solidPng(w, h, [r, g, b]) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr.set([8, 2, 0, 0, 0], 8) // глубина 8 бит, truecolor RGB, deflate, фильтры, без interlace
  const rowBytes = 1 + w * 3 // байт фильтра 0 + RGB каждого пикселя
  const raw = Buffer.alloc(rowBytes * h)
  if (r || g || b) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set([r, g, b], y * rowBytes + 1 + x * 3)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}
const BG_RGB = [0, 0, 0]

// Стартовый экран С ЛОГО (SPLASH_LOGO=1, устаревший вид): фон приложения + логотип без подложки, чуть выше центра —
// как flex-центрированный блок «лого + подпись» в index.html. По умолчанию лого на картинке НЕТ: HTML-сплэш
// проявляет его сам из чёрного, и нативный кадр iOS с логотипом уже не нужно совмещать со страницей до пикселя
function splashHtml(w, h, dpr) {
  const logoPx = Math.round(92 * dpr)
  const shift = Math.round(19 * dpr)
  return `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:${BG}}
    .stage{width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center;background:${BG}}
    .wrap{margin-bottom:${shift * 2}px}
    svg{width:${logoPx}px;height:${logoPx}px;display:block}
  </style><div class="stage"><div class="wrap">${logoPlain}</div></div>`
}

// ONLY_SPLASH=1 — перерисовать только стартовые экраны (иконки не трогать)
if (!process.env.ONLY_SPLASH) {
  console.log('Иконки приложения:')
  for (const size of [180, 192, 512]) {
    shot(iconHtml(size), size, size, join(root, `public/icons/icon-${size}.png`))
  }

  console.log('Иконки вкладки браузера:')
  for (const size of [32, 64]) {
    shot(faviconHtml(size), size, size, join(root, `public/icons/favicon-${size}.png`), true)
  }
}

console.log(process.env.SPLASH_LOGO ? 'Стартовые экраны iOS (с лого):' : 'Стартовые экраны iOS (чистый чёрный, без лого):')
for (const [cssW, cssH, dpr] of DEVICES) {
  const w = cssW * dpr, h = cssH * dpr
  const out = join(root, `public/splash/startup-${w}x${h}.png`)
  if (process.env.SPLASH_LOGO) shot(splashHtml(w, h, dpr), w, h, out)
  else {
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, solidPng(w, h, BG_RGB))
    console.log('  ' + out.replace(root, '.').replace(/\\/g, '/'))
  }
}

rmSync(work, { recursive: true, force: true })
console.log('Готово.')
