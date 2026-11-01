// Кадры видео серой кошки: страница считает всё от времени (render(t)), здесь — цикл по кадрам. node gray_cat_video_frames.cjs <страница.html> <папка_кадров> <fps>
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path')
;(async () => {
  const [, , page_, dir, fpsS] = process.argv, fps = +fpsS
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--no-sandbox'] }); const p = await b.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1.4 })
  const errs = []; p.on('pageerror', e => errs.push(String(e)))
  await p.goto('file://' + path.resolve(page_.split('#')[0]) + (page_.includes('#') ? '#' + page_.split('#')[1] : '')); await p.waitForTimeout(300)
  const total = await p.evaluate(() => TL.total), n = Math.round(total * fps)
  const r = await p.evaluate(() => { const a = document.getElementById('stage').getBoundingClientRect(); return { x: Math.round(a.x), y: Math.round(a.y), width: Math.round(a.width) & ~1, height: Math.round(a.height) & ~1 } })   // кадр — только сцена, чётные размеры для h264
  for (let i = 0; i < n; i++) {
    await p.evaluate(t => render(t), i / fps)
    fs.writeFileSync(path.join(dir, `f_${String(i).padStart(4, '0')}.jpg`), await p.screenshot({ type: 'jpeg', quality: 94, clip: r }))
  }
  if (errs.length) console.log('ошибки страницы:', errs); await b.close()
})()
