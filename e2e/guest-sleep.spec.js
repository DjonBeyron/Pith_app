import { test, expect } from './fixtures.js'
import { isLocalBackend } from './helpers/backend.js'

// «Памяти пора отдыхать» (всё повторено): заголовок в одну строку на любой ширине, спящий мозг с «Z» в углу блока и
// в нижней панели, искры пятиугольника в это время молчат (две анимации никогда не идут вместе). Плюс счётчик
// временной памяти (три точки только при словах > 0) и вкладка «Мои начатые фразы». Модуль «Keep going ·
// E2E-ОБУЧЕНИЕ» есть только в сиде локального стека; память гостя — в localStorage своего контекста.
const LESSONS = ['a', 'b', 'c', 'd'].map(x => `e2e0d000-0000-4000-8000-00000000000${x}`) // Старт, keep, going, Финал
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv') }

test.beforeEach(() => test.skip(!isLocalBackend(), 'модуль «Keep going · E2E-ОБУЧЕНИЕ» есть только в сиде локального стека'))

// Гость: keep в памяти со сроком due (будущее — всё повторено, сегодня — зовёт повторить), знакомства уже пройдены
const seed = (page, { due, completed = [] }) => page.addInitScript(([d, done]) => {
  if (sessionStorage.getItem('e2e_sleep_seeded')) return
  sessionStorage.setItem('e2e_sleep_seeded', '1')
  if (d) localStorage.setItem('pithy_guest_memory_v1', JSON.stringify({ keep: { word: 'keep', step: 3, due_on: d, last_card_id: null, reviews: 1, lapses: 0 } }))
  if (done.length) localStorage.setItem('pithy_completed_v1', JSON.stringify(done))
  localStorage.setItem('pithy_minutes_asked_v1', '1')
  localStorage.setItem('pithy_memory_intro_v1', '1')
}, [due, completed])

test('всё повторено: «Памяти пора отдыхать» в одну строку, спящий мозг с Z, искры молчат', async ({ page }) => {
  await seed(page, { due: day(5) })
  await page.goto('/?tab=learn')
  const main = page.locator('.lrMain')
  await expect(main).toContainText('Памяти пора отдыхать', { timeout: 30_000 })
  await expect(main).toContainText('Сегодня все слова записаны в твою память')
  // Спящий мозг: значок, три «Z»; в нижней панели — три мелких «Z» у мозга
  await expect(main.locator('.lrSleep svg')).toBeVisible()
  await expect(main.locator('.lrZ')).toHaveCount(3)
  const nav = page.getByRole('button', { name: 'Память', exact: true })
  await expect(nav).toHaveClass(/shellV2NavBtn--sleep/)
  await expect(nav.locator('.shellV2NavZzz i')).toHaveCount(3)
  await expect(nav).not.toHaveClass(/shellV2NavBtnDue/)
  // Искры над пятиугольником не летят, пока мозг спит
  await expect(page.locator('.memSparkBox')).toHaveCount(0)
  // Заголовок — заглавными и всегда в одну строку, не вылезая из блока, на любой ширине
  const title = main.locator('.lrMainTitle')
  expect(await title.evaluate(el => getComputedStyle(el).textTransform)).toBe('uppercase')
  for (const width of [320, 360, 390, 430, 600, 1000]) {
    await page.setViewportSize({ width, height: 800 })
    const fit = await title.evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth, h: el.getBoundingClientRect().height, fs: parseFloat(getComputedStyle(el).fontSize) }))
    expect(fit.scroll, `ширина ${width}: заголовок влезает`).toBeLessThanOrEqual(fit.client + 1)
    expect(fit.h, `ширина ${width}: одна строка`).toBeLessThan(fit.fs * 1.25 * 1.6)
  }
})

// Пауза анимации на доле периода → боксы «Z» (в конце — они выше всего). Только compositor-свойства: transform и opacity
const frozen = (zs, at) => zs.evaluateAll((els, k) => els.map(el => {
  const a = el.getAnimations()[0]
  a.pause(); a.currentTime = a.effect.getTiming().duration * k
  const b = el.getBoundingClientRect()
  return { top: b.top, left: b.left, right: b.right }
}), at)
const animInfo = zs => zs.evaluateAll(els => els.map(el => {
  const a = el.getAnimations()[0]
  const skip = ['offset', 'computedOffset', 'easing', 'composite']
  return { dur: a.effect.getTiming().duration, props: [...new Set(a.effect.getKeyframes().flatMap(kf => Object.keys(kf)))].filter(k => !skip.includes(k)).sort() }
}))

