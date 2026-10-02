import { test, expect } from './fixtures.js'
import { isLocalBackend } from './helpers/backend.js'

// Шапка уровня на странице уровней памяти (MemoryLevelHead): при первом посещении описание развёрнуто; свёрнули — выбор
// запоминается и действует сразу во всех четырёх вкладках уровней и после перезагрузки (общий флаг в localStorage).
test.beforeEach(() => test.skip(!isLocalBackend(), 'слово keep есть только в сиде локального стека'))

const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv') }

test('описание уровня: по умолчанию развёрнуто, свёртка общая для четырёх вкладок и запоминается', async ({ page }) => {
  await page.addInitScript(d => {
    if (sessionStorage.getItem('e2e_levelhead')) return
    sessionStorage.setItem('e2e_levelhead', '1')
    localStorage.setItem('pithy_guest_memory_v1', JSON.stringify({ keep: { word: 'keep', step: 3, due_on: d, last_card_id: null, reviews: 1, lapses: 0 } }))
    localStorage.setItem('pithy_minutes_asked_v1', '1'); localStorage.setItem('pithy_memory_intro_v1', '1')
  }, day(5))
  await page.goto('/?tab=learn')
  await page.locator('.memLvl--1 .memLvlOpen').click({ timeout: 30_000 })
  const wrap = page.locator('.memHeadWrap')
  const toggle = page.locator('.memHeadToggle')
  const tabs = ['Новые', 'Знакомые', 'Усвоенные', 'Постоянная']
  const open = name => page.getByRole('tab', { name: new RegExp(name) }).click()

  // Первое посещение — описание открыто
  await expect(wrap).not.toHaveClass(/memHeadWrap--shut/)
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('.memHead p')).toBeVisible()

  // Свернули в одной вкладке — свёрнуто во всех четырёх
  await toggle.click()
  for (const name of tabs) {
    await open(name)
    await expect(wrap, `вкладка «${name}»`).toHaveClass(/memHeadWrap--shut/)
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  }

  // Выбор запомнен: после перезагрузки уровень открывается свёрнутым
  await page.reload()
  await page.getByRole('button', { name: 'Память', exact: true }).click()
  await page.locator('.memLvl--2 .memLvlOpen').click({ timeout: 30_000 })
  await expect(wrap).toHaveClass(/memHeadWrap--shut/)

  // Развернули — развёрнуто везде
  await toggle.click()
  for (const name of tabs) {
    await open(name)
    await expect(wrap, `вкладка «${name}»`).not.toHaveClass(/memHeadWrap--shut/)
  }
})
