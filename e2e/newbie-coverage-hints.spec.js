import { test, expect } from './fixtures.js'
import { bootPersona, openFeed, sheet, makeRng, seedFor, think, fingerSwipe, eventsOf, expectNoHScroll } from './helpers/newbiePersona.js'
import { soundOn, openPhrase, rubPhrase, tapVideo, waitSheet, active } from './helpers/newbieFeedActions.js'
import { proof, shot, textOf } from './helpers/newbieEvidence.js'

// Доказательный прогон: B2 — подсказки ленты по поведению и значок сложности (PLAN_NEW_USER.md → B2, CHECK_NEW_USER.md п. 1–2).
// Все подсказки идут через бюджет Пита (не раньше 20 с после входа), поэтому каждый сценарий честно ждёт; часы не подменяем.
// У слайда без звука раньше всех подходит «Послушаем?» — в сценариях про фразы и замедление звук включаем сразу, чтобы проверять нужную подсказку.
// Seed 2201+.
test.describe.configure({ mode: 'parallel' })
test.use({ viewport: { width: 375, height: 812 } }) // самый узкий телефон из плана (iPhone 12 mini): скриншоты отчёта снимаются в этом размере
test.beforeEach(({ page }) => bootPersona(page))

const diffClass = page => active(page).locator('.diffWrap').first().getAttribute('class')
const hintsSeen = page => page.evaluate(() => JSON.parse(localStorage.getItem('pithy_feed_hints_v2') ?? '[]'))

test('[B2.sound] «Послушаем?» через ~8–20 с без звука → включает звук', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  await openFeed(page)
  const t0 = Date.now()
  await expect(active(page).locator('.feedSoundChip')).toBeVisible()
  const s = await waitSheet(page, 'Эти фразы лучше слышать')
  const seen = await textOf(s)
  expect(Date.now() - t0, 'бюджет Пита: не раньше 20 с после входа').toBeGreaterThanOrEqual(15_000)
  await expect(s.locator('.promptSheetBtn')).toHaveText(['Послушаем?', 'Без звука'])
  await expectNoHScroll(page, 'на «Послушаем?»')
  await shot(page, testInfo, 'B2.sound', 'послушаем')
  await s.getByRole('button', { name: 'Послушаем?' }).click()
  await expect(sheet(page)).toHaveCount(0, { timeout: 8000 })
  await expect(active(page).locator('.feedSoundChip')).toHaveCount(0) // звук включился — чип «Включить звук» ушёл
  expect(await page.evaluate(() => localStorage.getItem('pithy_sound_v1'))).toBe('1')
  expect(await hintsSeen(page)).toContain('sound')
  await proof(testInfo, 'B2.sound', `${seen} → тап «Послушаем?» → звук включён, чип ушёл`, { page })
})

test('[B2.sound] «Без звука» → «Если сейчас неудобно — можно и без звука, текст под видео» на 3 с', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  await openFeed(page)
  const s = await waitSheet(page, 'Эти фразы лучше слышать')
  await s.getByRole('button', { name: 'Без звука' }).click()
  await expect(sheet(page)).toContainText('Если сейчас неудобно — можно и без звука, текст под видео')
  await expect(sheet(page).locator('.promptSheetBtn')).toHaveCount(0)
  const seen = await textOf(sheet(page))
  await shot(page, testInfo, 'B2.sound', 'без-звука-реплика-Пита')
  await expect(sheet(page)).toHaveCount(0, { timeout: 8000 })
  expect(await page.evaluate(() => localStorage.getItem('pithy_sound_v1'))).not.toBe('1')
  await proof(testInfo, 'B2.sound', `Ответ «Без звука» → реплика Пита: ${seen}; шторка ушла сама, звук остался выключенным`, { page })
})

test('[B2.badge] значок сложности скрыт до первого прослушивания со звуком и плавно проявляется после (≈3 с)', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  const rnd = makeRng(seedFor(2203))
  await openFeed(page)
  expect(await diffClass(page)).toContain('diffHidden')
  await shot(page, testInfo, 'B2.badge', 'значок-скрыт')
  await think(page, rnd, 3000, 4500)
  await fingerSwipe(page, 'next', { ms: 300 })
  await think(page, rnd, 1500, 2500)
  expect(await diffClass(page), 'без звука значок так и скрыт').toContain('diffHidden')
  await soundOn(page)
  await page.waitForTimeout(1000)
  expect(await diffClass(page), 'через 1 с со звуком значок ещё скрыт (нужны 3 с)').toContain('diffHidden')
  await expect.poll(() => diffClass(page), { timeout: 8000 }).toContain('diffReveal')
  await page.waitForTimeout(800) // transition opacity 0.6s
  const op = await active(page).locator('.diffWrap').first().evaluate(el => getComputedStyle(el).opacity)
  expect(Number(op)).toBeGreaterThan(0.9)
  await shot(page, testInfo, 'B2.badge', 'значок-проявился')
  await page.reload()
  await expect(active(page)).toBeVisible({ timeout: 30_000 })
  expect(await diffClass(page), 'после перезагрузки значок виден сразу: прослушивание засчитано навсегда').toContain('diffReveal')
  await proof(testInfo, 'B2.badge', 'Значок сложности (три полоски): скрыт без звука → через ~3 с со звуком проявился (opacity ≈ 1) → после перезагрузки виден сразу', { page })
})

