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
