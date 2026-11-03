// Замер контура головы кота по лицам: bbox заливки головы (первый <path> лица) в px экрана + скриншоты и наложение. Запуск: PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node _stand/cat_heads/measure.mjs <папка вывода>
import { chromium } from '@playwright/test'
const out = process.argv[2] || '.'
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] })
const p = await b.newPage({ viewport: { width: 400, height: 340 }, deviceScaleFactor: 2 })
await p.goto('http://localhost:5199/_stand/cat_heads/index.html')
await p.waitForFunction(() => window.__ready)
await p.waitForTimeout(900)
const res = {}
for (const face of ['base', 'love', 'shy']) {
  await p.evaluate(f => window.__api.react(f, 99999), face)
  await p.waitForTimeout(700)
  res[face] = await p.evaluate(f => {
    const head = document.querySelector(`[data-part="head"][data-face="${f}"]`)
    const fill = head.querySelector('path')
    const r = fill.getBoundingClientRect()
    // контур: точки обводки заливки, переведённые в экран
    const m = fill.getScreenCTM(), len = fill.getTotalLength(), pts = []
    for (let i = 0; i < 400; i++) { const q = fill.getPointAtLength(len * i / 400); pts.push([q.x * m.a + q.y * m.c + m.e, q.x * m.b + q.y * m.d + m.f]) }
    return { x: r.x, y: r.y, w: r.width, h: r.height, pts }
  }, face)
  await p.screenshot({ path: `${out}/face_${face}.png` })
}
const ref = res.base
for (const f of ['love', 'shy']) {
  const d = res[f]
  const maxd = Math.max(...d.pts.map((q, i) => Math.hypot(q[0] - ref.pts[i][0], q[1] - ref.pts[i][1])))
  console.log(f, 'bbox dx', (d.x - ref.x).toFixed(3), 'dy', (d.y - ref.y).toFixed(3), 'dw', (d.w - ref.w).toFixed(3), 'dh', (d.h - ref.h).toFixed(3), 'max точка контура px', maxd.toFixed(3))
}
console.log('base bbox', ref.x.toFixed(2), ref.y.toFixed(2), ref.w.toFixed(2), ref.h.toFixed(2))
await b.close()
