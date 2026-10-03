import { test, expect } from './fixtures.js'

// Нижняя панель на Android в браузере (адресная строка уезжает при скролле): панель — position: fixed с одним bottom
// (Chrome держит такой край у нижней границы видимой области сам), на своём слое, жест на ней не листает окно;
// прокручиваемые контейнеры не передают жест окну (overscroll-behavior). Размер окна здесь меняем вручную — как
// это делает смена высоты при уходе адресной строки.
test('нижняя панель: fixed у низа окна, следует за изменением высоты, жесты не уходят в окно', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto('/?tab=learn')
  const nav = page.locator('.shellV2Nav')
  await expect(nav).toBeVisible({ timeout: 30_000 })

  const css = await nav.evaluate(el => { const cs = getComputedStyle(el); return { position: cs.position, willChange: cs.willChange, touchAction: cs.touchAction } })
  expect(css).toEqual({ position: 'fixed', willChange: 'transform', touchAction: 'none' })

  // Низ панели совпадает с низом окна — и после изменения высоты (адресная строка уехала / вернулась)
  for (const h of [800, 740, 860, 800]) {
    await page.setViewportSize({ width: 390, height: h })
    await expect.poll(() => nav.evaluate(el => Math.round(el.getBoundingClientRect().bottom)), { timeout: 5000 }).toBe(h)
  }

  // Затемнение снизу «Моей памяти» привязано к тому же краю окна, что и панель (fixed, свой слой): стоит ровно над
  // панелью и вместе с ней следует за изменением высоты — иначе при скролле «дёргается» относительно панели
  const edge = page.locator('.lrEdgeBottom')
  expect(await edge.evaluate(el => { const cs = getComputedStyle(el); return { position: cs.position, willChange: cs.willChange } }))
    .toEqual({ position: 'fixed', willChange: 'transform' })
  for (const h of [800, 740, 860]) {
    await page.setViewportSize({ width: 390, height: h })
    await expect.poll(async () => {
      const [e, n] = await Promise.all([edge.evaluate(el => el.getBoundingClientRect().bottom), nav.evaluate(el => el.getBoundingClientRect().top)])
      return Math.round(e - n)
    }, { timeout: 5000 }).toBe(0)
  }
  await page.setViewportSize({ width: 390, height: 800 })

  // Жест не «передаётся» окну: у прокручиваемых контейнеров и у самих html/body
  const over = await page.evaluate(() => {
    const ob = el => getComputedStyle(el).overscrollBehaviorY
    return { html: ob(document.documentElement), body: ob(document.body), screen: ob(document.querySelector('.lrScreen')) }
  })
  expect(over.html).toBe('none')
  expect(over.body).toBe('none')
  expect(over.screen).toBe('contain')

  // Вкладки по-прежнему переключаются тапом по панели (панель над контентом)
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
  await expect(page.locator('.shellV2NavBtnActive')).toHaveText('Профиль')
})

// «Моя память»: надпись и худ закреплены — подложка цвета фона закрывает их сверху, листаемое уходит под неё;
// касания проходят сквозь подложку (прокрутка не ломается)
test('«Моя память»: надпись стоит на месте при скролле, под ней — подложка цвета фона', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 })
  // Память есть (ступени и пятиугольник с содержимым) и знакомство пройдено — экран длиннее окна
  await page.addInitScript(() => {
    const due = new Date(Date.now() + 5 * 86_400_000).toLocaleDateString('sv')
    localStorage.setItem('pithy_guest_memory_v1', JSON.stringify({ keep: { word: 'keep', step: 3, due_on: due, last_card_id: null, reviews: 1, lapses: 0 } }))
    localStorage.setItem('pithy_memory_intro_v1', '1')
    localStorage.setItem('pithy_minutes_asked_v1', '1')
  })
  await page.goto('/?tab=learn')
  const title = page.locator('.lrTitle')
  await expect(title).toBeVisible({ timeout: 30_000 })
  const top = () => title.evaluate(el => Math.round(el.getBoundingClientRect().top))
  await expect(page.locator('.memPerm')).toBeVisible({ timeout: 30_000 }) // экран собран — есть что листать
  const before = await top()
  const screen = page.locator('.lrScreen')
  await screen.evaluate(el => { el.scrollTop = 260 })
  await expect.poll(() => screen.evaluate(el => el.scrollTop)).toBeGreaterThan(100) // действительно прокрутилось
  expect(await top()).toBe(before)
  const bar = await page.locator('.lrTop').evaluate(el => { const cs = getComputedStyle(el); return { events: cs.pointerEvents, bg: cs.backgroundImage.includes('rgb(11, 13, 16)'), z: cs.zIndex } })
  expect(bar).toEqual({ events: 'none', bg: true, z: '3' })
  // Худ (уровень · билеты · энергия) лежит над подложкой (z-index выше) — подложка не прячет его
  const z = await page.evaluate(() => ({ hud: Number(getComputedStyle(document.querySelector('.hudBarLeft')).zIndex), top: Number(getComputedStyle(document.querySelector('.lrTop')).zIndex) }))
  expect(z.hud).toBeGreaterThan(z.top)
})

// Активная супергонка — над кубком «Рейтинга» мерцает огонёк; без гонки его нет
test('нижняя панель: огонёк над кубком только при активной гонке', async ({ page }) => {
  const flame = page.locator('.shellV2Nav .shellV2NavFlame')
  await page.goto('/')
  await expect(page.locator('.shellV2Nav')).toBeVisible({ timeout: 30_000 })
  await expect(flame).toHaveCount(0)

  const day = 86_400_000
  const race = { id: '00000000-0000-4000-8000-0000000000e2', title: 'Тест', starts_at: new Date(Date.now() - 3_600_000).toISOString(), ends_at: new Date(Date.now() + day).toISOString() }
  await page.route(/\/rest\/v1\/races\?/, route => route.fulfill({ json: [race] }))
  await page.reload()
  await expect(flame).toHaveCount(1, { timeout: 30_000 })
  // Огонёк стоит над кубком и не ловит касания (тап проходит на кнопку «Рейтинг»)
  const box = await page.evaluate(() => {
    const f = document.querySelector('.shellV2NavFlame').getBoundingClientRect()
    const c = document.querySelector('.shellV2NavCup svg:last-child').getBoundingClientRect()
    return { flameBottom: f.bottom, cupTop: c.top, events: getComputedStyle(document.querySelector('.shellV2NavFlame')).pointerEvents }
  })
  expect(box.flameBottom).toBeLessThanOrEqual(box.cupTop + 4)
  expect(box.events).toBe('none')
})

test('гостю значок «Профиль» не мерцает — ежедневных наград у гостя нет', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.shellV2Nav')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(800) // профиль гостя не грузится — ждать нечего, но даём время на случайное появление
  await expect(page.locator('.shellV2NavSpark')).toHaveCount(0)
})
