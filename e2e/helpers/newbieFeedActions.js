import { expect } from '../fixtures.js'
import { sheet } from './newbiePersona.js'

// Жесты ленты, общие для доказательных сценариев (e2e/newbie-coverage-*.spec.js) и массового прогона (newbie-crowd.spec.js):
// включить звук чипом, открыть фразу из-под шариков, потереть её (перевод), тапнуть видео (пауза), дождаться шторки Пита.
export const active = page => page.locator('.feedSlideWrapActive')

// Звук ленты: тап по чипу «Включить звук» на активном слайде (если звук уже включён — чипа нет, ничего не делаем)
export async function soundOn(page) {
  const chip = active(page).locator('.feedSoundChip')
  if (await chip.count()) await chip.click({ timeout: 3000 })
}

// Открыть фразу: тап по шарикам, подождать, пока они разлетятся. timeout — сколько ждать шарики (у человека, как и у массового прогона, фраза может быть уже открыта: тогда это «промах», а не бесконечное ожидание)
export async function openPhrase(page, timeout = 5000) {
  await active(page).locator('.phraseBubbleWrap').click({ timeout })
  await page.waitForTimeout(900)
}

// Потереть фразу мышью: n штрихов по dx px вдоль её середины — перевод открывается трением
export async function rubPhrase(page, { strokes = 3, dx = 44 } = {}) {
  const box = await active(page).locator('.feedPhrase').first().boundingBox({ timeout: 3000 })
  const y = box.y + box.height / 2
  let x = box.x + 14
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 0; i < strokes; i++) {
    const to = i % 2 === 0 ? x + dx : x - dx
    for (let s = 1; s <= 6; s++) await page.mouse.move(x + ((to - x) * s) / 6, y)
    x = to
  }
  await page.mouse.up()
}

// Тап по видео в верхней части кадра (пауза / пуск); не по худу и не по фразе
export async function tapVideo(page) {
  const { width, height } = page.viewportSize()
  await page.mouse.click(Math.round(width * 0.45), Math.round(height * 0.22))
}

// Дождаться шторки Пита с текстом (бюджет открывается через 20 с после входа, поэтому таймаут большой); вернуть её локатор
export async function waitSheet(page, text, timeout = 45_000) {
  const s = sheet(page).filter({ hasText: text })
  await expect(s, `шторка Пита «${text}» так и не пришла`).toHaveCount(1, { timeout })
  return s
}
