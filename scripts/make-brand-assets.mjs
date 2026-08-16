// Генерация растровых ассетов бренда из public/logo.svg:
//   public/icons/icon-{180,192,512}.png — иконка приложения (PWA, apple-touch)
//   public/icons/favicon-{32,64}.png     — вкладка браузера, знак без подложки
//   public/splash/startup-WxH.png       — стартовые экраны iOS
//
// Рендерим через headless Edge/Chrome: браузер уже есть в системе, а тянуть
// в проект бинарные зависимости ради разовой перерисовки логотипа незачем.
//   node scripts/make-brand-assets.mjs
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, rmSync, renameSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const BG = '#0b0d10'

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
]
const browser = BROWSERS.find(p => existsSync(p))
if (!browser) {
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
  const page = join(work, 'page.html')
  writeFileSync(page, html, 'utf8')
  execFileSync(browser, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
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

// Стартовый экран: фон приложения + логотип без подложки, чуть выше центра —
// как flex-центрированный блок «лого + подпись» в index.html
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

console.log('Иконки приложения:')
for (const size of [180, 192, 512]) {
  shot(iconHtml(size), size, size, join(root, `public/icons/icon-${size}.png`))
}

console.log('Иконки вкладки браузера:')
for (const size of [32, 64]) {
  shot(faviconHtml(size), size, size, join(root, `public/icons/favicon-${size}.png`), true)
}

console.log('Стартовые экраны iOS:')
for (const [cssW, cssH, dpr] of DEVICES) {
  const w = cssW * dpr, h = cssH * dpr
  shot(splashHtml(w, h, dpr), w, h, join(root, `public/splash/startup-${w}x${h}.png`))
}

rmSync(work, { recursive: true, force: true })
console.log('Готово.')
