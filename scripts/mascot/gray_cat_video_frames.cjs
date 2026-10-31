// Кадры видео серой кошки: страница считает всё от времени (render(t)), здесь — цикл по кадрам. node gray_cat_video_frames.cjs <страница.html> <папка_кадров> <fps>
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path')
;(async () => {
  const [, , page_, dir, fpsS] = process.argv, fps = +fpsS
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 })
  const errs = []; p.on('pageerror', e => errs.push(String(e)))
  await p.goto('file://' + path.resolve(page_)); await p.waitForTimeout(300)
  const total = await p.evaluate(() => TL.total), n = Math.round(total * fps)
  for (let i = 0; i < n; i++) {
    await p.evaluate(t => render(t), i / fps)
    fs.writeFileSync(path.join(dir, `f_${String(i).padStart(4, '0')}.jpg`), await p.screenshot({ type: 'jpeg', quality: 94 }))
  }
  if (errs.length) console.log('ошибки страницы:', errs); await b.close()
})()
