import { test, expect } from './fixtures.js'
import { isLocalBackend } from './helpers/backend.js'

// «Не могу слушать» (features/review/NoAudioButton.jsx): кнопка — только на карточке
// со звуком, сначала широкая с подписью, потом кружок (навсегда); первое нажатие
// объясняет, что она делает, — один раз. Карточка со звуком подменяется в ответе
// сервера: в сиде у слова keep карточка без звука.
test.beforeEach(() => test.skip(!isLocalBackend(), 'слово keep есть только в сиде локального стека'))

// Карточка со звуком вместо карточки колоды слова keep (ответ сервера подменяется)
async function seedAudioCard(page, flags = {}) {
  const today = new Date().toLocaleDateString('sv')
  await page.addInitScript(([d, f]) => {
    if (sessionStorage.getItem('e2e_noaudio_seeded')) return
    sessionStorage.setItem('e2e_noaudio_seeded', '1')
    localStorage.setItem('pithy_guest_memory_v1', JSON.stringify({
      keep: { word: 'keep', step: 1, due_on: d, last_card_id: null, reviews: 0, lapses: 0 },
    }))
    for (const [k, v] of Object.entries(f)) localStorage.setItem(k, v)
  }, [today, flags])
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
  return page.locator('.reviewScreen')
}

test('«Не могу слушать»: широкая → кружок; попап один раз; задания со звуком уходят', async ({ page }) => {
  const review = await seedAudioCard(page)

  const btn = review.getByRole('button', { name: 'Не могу слушать' })
  await expect(btn).toBeVisible({ timeout: 30_000 })
  await expect(btn).not.toHaveClass(/reviewNoAudio--compact/)
  // Вдвое мельче прежнего (было 172×36) и справа в панели действий
  const vw = page.viewportSize().width
  const wide = await btn.boundingBox()
  expect(wide.width).toBeLessThanOrEqual(122)
  expect(wide.height).toBeLessThanOrEqual(24)
  expect(wide.x).toBeGreaterThan(vw / 2)
  await expect(btn).toHaveClass(/reviewNoAudio--compact/, { timeout: 10_000 }) // «сдулась» в кружок
  await expect.poll(async () => Math.round((await btn.boundingBox()).width)).toBeLessThanOrEqual(19) // кружок 18 px, а не 36
  expect((await btn.boundingBox()).x).toBeGreaterThan(vw / 2)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pithy_review_noaudio_compact_v1'))).toBe('1')

  await btn.click() // первый раз — объяснение
  const pop = review.getByRole('dialog', { name: 'Не могу слушать' })
  await expect(pop).toContainText('Ничего страшного')
  await pop.getByRole('button', { name: 'Убрать задания со звуком' }).click()
  await expect(review.locator('.reviewSummary')).toBeVisible({ timeout: 30_000 }) // карточек со звуком не осталось
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pithy_review_noaudio_info_v1'))).toBe('1')
})

// Кнопка не исчезает: ответили — появилась подсказка «смахни…», а она остаётся на месте, тусклая и недоступная
test('«Не могу слушать»: после ответа тускнеет и блокируется, но не пропадает', async ({ page }) => {
  const review = await seedAudioCard(page, { pithy_review_noaudio_compact_v1: '1', pithy_review_noaudio_info_v1: '1' })
  const btn = review.getByRole('button', { name: 'Не могу слушать' })
  await expect(btn).toBeVisible({ timeout: 30_000 })
  await expect(btn).toBeEnabled()
  const before = await btn.boundingBox()
  await review.locator('.chooseWordPanel').getByRole('button', { name: 'keep', exact: true }).click({ timeout: 30_000 })
  await expect(review.locator('.reviewVerdict')).toBeVisible() // ответили: появилось «Далее» / «смахни…» (что именно — зависит от мыши или касания)
  await expect(btn).toBeVisible()
  await expect(btn).toBeDisabled()
  await expect.poll(() => btn.evaluate(el => Number(getComputedStyle(el).opacity))).toBeLessThan(0.5)
  expect(await btn.boundingBox()).toEqual(before) // на том же месте
})
