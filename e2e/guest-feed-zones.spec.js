import { test, expect } from './fixtures.js'
import { isLocalBackend } from './helpers/backend.js'

// Нижняя часть ленты рекомендаций — зона «без паузы»: тап рядом с фразой, в зазоре до кнопки «Изучить фразу», по бокам и под
// ней видео на паузу не ставит. Видео в тестовом модуле нет, поэтому проверяем не саму паузу, а КТО принимает тап: в этих местах
// это блок фразы (.feedPhraseBlock, у него запас сверху) или щит (.feedPauseGuard) — не слой видео (.slideVideoRoot).
// Модуль «Keep going · E2E-ОБУЧЕНИЕ» есть только в сиде локального стека
test.beforeEach(() => test.skip(!isLocalBackend(), 'модуль «Keep going · E2E-ОБУЧЕНИЕ» есть только в сиде локального стека'))

test('низ ленты: тапы рядом с фразой и под ней принимает блок фразы/щит, а не видео', async ({ page }) => {
  await page.goto('/?m=e2e0d000-0000-4000-8000-0000000000ff')
  const slide = page.locator('.feedSlideWrapActive')
  await expect(slide.locator('.feedPhrase')).toContainText('Keep going', { timeout: 30_000 })
  const btn = await slide.locator('.feedLearnBtn').boundingBox()
  const phrase = await slide.locator('.feedPhrase').boundingBox()
  const vh = page.viewportSize().height
  // Точки: выше фразы (запас блока), у левого края рядом с фразой, зазор над кнопкой, поле слева от кнопки, полоса под кнопкой
  const points = [
    ['выше фразы', 200, phrase.y - 26],
    ['рядом с фразой, слева', 4, phrase.y + 6],
    ['зазор над кнопкой', 200, btn.y - 9],
    ['поле слева от кнопки', 5, btn.y + btn.height / 2],
    ['под кнопкой', 200, btn.y + btn.height + 9],
  ]
  for (const [name, x, y] of points) {
    expect(y, name).toBeLessThan(vh)
    const zone = await page.evaluate(([px, py]) => {
      const el = document.elementFromPoint(px, py)
      return el?.closest('.feedPauseGuard, .feedPhraseBlock, .feedLearnBtn, .feedHud') ? 'guard' : (el?.closest('.slideVideoRoot') ? 'video' : 'other')
    }, [x, y])
    expect(zone, name).toBe('guard')
  }
  // Контроль: в середине экрана (не низ) тап по-прежнему получает видео-слой, а не щит
  const mid = await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('.feedPauseGuard, .feedPhraseBlock') ? 'guard' : 'free', [200, 250])
  expect(mid).toBe('free')
})
