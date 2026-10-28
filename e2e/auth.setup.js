import { test as setup } from '@playwright/test'
import { isLocalBackend } from './helpers/backend.js'
import { login } from './helpers/login.js' // шаги входа общие с проектом newbie-live

// Логин один раз (этап D): заполняем форму входа, сохраняем storageState —
// остальные тесты стартуют уже залогиненными (см. playwright.config.js,
// проект mobile-auth с dependencies: ['setup']). Креды — из .env.test
// (грузится в config), в код/репозиторий не попадают.

setup('вход обычным пользователем', async ({ page }) => {
  const { E2E_EMAIL, E2E_PASSWORD } = process.env
  setup.skip(!E2E_EMAIL || !E2E_PASSWORD, 'нет E2E_EMAIL/E2E_PASSWORD в .env.test')
  await login(page, E2E_EMAIL, E2E_PASSWORD)
  await page.context().storageState({ path: 'test-results/.auth/user.json' })
})

setup('вход админом', async ({ page }) => {
  const { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } = process.env
  setup.skip(!E2E_ADMIN_EMAIL || !E2E_ADMIN_PASSWORD, 'нет E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD в .env.test')
  // Админ входит только в локальную базу (scripts/e2e-local.sh): админ-сессия
  // нужна лишь проекту admin, а он бывает только на локальном стеке
  setup.skip(!isLocalBackend(), 'админ-вход только на локальном стеке Supabase')
  await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD)
  await page.context().storageState({ path: 'test-results/.auth/admin.json' })
})
