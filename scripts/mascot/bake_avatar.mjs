// Запекает аватарку Пита (фиолетовый маскот) для шапки чата в маленькую картинку: голова крупно на светлом фоне, квадрат SIZE×SIZE px.
// Шапка показывает её в круге 36 px, поэтому 108 px (3×) хватает на любой экран; в WebP это ≈3–4 КБ — Vite вставляет такой файл в код (data URI),
// запросов и декодирования SVG нет. Запуск: node scripts/mascot/bake_avatar.mjs <куда.png>, затем PNG → WebP (run.sh: PIL, качество 82).
import { chromium } from 'playwright'
const out = process.argv[2]
if (!out) { console.error('нужен путь выходного PNG'); process.exit(1) }
const R = new URL('../../src/features/scene/v2/sprites/', import.meta.url)
const { buildMascot } = await import(new URL('mascot/mascotSprite.js', R).href)
const { treeToString } = await import(new URL('svgTree.js', R).href)
const SIZE = 108, BG = '#e6dcff', PAD = 1.0
const markup = treeToString(buildMascot('kit', { face: 'base', flip: true }))
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined })
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } })
// 1) где голова в координатах спрайта 200×240 (замер при 4 px на единицу)
await page.setContent(`<svg id="s" viewBox="0 0 200 240" width="800" height="960">${markup}</svg>`)
const r = await page.evaluate(() => { const b = document.querySelector('[data-part="head"]').getBoundingClientRect(); const o = document.getElementById('s').getBoundingClientRect(); return { x: (b.x - o.x) / 4, y: (b.y - o.y) / 4, w: b.width / 4, h: b.height / 4 } })
const side = Math.max(r.w, r.h) * PAD, cx = r.x + r.w / 2, cy = r.y + r.h / 2
const vb = `${(cx - side / 2).toFixed(2)} ${(cy - side / 2).toFixed(2)} ${side.toFixed(2)} ${side.toFixed(2)}`
// 2) сама картинка
await page.setViewportSize({ width: SIZE, height: SIZE })
await page.setContent(`<body style="margin:0;background:${BG}"><svg viewBox="${vb}" width="${SIZE}" height="${SIZE}" style="display:block">${markup}</svg></body>`)
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: SIZE, height: SIZE } })
await browser.close()
console.log('аватарка:', out, 'кадр', vb)