test('«Z»: выплывают из-за мозга, выходят выше границы, редко и только на transform/opacity', async ({ page }) => {
  await seed(page, { due: day(5) })
  await page.goto('/?tab=learn')
  const main = page.locator('.lrMain')
  await expect(main.locator('.lrZ')).toHaveCount(3, { timeout: 30_000 })
  const nav = page.getByRole('button', { name: 'Память', exact: true })

  // Мозг в блоке: крупнее, по центру по вертикали, линия тонкая
  const brain = main.locator('.lrSleep')
  const bb = await brain.boundingBox()
  const mb = await main.boundingBox()
  expect(bb.width).toBeGreaterThanOrEqual(46)
  expect(Math.abs((bb.y + bb.height / 2) - (mb.y + mb.height / 2)), 'мозг по центру блока по вертикали').toBeLessThanOrEqual(1.5)
  expect(Number(await brain.locator('svg').getAttribute('stroke-width'))).toBeLessThan(2)

  // Z лежат под значком (слой ниже) и спрятаны маской по силуэту мозга: сквозь контур не просвечивают, узор фона виден
  for (const [zs, icon] of [[main.locator('.lrZ'), main.locator('.lrSleep svg')], [nav.locator('.shellV2NavZzz i'), nav.locator('.shellV2NavBrain svg')]]) {
    const zIdx = await zs.first().evaluate(el => Number(getComputedStyle(el).zIndex) || Number(getComputedStyle(el.parentElement).zIndex) || 0)
    const iconIdx = await icon.evaluate(el => Number(getComputedStyle(el).zIndex))
    expect(zIdx, 'Z ниже значка мозга').toBeLessThan(iconIdx)
    const mask = await zs.first().evaluate(el => { const cs = getComputedStyle(el.parentElement); return cs.maskImage !== 'none' ? cs.maskImage : cs.webkitMaskImage })
    expect(mask, 'маска по силуэту мозга').toContain('data:image/svg+xml')
    // Путь ровный, без остановок на середине: за равные доли периода «Z» проходит равные расстояния (linear)
    const tops = await zs.first().evaluate(el => {
      const a = el.getAnimations()[0]
      a.pause()
      return [0.3, 0.4, 0.5, 0.6, 0.7].map(k => { a.currentTime = a.effect.getTiming().duration * k; return el.getBoundingClientRect().top })
    })
    const steps = tops.slice(1).map((v, i) => tops[i] - v) // вверх — вычитание
    const mean = steps.reduce((x, y) => x + y, 0) / steps.length
    expect(mean, 'Z поднимается').toBeGreaterThan(1)
    for (const d of steps) expect(Math.abs(d - mean) / mean, 'шаги пути почти равны').toBeLessThan(0.35)
    // оптимизация: только transform и opacity; период не короче 9 с — Z идут редко
    for (const a of await animInfo(zs)) {
      expect(a.props).toEqual(['opacity', 'transform'])
      expect(a.dur).toBeGreaterThanOrEqual(9000)
    }
  }

  // Z выходят за верхнюю границу блока и нижней панели
  const hostTop = { block: mb.y, bar: (await page.locator('.shellV2Nav').boundingBox()).y }
  const topOf = async zs => Math.min(...(await frozen(zs, 0.99)).map(b => b.top))
  expect(await topOf(main.locator('.lrZ'))).toBeLessThan(hostTop.block - 1)
  expect(await topOf(nav.locator('.shellV2NavZzz i'))).toBeLessThan(hostTop.bar - 1)
})

test('пятиугольник: подпись того же размера, что названия уровней; кольца третьего уровня не режутся', async ({ page }) => {
  await seed(page, { due: day(5) })
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto('/?tab=learn')
  const perm = page.locator('.memPerm')
  await expect(perm).toBeVisible({ timeout: 30_000 })
  const box = await perm.boundingBox()
  expect(box.width / box.height, 'пропорции без искажений').toBeCloseTo(243 / 214.65, 1)
  const size = sel => page.locator(sel).first().evaluate(el => getComputedStyle(el).fontSize)
  expect(await size('.memPermText span'), 'подпись — как заголовки уровней').toBe(await size('.memLvlName'))
  // Кольца (.memRing) выходят за блок ступени — ни один предок до экрана «Моя память» их не обрезает, и они в пределах окна
  const rings = await page.locator('.memRing').evaluateAll(els => els.map(el => {
    const clipped = []
    for (let n = el.parentElement; n && !n.classList.contains('lrScreen'); n = n.parentElement) {
      if (getComputedStyle(n).overflowX !== 'visible') clipped.push(n.className)
    }
    return { clipped, right: el.getBoundingClientRect().right }
  }))
  expect(rings.length).toBeGreaterThan(0)
  for (const r of rings) {
    expect(r.clipped, 'предки колец ничего не обрезают').toEqual([])
    expect(r.right).toBeLessThanOrEqual(390)
  }
  const screen = await page.locator('.lrScreen').evaluate(el => [el.scrollWidth, el.clientWidth])
  expect(screen[0]).toBeLessThanOrEqual(screen[1])
})

