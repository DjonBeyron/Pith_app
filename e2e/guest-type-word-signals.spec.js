import { test, expect } from './fixtures.js'
import { isLocalBackend } from './helpers/backend.js'

// «Напечатай слово»: сигналы ошибок на букву слова. Урок-слово keep из сида локального стека
// (там один word_choice) подменяем на лету — ответ сервера на загрузку скрипта урока: в базе
// ничего не меняется, а плеер получает урок с нодой type_word и двумя сигналами. Только
// локальный стек: модуль «Keep going · E2E-ОБУЧЕНИЕ» есть лишь в его сиде.
const MODULE = 'e2e0d000-0000-4000-8000-0000000000ff'
const LESSON = 'e2e0d000-0000-4000-8000-00000000000b'

const text = (id, seq, content, then) => ({
  id, seq, x: seq * 600, y: 0, size: 'max', type: 'text',
  typeData: { text: { content, hardWrap: false } },
  triggers: then ? [{ id: `${id}-t`, if: 'timer', ms: 600, then }] : [],
})

const SCRIPT = {
  nodes: [
    text('tw-intro', 1, 'Печатай по-английски: пытается', 'tw-task'),
    {
      id: 'tw-task', seq: 2, x: 1200, y: 0, size: 'max', type: 'type_word',
      typeData: { type_word: {
        word: 'tries', extraLetters: 'yd', responseCorrect: '', responseWrong: 'Хм, не оно',
        signals: [{ slot: 2, ref: 'tw-sig-y' }, { slot: 4, ref: 'tw-sig-end' }],
      } },
      triggers: [
        { id: 'tw-task-ok', if: 'type_correct', then: 'tw-done' },
        { id: 'tw-task-bad', if: 'type_wrong', then: 'tw-done' },
      ],
    },
    text('tw-done', 3, 'Едем дальше'),
    text('tw-sig-y', 4, 'Тут подвох: y меняется на i'),
    text('tw-sig-end', 5, 'Конец не тот'),
  ],
}

test.beforeEach(() => test.skip(!isLocalBackend(), 'модуль «Keep going · E2E-ОБУЧЕНИЕ» есть только в сиде локального стека'))

test('сигнал на неверную букву: бесплатный, буква мигает, второй раз — обычная ошибка', async ({ page }) => {
  test.slow()
  // Только запрос скрипта урока (select=script,title): список уроков и колоды не трогаем
  await page.route(new RegExp(`/rest/v1/lessons\\?select=script%2Ctitle&id=eq\\.${LESSON}`), route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ script: SCRIPT, title: 'keep' }),
  }))

  await page.goto(`/?m=${MODULE}`)
  await page.locator('.feedSlideWrapActive').getByRole('button', { name: 'Изучить фразу' }).click({ timeout: 30_000 })
  await page.locator('.mgNode--lesson', { hasText: 'keep' }).click()
  await page.getByRole('button', { name: /Открыть все уроки сразу/ }).click()
  await page.getByRole('button', { name: 'Открыть уроки' }).click()
  await page.locator('.mgNode--lesson', { hasText: 'keep' }).click()
  await page.getByRole('button', { name: /Начать урок/ }).click({ timeout: 30_000 })

  const key = ch => page.locator(`.twKey[data-key="${ch}"]`)
  const typeWord = async s => { for (const ch of s) await key(ch).click() }
  const check = page.getByRole('button', { name: 'Проверить' })
  const blink = page.getByTestId('tw-blink')

  await expect(page.locator('.twKeyboard')).toBeVisible({ timeout: 30_000 })

  // 1. «Tryes» — первая неверная буква «y» (слот 2): сигнал вместо обычной ошибки
  await typeWord('tryes')
  await expect(page.getByTestId('tw-typed')).toHaveText('Tryes')
  await check.click()
  await expect(page.getByText('Тут подвох: y меняется на i')).toBeVisible({ timeout: 15_000 })
  await expect(blink).toHaveText('y')
  // Пока сигнал играет — клавиши молчат; доиграл — снова нажимаются
  await expect(key('t')).toBeEnabled({ timeout: 20_000 })
  // Попытка не потрачена: ни подсказки учителя, ни красного ответа ученика в чате
  await expect(page.getByText('Хм, не оно')).toHaveCount(0)
  await expect(page.getByTestId('tw-typed')).toHaveText('Tryes') // собранное не стёрто

  // 2. Та же ошибка ещё раз: нода-сигнал срабатывает один раз за урок — теперь обычная первая
  // ошибка (подсказка responseWrong, а не «Слово из 5 букв» — значит, сигнал попытку не тратил)
  await check.click()
  await expect(page.getByText('Хм, не оно')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Слово из 5 букв')).toHaveCount(0)

  // 3. Стёрли помеченную букву (а с ней и всё после неё) — мигание гаснет
  const erase = page.getByRole('button', { name: 'Стереть' })
  await erase.click() // s
  await erase.click() // e
  await expect(blink).toHaveCount(1)
  await erase.click() // y — помеченная
  await expect(blink).toHaveCount(0)

  // 4. Допечатали верно → панель уходит, слово — в чат, сценарий идёт дальше
  await typeWord('ies')
  await expect(page.getByTestId('tw-typed')).toHaveText('Tries')
  await expect(check).toBeEnabled()
  await check.click()
  await expect(page.getByText('Едем дальше')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.twKeyboard')).toHaveCount(0)
})
