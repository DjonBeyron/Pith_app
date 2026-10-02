import { test, expect } from './fixtures.js'
import { isLocalBackend } from './helpers/backend.js'

// Раздел «Мои выученные фразы · N» вкладки «Память» гостя: коллекция под пятиугольником с
// номерами, «Вся коллекция», карточка фразы; фраза с пропавшим уроком остаётся и объясняется
// заботливо. Модуль «Keep going · E2E-ОБУЧЕНИЕ» есть только в сиде локального стека.
const MODULE = 'e2e0d000-0000-4000-8000-0000000000ff'
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv') }

test.beforeEach(() => test.skip(!isLocalBackend(), 'модуль «Keep going · E2E-ОБУЧЕНИЕ» есть только в сиде локального стека'))

test('закреплённые фразы: список, «Все фразы», карточка, пропавший урок', async ({ page }) => {
  const iso = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString() }
  await page.addInitScript(([d, m, at]) => {
    localStorage.setItem('pithy_guest_memory_v1', JSON.stringify({
      keep: { word: 'keep', step: 4, due_on: d, last_card_id: null, reviews: 1, lapses: 0 },
      going: { word: 'going', step: 3, due_on: d, last_card_id: null, reviews: 1, lapses: 0 },
    }))
    localStorage.setItem('pithy_guest_phrases_v1', JSON.stringify([
      { module_id: m, consolidated_at: at[0], phrase_title: 'Keep going', phrase_words: ['keep', 'going'] },
      { module_id: 'gone-a', consolidated_at: at[1], phrase_title: 'Gone phrase', phrase_words: ['keep'] },
      { module_id: 'gone-b', consolidated_at: at[2], phrase_title: 'Another gone', phrase_words: [] },
      'gone-old-format',
    ]))
    localStorage.setItem('pithy_minutes_asked_v1', '1')
    localStorage.setItem('pithy_memory_intro_v1', '1')
  }, [day(5), MODULE, [iso(-1), iso(-3), iso(-5)]])
  await page.goto('/?tab=learn')

  const section = page.locator('.memPhrases')
  await expect(section.locator('.memPhrasesTab--on')).toHaveText('Мои выученные фразы 4', { timeout: 30_000 })
  await expect(section.locator('.memPhrasesTab')).toHaveText(['Мои выученные фразы 4', 'Мои начатые фразы 0'])
  await expect(section.locator('.memPhraseRow')).toHaveCount(3) // три последние; остальные — в «Все фразы»
  await expect(section.locator('.memPhraseRow').first()).toContainText('Keep going')
  // Номер в коллекции — по порядку выучивания: самая свежая — 4, дальше 3, 2 (запись без даты — №1)
  await expect(section.locator('.memPhraseNum')).toHaveText(['4', '3', '2'])
  await expect(section.locator('.memPhraseRow').first()).toContainText('2 слова')
  await expect(section.locator('.memPhraseRow').nth(1)).toContainText('урок сейчас недоступен')

  // «Вся коллекция» — окно со всем списком, включая запись без снимка
  await section.getByRole('button', { name: /Вся коллекция · 4/ }).click()
  const all = page.getByRole('dialog', { name: 'Мои выученные фразы' })
  await expect(all.locator('.memPhraseRow')).toHaveCount(4)
  await expect(all.locator('.memPhraseRow').nth(3)).toContainText('Фраза')

  // Фраза с пропавшим уроком: слова из снимка и забота вместо кнопки
  await all.locator('.memPhraseRow').nth(1).click()
  const lost = page.getByRole('dialog', { name: 'Фраза Gone phrase' })
  await expect(lost).toContainText('Фраза № 3 · выучена')
  await expect(lost.locator('.memChip')).toHaveText(['keep'])
  await expect(lost.locator('.memPhraseLost')).toContainText('Не переживай')
  await expect(lost.locator('.memPhraseLost')).toContainText('остаётся в твоей коллекции выученных')
  await expect(lost.getByRole('button', { name: 'Открыть фразу' })).toHaveCount(0)
  await lost.getByRole('button', { name: 'Закрыть' }).click()

  // Живая фраза: слова с силой и «Открыть фразу»
  await section.locator('.memPhraseRow').first().click()
  const live = page.getByRole('dialog', { name: 'Фраза Keep going' })
  await expect(live.locator('.memChip')).toHaveText(['keep', 'going'])
  await expect(live.locator('.memPhraseLost')).toHaveCount(0)
  await expect(live.getByRole('button', { name: 'Открыть фразу' })).toBeVisible()
  // Тап по слову фразы — окно слова
  await live.locator('.memChip', { hasText: 'keep' }).click()
  await expect(page.getByRole('dialog', { name: 'Слово keep' })).toBeVisible()
})

// Слово постоянной памяти (settled_on) в карточке фразы — фиолетовое и залито целиком, как в
// пятиугольнике; слово «обычной» ступени — цвета своей ступени
test('карточка фразы: слово постоянной памяти фиолетовое', async ({ page }) => {
  await page.addInitScript(([d, m, at]) => {
    localStorage.setItem('pithy_guest_memory_v1', JSON.stringify({
      keep: { word: 'keep', step: 4, due_on: d, last_card_id: null, reviews: 1, lapses: 0 },
      going: { word: 'going', step: 5, due_on: d, settled_on: at.slice(0, 10), last_card_id: null, reviews: 6, lapses: 0 },
    }))
    localStorage.setItem('pithy_guest_phrases_v1', JSON.stringify([
      { module_id: m, consolidated_at: at, phrase_title: 'Keep going', phrase_words: ['keep', 'going'] },
    ]))
    localStorage.setItem('pithy_minutes_asked_v1', '1')
    localStorage.setItem('pithy_memory_intro_v1', '1')
  }, [day(40), MODULE, new Date(Date.now() - 86_400_000).toISOString()])
  await page.goto('/?tab=learn')
  await page.locator('.memPhraseRow').first().click({ timeout: 30_000 })
  const card = page.getByRole('dialog', { name: 'Фраза Keep going' })
  const going = card.locator('.memChip', { hasText: 'going' })
  const keep = card.locator('.memChip', { hasText: 'keep' })
  await expect(going).toHaveClass(/memChip--Perm/)
  await expect(going.locator('.memChipFill')).toHaveAttribute('style', /width: 100%/)
  await expect(keep).not.toHaveClass(/memChip--Perm/)
})

test('фраз нет — раздела нет', async ({ page }) => {
  await page.addInitScript(d => {
    localStorage.setItem('pithy_guest_memory_v1', JSON.stringify({ keep: { word: 'keep', step: 4, due_on: d, last_card_id: null, reviews: 1, lapses: 0 } }))
    localStorage.setItem('pithy_minutes_asked_v1', '1')
    localStorage.setItem('pithy_memory_intro_v1', '1')
  }, day(5))
  await page.goto('/?tab=learn')
  await expect(page.locator('.memLvl--2 .memChip')).toHaveText(['keep'], { timeout: 30_000 })
  await expect(page.locator('.memPhrases')).toHaveCount(0)
})
