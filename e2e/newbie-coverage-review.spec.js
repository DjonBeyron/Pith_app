import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { importLesson } from '../src/features/canvas/lesson-io/importLesson.js'
import { fromCanvasNodes } from '../src/features/canvas/lesson-io/lessonLint.js'
import { makeSnapshot, pushVersion } from '../src/features/canvas/review/lessonVersions.js'
import { proof } from './helpers/newbieEvidence.js'

// Доказательный прогон: G1 — «Разбор урока → Изменения»: новая нода розовая, изменённая янтарная (PLAN_NEW_USER.md → G1, CHECK_NEW_USER.md п. 11).
// Настоящий LessonReviewPanel на уроке из lesson-drafts/im.json открывается на стенде review-perf (dev-сервер BENCH_PORT, мёртвый Supabase) —
// он поднят в каждом прогоне playwright.config.js, поэтому админ-вход не нужен. Прошлая версия урока кладётся в localStorage страницы:
// у неё три ноды с «чужим» текстом (станут «изменёнными») и без ноды seq 30 (станет «новой»). Окно десктопное — это инструмент автора.
// Без fixtures.js: у стенда с мёртвым Supabase в консоли ожидаемы сетевые ошибки (так же устроен review-perf.spec.js).
const BENCH_URL = 'http://localhost:5398/e2e/review-perf/bench.html?lesson=im'
test.use({ viewport: { width: 1920, height: 1080 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 })

const bar = (page, sel) => page.locator(sel).first().evaluate((e, pseudo) => getComputedStyle(e, pseudo).backgroundColor, "::before")

test('[G1] «Изменения» в разборе — новая нода розовая, изменённая янтарная, счётчик «N новых · M изменённых»', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const json = JSON.parse(readFileSync(new URL('../lesson-drafts/im.json', import.meta.url), 'utf8'))
  const old = structuredClone(json)
  let n = 0
  for (const node of old.nodes) if (node.type === 'text' && n < 3 && node.seq > 20) node.data.content = `СТАРЫЙ ТЕКСТ ${n++}`
  old.nodes = old.nodes.filter(x => x.seq !== 30)
  const versions = pushVersion([], makeSnapshot(fromCanvasNodes(importLesson(old).nodes)), Date.now() - 86_400_000)
  await page.addInitScript(v => localStorage.setItem('pithy-versions:bench-review', JSON.stringify(v)), versions)
  await page.goto(BENCH_URL)
  await page.waitForSelector('.rvwFeedCol .rvwSlot', { timeout: 60_000 })

  await page.locator('label.rvwIconCheck', { hasText: 'Изменения' }).click()
  const counter = page.locator('.rvwIconCheck').first()
  await expect(counter).toContainText(/Изменения \(\d+ новых · \d+ изменённых\)/)
  const m = /\((\d+) новых · (\d+) изменённых\)/.exec(await counter.innerText())
  expect(Number(m[1]), 'новая нода есть').toBeGreaterThanOrEqual(1)
  expect(Number(m[2]), 'изменённые ноды есть').toBeGreaterThanOrEqual(3)

  await page.locator('label.rvwIconCheck', { hasText: 'Только изменённые' }).click() // в ленте подряд лишь отличающиеся сообщения
  const fresh = page.locator('.rvwSlot.rvwChg--new').first()
  const changed = page.locator('.rvwSlot.rvwChg--changed').first()
  await fresh.scrollIntoViewIfNeeded()
  const pink = await bar(page, '.rvwSlot.rvwChg--new')
  await changed.scrollIntoViewIfNeeded()
  const amber = await bar(page, '.rvwSlot.rvwChg--changed')
  expect(pink, 'новая — розовая #ff5fa2').toBe('rgb(255, 95, 162)')
  expect(amber, 'изменённая — янтарная #ffb347').toBe('rgb(255, 179, 71)')
  await expect(fresh.locator('.rvwTagChg')).toHaveText(/нов/i)
  await expect(changed.locator('.rvwTagChg')).toHaveText(/изменен/i)
  await changed.scrollIntoViewIfNeeded()
  await proof(testInfo, 'G1', `Счётчик «${(await counter.innerText()).trim()}»; полоска новой ${pink} (розовая), изменённой ${amber} (янтарная); подписи «${(await fresh.locator('.rvwTagChg').innerText()).trim()}» и «${(await changed.locator('.rvwTagChg').innerText()).trim()}»`, { page })
})
