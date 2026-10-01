import { test, expect } from './fixtures.js'
import { isLocalBackend } from './helpers/backend.js'

// Карточка слова (справка): тап по слову в карточке выученной фразы открывает справку
// урока-слова (блоки из lessons.script.wordCard); нет справки — обычное окно слова.
// Справку подставляем ответом на запрос (сид её не содержит). Модуль «Keep going ·
// E2E-ОБУЧЕНИЕ» есть только в сиде локального стека
const MODULE = 'e2e0d000-0000-4000-8000-0000000000ff'
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv') }

test.beforeEach(() => test.skip(!isLocalBackend(), 'модуль «Keep going · E2E-ОБУЧЕНИЕ» есть только в сиде локального стека'))

const CARD = {
  tag: 'глагол · форма -ing',
  nodes: [
    { id: 'b1', type: 'text', text: 'Слово **keep** значит «продолжать».' },
    { id: 'b2', type: 'formula', parts: ['keep', 'ing'], result: 'keeping' },
    {
      id: 'b3', type: 'dialog',
      lines: Array.from({ length: 12 }, (_, i) => (
        i === 3
          ? { side: 'r', text: 'I don’t **keep** going', tr: 'Я не продолжаю', neg: true }
          : { side: i % 2 ? 'r' : 'l', text: `Line ${i + 1} **keep** going`, tr: `Строка ${i + 1}`, neg: false }
      )),
    },
  ],
}

async function seed(page, card) {
  const iso = new Date(Date.now() - 86_400_000).toISOString()
  await page.addInitScript(([d, m, at]) => {
    localStorage.setItem('pithy_guest_memory_v1', JSON.stringify({
      keep: { word: 'keep', step: 4, due_on: d, last_card_id: null, reviews: 1, lapses: 0 },
      going: { word: 'going', step: 3, due_on: d, last_card_id: null, reviews: 1, lapses: 0 },
    }))
    localStorage.setItem('pithy_guest_phrases_v1', JSON.stringify([
      { module_id: m, consolidated_at: at, phrase_title: 'Keep going', phrase_words: ['keep', 'going'] },
    ]))
    localStorage.setItem('pithy_minutes_asked_v1', '1')
    localStorage.setItem('pithy_memory_intro_v1', '1')
  }, [day(5), MODULE, iso])
  // Справка слова: запрос script->wordCard урока — отдаём свою (или «нет справки»),
  // с задержкой: так видно, что пока она грузится, на экране не появляется пустая карточка
  await page.route(/\/rest\/v1\/lessons\?.*wordCard/, async route => {
    await new Promise(r => setTimeout(r, 600))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ wc: card }) })
  })
  await page.goto('/?tab=learn')
  await page.locator('.memPhraseRow').first().click({ timeout: 30_000 })
  await page.getByRole('dialog', { name: 'Фраза Keep going' }).locator('.memChip', { hasText: 'keep' }).click()
}

test('тап по слову во фразе → карточка слова: шапка, блоки, один скролл на всю середину, запас снизу', async ({ page }) => {
  await seed(page, CARD)
  const card = page.getByRole('dialog', { name: 'Карточка слова keep' })
  await expect(card).toBeVisible({ timeout: 15_000 })
  await expect(card.locator('.wcTag')).toHaveText('глагол · форма -ing')
  await expect(card.locator('.wcWord')).toHaveText('keep')
  await expect(card.locator('.wcCtx mark')).toHaveText(/^keep$/i)
  await expect(card.locator('.wcBub b').first()).toHaveText('keep')
  await expect(card.locator('.wcChip')).toHaveText(['keep', 'ing', 'keeping'])
  await expect(card.locator('.wcDlgLabel')).toHaveText('Пример диалога')
  await expect(card.locator('.wcWho').first()).toHaveText('Пит')
  await expect(card.locator('.wcWho').nth(1)).toHaveText('Анна')
  await expect(card.locator('.wcNeg').first()).toHaveText('don’t')
  await expect(card.locator('.wcMem')).toContainText('Знакомые')
  await expect(card.getByRole('button', { name: 'Пройти урок слова' })).toBeVisible()

  // Карточка помещается в экран; прокрутка ОДНА — вся середина (блоки и диалог вместе),
  // а у самого диалога своего скролла нет
  const box = await card.boundingBox()
  const vh = page.viewportSize().height
  expect(box.y + box.height).toBeLessThanOrEqual(vh + 1)
  const mid = card.locator('.wcMid')
  const { sh, ch } = await mid.evaluate(el => ({ sh: el.scrollHeight, ch: el.clientHeight }))
  expect(sh).toBeGreaterThan(ch)
  expect(await card.locator('.wcDlgScroll').evaluate(el => getComputedStyle(el).overflowY)).toBe('visible')
  // Шапка и подвал на месте при прокрутке; в конце последнее сообщение не липнет к подвалу
  const headTop = (await card.locator('.wcHead').boundingBox()).y
  await mid.evaluate(el => { el.scrollTop = el.scrollHeight })
  expect(await mid.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  expect((await card.locator('.wcHead').boundingBox()).y).toBe(headTop)
  const lastBottom = (await card.locator('.wcDlgScroll .wcBub').last().boundingBox()).y
    + (await card.locator('.wcDlgScroll .wcBub').last().boundingBox()).height
  const footTop = (await card.locator('.wcFoot').boundingBox()).y
  expect(footTop - lastBottom).toBeGreaterThanOrEqual(20) // запас внизу

  await card.getByRole('button', { name: 'Закрыть' }).last().click()
  await expect(card).toHaveCount(0)
})

// Не мелькает: у слова без справки сразу окно слова, карточка слова в DOM не появлялась
test('у слова нет справки → обычное окно слова, карточка не мелькает', async ({ page }) => {
  await page.addInitScript(() => {
    window.__wcSeen = false
    new MutationObserver(() => { if (document.querySelector('.wcCard')) window.__wcSeen = true })
      .observe(document, { childList: true, subtree: true })
  })
  await seed(page, null)
  // Пока справка грузится, карточка фразы остаётся на экране
  await expect(page.getByRole('dialog', { name: 'Фраза Keep going' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Слово keep' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('dialog', { name: 'Карточка слова keep' })).toHaveCount(0)
  expect(await page.evaluate(() => window.__wcSeen)).toBe(false)
})
