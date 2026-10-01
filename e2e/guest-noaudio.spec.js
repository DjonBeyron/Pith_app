import { test, expect } from './fixtures.js'
import { isLocalBackend } from './helpers/backend.js'

// «Не могу слушать» (features/review/NoAudioButton.jsx): кнопка — только на карточке
// со звуком, сначала широкая с подписью, потом кружок (навсегда); первое нажатие
// объясняет, что она делает, — один раз. Карточка со звуком подменяется в ответе
// сервера: в сиде у слова keep карточка без звука.
test.beforeEach(() => test.skip(!isLocalBackend(), 'слово keep есть только в сиде локального стека'))

test('«Не могу слушать»: широкая → кружок; попап один раз; задания со звуком уходят', async ({ page }) => {
  const today = new Date().toLocaleDateString('sv')
  await page.addInitScript(d => {
    if (sessionStorage.getItem('e2e_noaudio_seeded')) return
    sessionStorage.setItem('e2e_noaudio_seeded', '1')
    localStorage.setItem('pithy_guest_memory_v1', JSON.stringify({
      keep: { word: 'keep', step: 1, due_on: d, last_card_id: null, reviews: 0, lapses: 0 },
    }))
  }, today)
  await page.route('**/rest/v1/lessons?*', async route => {
    const res = await route.fetch()
    const json = await res.json()
    for (const l of json) {
      if (l.title !== 'keep') continue
      l.cards = [{ id: 'e2e-audio-card', nodes: [
        { id: 'na1', seq: 1, x: 0, y: 0, size: 'max', type: 'audio', typeData: { audio: { text: 'Hello', file_id: 'e2e0f000-0000-4000-8000-000000000001' } },
          triggers: [{ id: 'na1t', if: 'timer', ms: 800, then: 'na2' }] },
        { id: 'na2', seq: 2, x: 370, y: 0, size: 'max', type: 'word_choice',
          typeData: { word_choice: { options: [{ id: 'no1', text: 'keep', isCorrect: true }, { id: 'no2', text: 'kept' }], responseCorrect: '', responseWrong: '' } },
          triggers: [{ id: 'na2a', if: 'word_correct', then: null }, { id: 'na2b', if: 'word_wrong', then: null }] },
      ] }]
    }
    await route.fulfill({ response: res, json })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Память', exact: true }).click()
  await page.locator('.lrCta').click()
  const review = page.locator('.reviewScreen')

  const btn = review.getByRole('button', { name: 'Не могу слушать' })
  await expect(btn).toBeVisible({ timeout: 30_000 })
  await expect(btn).not.toHaveClass(/reviewNoAudio--compact/)
  await expect(btn).toHaveClass(/reviewNoAudio--compact/, { timeout: 10_000 }) // «сдулась» в кружок
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pithy_review_noaudio_compact_v1'))).toBe('1')

  await btn.click() // первый раз — объяснение
  const pop = review.getByRole('dialog', { name: 'Не могу слушать' })
  await expect(pop).toContainText('Ничего страшного')
  await pop.getByRole('button', { name: 'Убрать задания со звуком' }).click()
  await expect(review.locator('.reviewSummary')).toBeVisible({ timeout: 30_000 }) // карточек со звуком не осталось
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pithy_review_noaudio_info_v1'))).toBe('1')
})
