// Снимок страницы gray_cat_lineup.py: node gray_cat_lineup.cjs <страница.html> <картинка.png>
const { chromium } = require('playwright'); const path = require('path')
;(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--no-sandbox'] }); const p = await b.newPage({ viewport: { width: 1800, height: 940 }, deviceScaleFactor: 1 }); const errs = []; p.on('pageerror', e => errs.push(String(e)))
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(400); await p.screenshot({ path: process.argv[3] }); if (errs.length) console.log(errs); await b.close()
})()
