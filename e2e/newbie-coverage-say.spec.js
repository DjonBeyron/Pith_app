import { test, expect } from './fixtures.js'
import { learnTab } from './helpers/newbieSteps.js'
import { bootPersona, openFeed, seedOnce, expectNoHScroll } from './helpers/newbiePersona.js'
import { wordTables, guestMemoryOf, WORDS } from './helpers/newbieWords.js'
import { proof, shot, manual, textOf } from './helpers/newbieEvidence.js'
import { NEED_TITLE } from '../src/shared/lib/vosk/voskReadyView.js'

// Доказательный прогон: E — мини-игра «Скажи вслух» (PLAN_NEW_USER.md → этап E, решения 17 и 20, CHECK_NEW_USER.md п. 8).
// Запуск: кнопка под главным действием вкладки «Память», видна при ≥3 словах с переводом. Модель Vosk в прогоне не скачана
// (тихая загрузка выключена админским стопом, внешней сети нет) — игра обязана показать уведомление «Нужно скачать…», а не подставлять
// системное распознавание и не просить микрофон. Сам раунд с голосом автоматически не проверить — запись «только руками» (manual).
test.describe.configure({ mode: 'parallel' })
test.use({ viewport: { width: 375, height: 812 } }) // самый узкий телефон из плана (iPhone 12 mini): скриншоты отчёта снимаются в этом размере

async function withWords(page, words = WORDS) {
  await seedOnce(page, { pithy_guest_memory_v1: guestMemoryOf(words), pithy_remind_asked_v1: '1' })
  // Счётчик запросов микрофона: до «Начать» на готовой модели приложение его просить не должно
  await page.addInitScript(() => {
    window.__mic = 0
    const md = navigator.mediaDevices
    if (md?.getUserMedia) { const orig = md.getUserMedia.bind(md); md.getUserMedia = (...a) => { window.__mic++; return orig(...a) } }
  })
  await bootPersona(page, { keepIntro: true, stub: { session: null, tables: wordTables(words) } }) // keepIntro: рассказ Пита здесь не нужен
  await openFeed(page)
  await learnTab(page).click()
  await expect(page.locator('.lrMain')).toBeVisible()
}

test('[E.launch] кнопка «Скажи вслух» на вкладке «Память» видна при трёх словах с переводом и не вытесняет главное действие', async ({ page }, testInfo) => {
  await withWords(page)
  const btn = page.getByTestId('say-aloud-launch')
  await expect(btn).toBeVisible()
  await expect(btn).toContainText('Скажи вслух')
  await expect(page.locator('.lrMain').getByRole('button', { name: 'Повторить' })).toBeVisible() // главное действие на месте
  await expectNoHScroll(page, 'на вкладке «Память»')
  await shot(page, testInfo, 'E.launch', 'кнопка-Скажи-вслух')
  await proof(testInfo, 'E.launch', `Вкладка «Память»: ${await textOf(page.locator('.lrMain'))} + кнопка «${await textOf(btn)}» (слов с переводом: ${WORDS.length})`, { page })
})

test('[E.launch] при двух словах кнопки нет (меньше трёх с переводом)', async ({ page }, testInfo) => {
  await withWords(page, WORDS.slice(0, 2))
  await expect(page.getByTestId('say-aloud-launch')).toHaveCount(0)
  await proof(testInfo, 'E.launch', 'Два слова в памяти — кнопки «Скажи вслух» нет, остальная вкладка на месте', { page })
})

test('[E.vosk] модель Vosk не скачана → «Нужно скачать распознавание речи (≈39 МБ)» с кнопкой; микрофон не просят, системного распознавания нет', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  await withWords(page)
  await page.getByTestId('say-aloud-launch').click()
  await expect(page.getByTestId('say-aloud')).toBeVisible()
  const notice = page.getByTestId('vosk-notice')
  await expect(notice).toBeVisible({ timeout: 40_000 }) // прогрев ждёт до 25 с, потом «модели нет»
  await expect(notice).toContainText(NEED_TITLE)
  await expect(page.getByTestId('vosk-download')).toBeVisible()
  await expect(page.getByTestId('say-begin')).toHaveCount(0) // «Начать» без модели нет
  expect(await page.evaluate(() => window.__mic), 'микрофон до «Начать» не просят').toBe(0)
  await expectNoHScroll(page, 'на уведомлении Vosk')
  await shot(page, testInfo, 'E.vosk', 'нужно-скачать')
  const seen = await textOf(notice)
  await page.getByTestId('say-close').click()
  await expect(page.getByTestId('say-aloud')).toHaveCount(0)
  await proof(testInfo, 'E.vosk', `${seen}. Микрофон не запрашивался, «Начать» не показано, крестик закрыл слой`, { page })
})

// eslint-disable-next-line no-empty-pattern -- Playwright требует деструктуризацию первого аргумента; браузер этому тесту не нужен
test('[E.round] раунд с голосом (Vosk, микрофон) — только руками', async ({}, testInfo) => {
  await manual(testInfo, 'E.round', 'Раунд требует реальной модели Vosk (≈39 МБ с GitHub Pages — внешняя сеть в прогоне недопустима) и микрофона с живым голосом; в headless Chromium их нет. Ход раунда (sayAloudFlow, sayAloudRound, sayAloudOnlyVosk) покрыт юнит-тестами; проверять на телефоне по CHECK_NEW_USER.md п. 8 (акцент, короткие слова, заглушение)')
})
