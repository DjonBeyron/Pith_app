import { test, expect } from './fixtures.js'

// Установка как приложения (PWA): Chromium сам проверяет манифест/иконки/воркер (Page.getInstallabilityErrors — в тестовом
// окне остаётся только «in-incognito»), воркер активен и имеет fetch-обработчик, а перехват beforeinstallprompt
// (кнопка «Установить» в нашей инструкции) отключается адресом ?nativeinstall=1 — диагностика «Установить» из меню Chrome.
async function installability(page) {
  const cdp = await page.context().newCDPSession(page)
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors')
  return installabilityErrors.map(e => e.errorId)
}

// Событие, как у Chrome: отменяемое; dispatchEvent вернёт false, если страница вызвала preventDefault
const fireInstallEvent = page => page.evaluate(() => !window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true })))

test('PWA: устанавливаемо, воркер активен и с fetch-обработчиком', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => navigator.serviceWorker?.ready.then(() => true), null, { timeout: 30_000 })
  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration('/push-sw.js')
    return { scope: reg?.scope, active: !!reg?.active, text: await (await fetch('/push-sw.js', { cache: 'no-store' })).text() }
  })
  expect(sw.active).toBe(true)
  expect(sw.text).toContain("addEventListener('fetch'")
  const errors = await installability(page)
  expect(errors.filter(id => id !== 'in-incognito'), 'Chromium не нашёл причин не устанавливать').toEqual([])
  const manifest = await page.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json())
  expect(manifest.id).toBe('/')
  expect(manifest.icons.some(i => i.purpose === 'maskable' && i.src === '/icons/icon-512-maskable.png')).toBe(true)
})

test('beforeinstallprompt: по умолчанию перехватывается, с ?nativeinstall=1 — нет', async ({ page }) => {
  await page.goto('/')
  expect(await fireInstallEvent(page), 'обычный запуск: preventDefault вызван (своя кнопка «Установить»)').toBe(true)
  await page.goto('/?nativeinstall=1')
  expect(await fireInstallEvent(page), 'nativeinstall: событие не отменяем — Chrome ведёт установку сам').toBe(false)
})
