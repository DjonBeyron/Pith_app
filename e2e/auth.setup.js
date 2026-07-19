import { test as setup, expect } from '@playwright/test'

// Логин один раз (этап D): заполняем форму входа, сохраняем storageState —
// остальные тесты стартуют уже залогиненными (см. playwright.config.js,
// проект mobile-auth с dependencies: ['setup']). Креды — из .env.test
// (грузится в config), в код/репозиторий не попадают.

// Гасим install-оверлей (перехватывает клики) — как в fixtures.js
const suppressInstall = () => { try { localStorage.setItem('pithy_install_dismissed', '1') } catch { /* приватный режим */ } }

async function login(page, email, password) {
  await page.addInitScript(suppressInstall)
  await page.goto('/')
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Пароль', { exact: true }).fill(password)
  await page.locator('.authBtnPrimary').click() // именно submit «Войти», не таб
  // Успех входа: профиль залогиненного (ProfileV2) — кнопка «Кастомизация»
  // есть только у него, у гостя тут форма входа
  await expect(page.getByRole('button', { name: /Кастомизация/ })).toBeVisible({ timeout: 30_000 })
}

setup('вход обычным пользователем', async ({ page }) => {
  const { E2E_EMAIL, E2E_PASSWORD } = process.env
  setup.skip(!E2E_EMAIL || !E2E_PASSWORD, 'нет E2E_EMAIL/E2E_PASSWORD в .env.test')
  await login(page, E2E_EMAIL, E2E_PASSWORD)
  await page.context().storageState({ path: 'test-results/.auth/user.json' })
})

setup('вход админом', async ({ page }) => {
  const { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } = process.env
  setup.skip(!E2E_ADMIN_EMAIL || !E2E_ADMIN_PASSWORD, 'нет E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD в .env.test')
  await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD)
  await page.context().storageState({ path: 'test-results/.auth/admin.json' })
})
