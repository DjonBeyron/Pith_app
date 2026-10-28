import { test, expect } from '@playwright/test'
import { login } from './login.js'

// Тестовые аккаунты владельца для проекта newbie-live (e2e/newbie-live-*.spec.js): сценарии нового пользователя против НАСТОЯЩЕЙ
// базы Supabase. Секреты (GitHub Actions или .env.test): E2E_USER_EMAILS — адреса через запятую, E2E_USER_PASSWORD — пароли через
// запятую В ТОМ ЖЕ ПОРЯДКУ либо один общий пароль без запятых. Пароль с запятой не поддерживается (запятая — разделитель).
// Назначение: №1 — «новичок, вошёл до начала», №2 — «гость → лайк → вход», №3 — «второй день / повторный визит».

const split = v => String(v ?? '').split(',').map(s => s.trim()).filter(Boolean)

// Разбор секретов → [{ email, password }]. Число паролей: ровно один (общий) или столько же, сколько адресов; иначе — ошибка
export function parseAccounts(emails = process.env.E2E_USER_EMAILS, passwords = process.env.E2E_USER_PASSWORD) {
  const mails = split(emails)
  const pass = split(passwords)
  if (!mails.length) return []
  if (pass.length !== 1 && pass.length !== mails.length) {
    throw new Error(`E2E_USER_PASSWORD: ${pass.length} паролей на ${mails.length} адресов — нужен один общий или по одному на адрес, в том же порядке`)
  }
  return mails.map((email, i) => ({ email, password: pass.length === 1 ? pass[0] : pass[i] }))
}

// Что нужно живому прогону: аккаунты и ключи настоящей базы (те же VITE_*, что у гостевого job). Строка — причина пропуска
export function liveSkipReason(n) {
  if (!process.env.E2E_USER_EMAILS || !process.env.E2E_USER_PASSWORD) return 'нет секретов E2E_USER_EMAILS / E2E_USER_PASSWORD — живые сценарии идут только на GitHub Actions (newbie-live.yml)'
  if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) return 'нет VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY'
  const accs = parseAccounts()
  if (accs.length < n) return `нужен тестовый аккаунт №${n}, а в E2E_USER_EMAILS их ${accs.length}`
  return null
}

// Аккаунт №n (1..3)
export const liveAccount = n => parseAccounts()[n - 1]

// Номер прогона в anon_id: GitHub run id, локально — время запуска. Один на все спеки процесса
export const RUN_ID = process.env.GITHUB_RUN_ID || String(Date.now())

// Устройство тестового аккаунта: до загрузки приложения кладём в localStorage свой anon_id 'e2e-live-<n>-<run>' (по префиксу e2e-
// их исключают из отчётов аналитики: миграция 20261028100000_analytics_exclude_e2e.sql), пинуем группу Пита 'prompts'
// (иначе 10% запусков попали бы в контрольную без вопросов), гасим подсказку «замедлить» и тихую загрузку Vosk (39 МБ с внешнего хоста).
// Флаги ставятся на каждую загрузку, как у фикстуры; всё остальное — настоящее, без заглушек сети
export async function prepareLiveDevice(page, n) {
  await page.addInitScript(({ anon }) => {
    try {
      localStorage.setItem('pithy_anon_id', anon)
      localStorage.setItem('pithy_slowmo_hint_seen_v1', '1')
      localStorage.setItem('pithy_vosk_bg_stop_v1', '1')
      if (!localStorage.getItem('pithy_prompt_group_v1')) {
        localStorage.setItem('pithy_prompt_group_v1', JSON.stringify({ group: 'prompts', share: 10, id: anon }))
      }
    } catch { /* приватный режим */ }
  }, { anon: `e2e-live-${n}-${RUN_ID}` })
}

// Войти аккаунтом через «Профиль» (шаги — helpers/login.js)
export const loginLive = (page, acc) => login(page, acc.email, acc.password)

// Оставить в localStorage только сессию Supabase и id устройства: после сброса аккаунта приложение начинает «с чистого листа»
// (флаги знакомств и счётчики Пита — как у только что пришедшего), а вход сохраняется. Затем страница перезагружается
export async function freshStartKeepingSession(page) {
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (!/^sb-/.test(k) && k !== 'pithy_anon_id') localStorage.removeItem(k)
  })
  await page.goto('/')
  await expect(page.locator('.feedSlideWrapActive')).toBeVisible({ timeout: 30_000 })
}

// Шаг, которого боевое наполнение не позволило проверить (нет колод, игра не выпала по бюджету Пита…), — не падение, а запись
// «manual» в отчёте: человек видит, что именно осталось на ручную проверку, и почему
export const manual = (what, why) => test.info().attach(`manual: ${what}`, { body: String(why), contentType: 'text/plain' })