test('[B2.slow] два тапа-паузы на одной фразе → «Не успеваешь? Зажми над сердечком — видео замедлится»', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  const rnd = makeRng(seedFor(2204))
  await openFeed(page)
  await soundOn(page)
  await think(page, rnd, 1500, 2500)
  for (let i = 0; i < 4; i++) { await tapVideo(page); await think(page, rnd, 500, 900) } // пауза, пуск, пауза, пуск — две паузы
  const pauses = (await eventsOf(page, 'feed_pause')).filter(e => e.props?.on)
  expect(pauses.length, 'две паузы на одной фразе записаны в журнал').toBeGreaterThanOrEqual(2)
  const s = await waitSheet(page, 'Не успеваешь?')
  const seen = await textOf(s)
  await expect(s).toContainText('Зажми над сердечком')
  await expect(s.getByRole('button', { name: 'Понятно' })).toBeVisible()
  await shot(page, testInfo, 'B2.slow', 'подсказка')
  await s.getByRole('button', { name: 'Понятно' }).click()
  await expect(sheet(page)).toHaveCount(0, { timeout: 8000 })
  expect(await hintsSeen(page)).toContain('slow')
  await proof(testInfo, 'B2.slow', seen, { page })
})

test('[B2.rub] открыл фразу и не трёт перевод 7 с → «Потри фразу пальцем — появится перевод»; потёр — перевод открылся', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  const rnd = makeRng(seedFor(2205))
  await openFeed(page)
  await soundOn(page)
  await think(page, rnd, 1000, 2000)
  await openPhrase(page)
  const s = await waitSheet(page, 'Потри фразу пальцем')
  const seen = await textOf(s)
  await shot(page, testInfo, 'B2.rub', 'подсказка')
  await s.getByRole('button', { name: 'Понятно' }).click()
  await expect(sheet(page)).toHaveCount(0, { timeout: 8000 })
  await rubPhrase(page)
  await expect(active(page).locator('.feedPhraseSubOpen')).toHaveCount(1)
  const tr = await textOf(active(page).locator('.feedTrValueOn'))
  expect(tr).toContain('Фраза новичка')
  await proof(testInfo, 'B2.rub', `${seen} → потёр пальцем: «${tr}»`, { page })
})

test('[B2.word] перевод фразы на двух слайдах подряд без тапа по слову → «Тапни слово — увидишь его перевод»', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const rnd = makeRng(seedFor(2206))
  await openFeed(page)
  await soundOn(page)
  for (let slide = 0; slide < 2; slide++) {
    await think(page, rnd, 800, 1500)
    await openPhrase(page)
    await rubPhrase(page)
    await expect(active(page).locator('.feedPhraseSubOpen')).toHaveCount(1)
    await think(page, rnd, 800, 1500)
    await fingerSwipe(page, 'next', { ms: rnd.int(260, 400) })
    await think(page, rnd, 2300, 3000)
  }
  const s = await waitSheet(page, 'Тапни слово')
  const seen = await textOf(s)
  await shot(page, testInfo, 'B2.word', 'подсказка')
  await s.getByRole('button', { name: 'Понятно' }).click()
  await expect(sheet(page)).toHaveCount(0, { timeout: 8000 })
  expect(await hintsSeen(page)).toContain('word')
  await proof(testInfo, 'B2.word', seen, { page })
})

test('[B2.limit] не больше одной подсказки ленты за сессию', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const rnd = makeRng(seedFor(2207))
  await openFeed(page)
  await soundOn(page)
  for (let i = 0; i < 4; i++) { await tapVideo(page); await think(page, rnd, 500, 800) }
  const s = await waitSheet(page, 'Не успеваешь?')
  await s.getByRole('button', { name: 'Понятно' }).click()
  // теперь условия «рубрики» выполнены тоже — открыли фразу и не трём; второй подсказки быть не должно
  await openPhrase(page)
  await think(page, rnd, 9000, 10_000)
  await expect(sheet(page).filter({ hasText: 'Потри фразу' })).toHaveCount(0)
  expect((await hintsSeen(page)).sort()).toEqual(['slow'])
  await proof(testInfo, 'B2.limit', 'После подсказки «Зажми над сердечком» фраза открыта и не тронута 10 с — второй подсказки («Потри фразу») нет, в списке показанных только slow', { page })
})
