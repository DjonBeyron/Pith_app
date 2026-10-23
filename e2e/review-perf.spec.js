import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { importLesson } from '../src/features/canvas/lesson-io/importLesson.js'
import { fromCanvasNodes } from '../src/features/canvas/lesson-io/lessonLint.js'
import { makeSnapshot, pushVersion } from '../src/features/canvas/review/lessonVersions.js'

// Стенд «Разбор урока» (e2e/review-perf/bench.html, dev-сервер с мёртвым Supabase, проект review-perf): настоящий LessonReviewPanel на уроке «I'm»
// (lesson-drafts/im.json, 300 нод). Берегут от возврата того, что делало разбор неподъёмным (PROJECT.md «Тормоза разбора», 2026-10-23):
// <option> на каждую ноду в каждом списке переходов (135 тысяч узлов), ручная обработка колеса, окна с задержкой в секунды, и проверяют
// «Изменения» с локальной версией. Пороги с запасом на медленный CI — ловят порядок, а не проценты
const BENCH_URL = '/e2e/review-perf/bench.html?lesson=im'
const ready = async page => { await page.goto(BENCH_URL); await page.waitForSelector('.rvwBoardWrap .canvasBoard', { timeout: 60_000 }); await page.waitForTimeout(800) }

test('DOM разбора лёгкий: нет десятков тысяч <option>', async ({ page }) => {
  await ready(page)
  const c = await page.evaluate(() => ({ all: document.querySelectorAll('*').length, options: document.querySelectorAll('option').length, lesson: window.__bench.nodes }))
  expect(c.lesson).toBeGreaterThan(250)
  expect(c.options, `<option> в DOM: ${c.options} (было 135 876: список нод в каждом выпадающем переходе)`).toBeLessThan(6000)
  expect(c.all, `узлов в DOM: ${c.all} (было 159 тысяч)`).toBeLessThan(60_000)
})

test('окна замечания и списка открываются и закрываются быстро', async ({ page }) => {
  await ready(page)
  const slot = (await page.$$('.rvwFeedCol .rvwSlot'))[8]
  await slot.hover()
  const t0 = Date.now(); await slot.$eval('.rvwTool[aria-label="Замечание"]', b => b.click()); await page.waitForSelector('.rvwNtBox'); const open = Date.now() - t0
  const t1 = Date.now(); await page.click('.rvwNtHead button:has-text("Закрыть")'); await page.waitForSelector('.rvwNtBox', { state: 'detached' }); const close = Date.now() - t1
  expect(open, 'открытие окна замечания, мс').toBeLessThan(2500)
  expect(close, 'закрытие окна замечания, мс').toBeLessThan(2500)
})

test('колесо крутит ленту нативно из любой точки рамки телефона', async ({ page }) => {
  await ready(page)
  const phone = await (await page.$('.rvwFeedCol .rvwPhone')).boundingBox()
  let bad = 0
  for (let i = 0; i < 25; i++) {
    const x = phone.x + 3 + ((i * 37) % Math.floor(phone.width - 6)), y = phone.y + 3 + ((i * 91) % Math.floor(phone.height - 6))
    await page.evaluate(() => { document.querySelector('.rvwPlayerFeed').scrollTop = 3000 })
    await page.mouse.move(x, y)
    const before = await page.evaluate(() => document.querySelector('.rvwPlayerFeed').scrollTop)
    await page.mouse.wheel(0, 150); await page.waitForTimeout(120)
    const after = await page.evaluate(() => document.querySelector('.rvwPlayerFeed').scrollTop)
    if (after - before < 100) bad++
  }
  expect(bad, 'точек, где колесо не прокрутило ленту').toBe(0)
})

test('«Изменения»: сравнение с локальной версией и «Только изменённые» (в том числе ветки вне ленты)', async ({ browser }) => {
  const json = JSON.parse(readFileSync(new URL('../lesson-drafts/im.json', import.meta.url), 'utf8'))
  const old = structuredClone(json)
  let n = 0
  for (const node of old.nodes) if (node.type === 'text' && n < 3 && node.seq > 20) node.data.content = `СТАРЫЙ ТЕКСТ ${n++}`
  old.nodes = old.nodes.filter(x => x.seq !== 30)
  const versions = pushVersion([], makeSnapshot(fromCanvasNodes(importLesson(old).nodes)), Date.now() - 86_400_000)
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  await ctx.addInitScript(v => localStorage.setItem('pithy-versions:bench-review', JSON.stringify(v)), versions)
  const page = await ctx.newPage()
  await page.goto(BENCH_URL)
  await page.waitForSelector('.rvwFeedCol .rvwSlot')
  await page.click('.rvwBtnChg')
  await expect(page.locator('.rvwBtnChg').first()).toContainText(/Изменения \(\d+\)/)
  await expect(page.locator('.rvwVerSel option')).toHaveCount(1)
  await page.click('button:has-text("Только изменённые")')
  const slots = await page.locator('.rvwFeedCol .rvwSlot').count()
  expect(slots).toBeGreaterThan(2)
  expect(slots).toBeLessThan(30)
  await page.click('button:has-text("Только изменённые")')
  expect(await page.locator('.rvwFeedCol .rvwSlot').count()).toBeGreaterThan(250)
  await ctx.close()
})
