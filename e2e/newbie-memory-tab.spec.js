import { test, expect } from './fixtures.js'
import { prepareNewbie, learnTab, memoryTabToRemind } from './helpers/newbieSteps.js'

// Новый пользователь, вторая половина пути (PLAN_NEW_USER.md → B1, C1, C2) — коротким путём, без игры ленты:
// вкладка «Память» скрыта → первое слово (то, что делают seedMemoryWord и sendWordToMemory: слово в памяти гостя + события) → вкладка появилась и мерцает →
// тап → рассказ Пита → «Когда удобно учиться?» → 20:00 → «Готово». Полный путь от первого слайда — newbie-first-session.spec.js;
// этот спек держит вкладку/рассказ/напоминание зелёными, даже если игра ленты в ленте не выпала по бюджету Пита.
test.beforeEach(({ page }) => prepareNewbie(page))

test('новичок: «Память» скрыта, с первым словом появляется, рассказ Пита → «Когда удобно учиться?»', async ({ page }) => {
  await test.step('первый слайд; вкладки «Память» нет, остальные на месте', async () => {
    await page.goto('/')
    await expect(page.locator('.feedSlideWrapActive')).toBeVisible({ timeout: 30_000 })
    await expect(learnTab(page)).toHaveCount(0)
    for (const name of ['Уроки', 'Профиль', 'Рейтинг']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
  })

  await test.step('первое слово: вкладка появляется', async () => {
    await page.evaluate(() => {
      const d = new Date(Date.now() + 86_400_000).toLocaleDateString('sv') // «повторить завтра», как у только что посеянного слова
      localStorage.setItem('pithy_guest_memory_v1', JSON.stringify({ keep: { word: 'keep', step: 1, due_on: d, last_card_id: null, reviews: 0, lapses: 0 } }))
      localStorage.setItem('pithy_memory_fresh_v1', '1')
      window.dispatchEvent(new Event('pithy:memory-changed')) // seedMemoryWord → notifyMemoryChanged
      window.dispatchEvent(new Event('pithy:memory-fresh'))   // sendWordToMemory
    })
    await expect(learnTab(page)).toBeVisible()
  })

  await test.step('тап → рассказ Пита → «Когда удобно учиться?» → 20:00 → «Готово»', () => memoryTabToRemind(page))

  await test.step('выход: шторки закрыты, вкладка «Память» остаётся обычной (без мерцания)', async () => {
    await expect(page.locator('.lrSheetBack')).toHaveCount(0)
    await expect(learnTab(page)).toBeVisible()
    await expect(learnTab(page)).not.toHaveClass(/shellV2NavBtn--blink/)
  })
})
