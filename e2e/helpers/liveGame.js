import { expect } from '../fixtures.js'
import { think, quickSwipes, scrollUntilSheet, sheet } from './newbiePersona.js'

// Путь «лента → вопрос Пита → игра «Выбери слово» → «Сохранить слово»» на НАСТОЯЩЕЙ ленте (проект newbie-live): колоды, слова и верные
// ответы — боевые, заглушек нет. Верный вариант задания заранее неизвестен, поэтому смотрим ответы базы: каждое задание word_choice
// (урок → карточка → нода) приходит с пометкой isCorrect у вариантов; запоминаем «набор вариантов → верный» и по нему отвечаем.
// Всё, что зависит от боевого наполнения (игра могла не выпасть, колод может не быть), возвращает причину строкой, а не падает:
// спек кладёт её в attach «manual» и идёт дальше.

const key = texts => texts.map(t => String(t).trim()).sort().join('|')

// Слушатель ответов базы: собирает верные варианты заданий word_choice из любых ответов /rest/v1/lessons
export function watchCorrectAnswers(page) {
  const map = new Map()
  const pending = []
  const walk = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 12) return
    if (Array.isArray(node)) { node.forEach(n => walk(n, depth + 1)); return }
    const opts = node.type === 'word_choice' ? node.typeData?.word_choice?.options : null
    if (Array.isArray(opts)) {
      const ok = opts.find(o => o?.isCorrect && o.text)
      if (ok && opts.length > 1) map.set(key(opts.map(o => o.text ?? '')), String(ok.text).trim())
    }
    for (const v of Object.values(node)) walk(v, depth + 1)
  }
  page.on('response', r => {
    if (r.request().method() !== 'GET' || !/\/rest\/v1\/lessons/.test(r.url())) return
    pending.push(r.json().then(j => walk(j)).catch(() => {})) // тело могло уйти вместе со страницей — не страшно
  })
  return {
    size: () => map.size,
    async correct(texts) { await Promise.allSettled(pending); return map.get(key(texts)) ?? null },
  }
}

// Закрыть шторку Пита крестиком, если она открыта (чужие подсказки ленты)
export async function closeSheet(page) {
  const s = sheet(page)
  if (await s.count()) await s.getByRole('button', { name: 'Закрыть' }).first().click().catch(() => {})
}

// Звук → честные 20 с бюджета Пита (MIN_MS_AFTER_OPEN) → быстрые пролисты → вопрос «Кажется, не зацепило…» → ответ «Слишком быстро».
// → true, если вопрос был и получил ответ (после него через ~20 с уйдёт set_level_profile); false — Пит не спросил (группа, бюджет)
export async function answerPaceQuestion(page, rnd) {
  const chip = page.locator('.feedSlideWrapActive .feedSoundChip')
  if (await chip.count()) await chip.click() // со звуком: подсказка «Послушаем?» не займёт слот Пита
  await think(page, rnd, 18_500, 20_500)
  for (let round = 0; round < 3; round++) {
    await quickSwipes(page, rnd)
    const q = sheet(page).filter({ hasText: 'Кажется, не зацепило' })
    try {
      await expect(q).toBeVisible({ timeout: 15_000 })
    } catch {
      await closeSheet(page) // выпала другая подсказка — убираем и пробуем ещё
      continue
    }
    await q.getByRole('button', { name: 'Слишком быстро, не успеваю' }).click()
    await expect(sheet(page)).toHaveCount(0, { timeout: 10_000 }) // реплика Пита 3 с, потом шторка уходит
    return true
  }
  return false
}

// Листаем спокойно, пока Пит не предложит игру; «Давай» → отвечаем верно по запомненным ответам → «Дальше» → плашка «Сохрани слово» → «Сохранить».
// → { status: 'saved', word } | { status: 'причина' } (игра не выпала / колод нет / верный вариант неизвестен / плашки нет)
export async function playOfferedGame(page, rnd, answers) {
  if (!(await scrollUntilSheet(page, rnd, 'Пит нашёл игру на минутку', { max: 20 }))) return { status: 'Пит не предложил игру за 20 слайдов (бюджет шторок или нет колод в боевых модулях)' }
  await sheet(page).getByRole('button', { name: 'Давай' }).click()
  const game = page.getByRole('group', { name: 'Выбери слово' })
  await expect(game).toBeVisible()
  const options = game.locator('.chooseWordBtn')
  await expect(options.first()).toBeVisible({ timeout: 30_000 })
  const texts = await options.allInnerTexts()
  const right = await answers.correct(texts)
  if (!right) {
    await game.getByRole('button', { name: 'Закрыть' }).click()
    return { status: `верный вариант не определён по ответам базы (варианты: ${texts.join(' / ')}; заданий в памяти теста: ${answers.size()})` }
  }
  await options.filter({ hasText: new RegExp(`^\\s*${right.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) }).first().click()
  await expect(game.locator('.chooseVerdict')).toHaveText('Верно!')
  await game.getByRole('button', { name: 'Дальше' }).click()
  await expect(game).toHaveCount(0)

  const seed = page.getByRole('group', { name: 'Чтобы не забыть слово, сохрани его' })
  try {
    await expect(seed).toBeVisible({ timeout: 15_000 })
  } catch {
    return { status: 'плашка «Сохранить слово» не появилась (слово уже в памяти или лимит предложений за день)' }
  }
  const word = (await seed.locator('.seedOfferWord').innerText()).trim().toLowerCase()
  await seed.getByRole('button', { name: 'Сохранить' }).click()
  await expect(seed).toHaveCount(0)
  return { status: 'saved', word }
}
