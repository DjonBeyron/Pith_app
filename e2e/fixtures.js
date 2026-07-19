import { test as base, expect } from '@playwright/test'

// Система ловли багов (этап B): сценарий может «пройти», но если в консоли
// или сети была ошибка — это баг, и тест обязан упасть. Все тесты импортируют
// test/expect отсюда, а не из @playwright/test напрямую.

// Шум, который багом НЕ считается — пополнять ТОЛЬКО с комментарием почему.
const IGNORE = [
  /the play\(\) request was interrupted/i, // автоплей-политика браузера
  /play\(\) failed because/i,              // то же: видео не стартует без жеста
  /401.*auth\/v1/i,                        // гость без сессии — норма
  /\/version\.json/i,                      // на dev-сервере файла нет (UpdateToast) — норма
  /favicon\.ico/i,                         // фавикон не влияет на работу
  /fonts\.(googleapis|gstatic)\.com/i,     // Google Fonts режется на сети РФ; у шрифтов есть фолбэк
  // Транспортные сбои сети (не баги приложения): на сети РФ соединения к
  // внешним хостам периодически рвутся; у приложения своя обработка ошибок,
  // а в CI (GitHub, США) их не будет. Настоящие баги остаются ловимыми:
  // JS-исключения → pageerror; серверные → HTTP 5xx; битые ассеты → 404-текст.
  /net::ERR_(CONNECTION_RESET|CONNECTION_CLOSED|CONNECTION_TIMED_OUT|TIMED_OUT|NETWORK_CHANGED|INTERNET_DISCONNECTED)/i,
  /Failed to fetch/i,                      // fetch API: транспортный сбой/CORS, не логика
]

const ignored = text => IGNORE.some(r => r.test(text))

export const test = base.extend({
  page: async ({ page }, use) => {
    const bugs = []
    page.on('console', m => {
      if (m.type() !== 'error') return
      // Проверяем и текст, и URL источника: «Failed to load resource» от шрифта
      // глушим по URL, но такой же от ассета приложения (реальный 404) — ловим.
      const url = m.location()?.url ?? ''
      if (ignored(m.text()) || ignored(url)) return
      bugs.push(`console: ${m.text()}`)
    })
    page.on('pageerror', e => bugs.push(`pageerror: ${e.message}`))
    page.on('requestfailed', r => {
      if (!ignored(r.url())) bugs.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`)
    })
    page.on('response', r => {
      if (r.status() >= 500 && !ignored(r.url())) bugs.push(`http ${r.status()}: ${r.url()}`)
    })
    await use(page)
    expect(bugs, 'Ошибки консоли/сети во время теста').toEqual([])
  },
})

export { expect }