test('нет фраз: у «Моей памяти» запас пустоты снизу — при полном скролле пятиугольник не жмётся к панели', async ({ page }) => {
  await seed(page, { due: day(5) })
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto('/?tab=learn')
  const screen = page.locator('.lrScreen')
  await expect(screen).toHaveClass(/lrScreen--bare/, { timeout: 30_000 })
  const gap = async () => {
    await screen.evaluate(el => { el.scrollTop = el.scrollHeight })
    await page.waitForTimeout(200)
    return page.evaluate(() => document.querySelector('.shellV2Nav').getBoundingClientRect().top - document.querySelector('.memPerm').getBoundingClientRect().bottom)
  }
  expect(await gap(), 'пятиугольник заметно выше панели (над затемнением 68 px)').toBeGreaterThan(110)
})

test('есть начатая фраза: запаса нет — раздел фраз сам занимает место', async ({ page }) => {
  await seed(page, { due: day(5), completed: [LESSONS[0], LESSONS[1]] })
  await page.goto('/?tab=learn')
  await expect(page.locator('.memPhrases')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.lrScreen')).not.toHaveClass(/lrScreen--bare/)
})

test('есть что повторить: мозг не спит, искры летят', async ({ page }) => {
  await seed(page, { due: day(0) })
  await page.goto('/?tab=learn')
  await expect(page.locator('.lrMain')).toContainText('Сегодня повторяем', { timeout: 30_000 })
  await expect(page.locator('.lrSleep')).toHaveCount(0)
  await expect(page.locator('.shellV2NavZzz')).toHaveCount(0)
  await expect(page.locator('.memSparkBox')).toHaveCount(1)
  await expect(page.locator('.memSpark')).toHaveCount(6)
})

test('счётчик временной памяти: три точки — только если слов больше нуля', async ({ page }) => {
  await seed(page, { due: null })
  await page.goto('/?tab=learn')
  await expect(page.locator('.lrMain')).toContainText('Память пока пуста', { timeout: 30_000 })
  await expect(page.locator('.memCount')).toBeVisible()
  await expect(page.locator('.memOrbit')).toHaveCount(0)
  await expect(page.locator('.memOrbitLines')).toHaveCount(0)
})

test('счётчик временной памяти: со словами летят три точки', async ({ page }) => {
  await seed(page, { due: day(5) })
  await page.goto('/?tab=learn')
  await expect(page.locator('.memCount')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.memOrbit')).toHaveCount(3)
})

test('«Мои начатые фразы»: вкладка рядом с выученными, процент, продолжить', async ({ page }) => {
  await seed(page, { due: null, completed: [LESSONS[0], LESSONS[1]] }) // 2 из 4 уроков модуля — 50%
  await page.goto('/?tab=learn')
  const section = page.locator('.memPhrases')
  // Выученных нет, начатая есть — раздел открывается на ней
  await expect(section.locator('.memPhrasesTab')).toHaveText(['Мои выученные фразы · 0', 'Мои начатые фразы · 1'], { timeout: 30_000 })
  await expect(section.locator('.memPhrasesTab--on')).toHaveText('Мои начатые фразы · 1')
  const row = section.locator('.memStartedRow')
  await expect(row).toContainText('Keep going')
  await expect(row.locator('.memStartedPct')).toHaveText('50%')
  await expect(row.locator('.memStartedIdx'), 'порядковый номер — мелкий, в углу, как номер урока в схеме модуля').toHaveText('1')
  expect(await row.locator('.memStartedIdx').evaluate(el => getComputedStyle(el).fontSize)).toBe('9px')
  await expect(row).toContainText('Пройдено 2 из 4 уроков · осталось 2')
  // Вкладка выученных — пусто, заботливо
  await section.getByRole('tab', { name: /выученные/ }).click()
  await expect(section.locator('.memPhrasesEmpty')).toContainText('Пока нет выученных фраз')
  // Тап по начатой — схема модуля
  await section.getByRole('tab', { name: /начатые/ }).click()
  await section.locator('.memStartedRow').click()
  await expect(page.locator('.mgNode--lesson').first()).toBeVisible({ timeout: 30_000 }) // схема модуля открылась
})
