import { expect } from '@playwright/test'

// Вход по почте и паролю через настоящую форму приложения — общий для e2e/auth.setup.js (локальный стек)
// и e2e/helpers/liveAccounts.js (тестовые аккаунты на настоящей базе, проект newbie-live).

// Гасим install-оверлей (перехватывает клики) — как в fixtures.js
export const suppressInstall = () => { try { localStorage.setItem('pithy_install_dismissed', '1') } catch { /* приватный режим */ } }

// Заполнить открытую форму входа и нажать «Войти». Ответ сервера на /auth/v1/token проверяем сразу: отказ (неверный пароль,
// капча) иначе выглядел бы как «форма не закрылась» через 30 с ожидания. Капча Turnstile: dev-сервер стенда без
// VITE_TURNSTILE_SITE_KEY токен не шлёт — если в Supabase капча включена, сервер ответит отказом, и это видно в тексте ошибки
export async function submitLoginForm(page, email, password) {
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Пароль', { exact: true }).fill(password)
  const answer = page.waitForResponse(r => /\/auth\/v1\/token/.test(r.url()), { timeout: 30_000 }).catch(() => null)
  await page.locator('.authBtnPrimary').click() // именно submit «Войти», не таб
  const res = await answer
  if (res && !res.ok()) {
    const body = (await res.text().catch(() => '')).slice(0, 300)
    const captcha = /captcha/i.test(body) ? ' В Supabase включена капча, а стенд входит без токена: см. TESTING.md → «E2E против настоящей базы».' : ''
    throw new Error(`Вход не удался: HTTP ${res.status()} ${body}.${captcha}`)
  }
}

// Открыть приложение, перейти в «Профиль», войти. Успех: профиль залогиненного (ProfileV2) — кнопка «Кастомизация»
// есть только у него, у гостя тут форма входа
export async function login(page, email, password) {
  await page.addInitScript(suppressInstall)
  await page.goto('/')
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
  await submitLoginForm(page, email, password)
  await expect(page.getByRole('button', { name: /Кастомизация/ })).toBeVisible({ timeout: 30_000 })
}
