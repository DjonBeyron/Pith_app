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
  /net::ERR_ABORTED/i,                     // видео ленты отменяются при скролле — норма
  /Failed to fetch/i,                      // fetch API: транспортный сбой/CORS, не логика
]

const ignored = text => IGNORE.some(r => r.test(text))

export const test = base.extend({
  page: async ({ page }, use) => {
    // Гасим одноразовый попап «Установить приложение» (гость+мобила): его
    // оверлей installSlidesOverlay перехватывает клики. Флаг ставится ДО
    // загрузки страницы, поэтому попап не всплывает ни в одном тесте.
    // То же — окно первого входа во вкладку «Память» (MemoryIntro.jsx): его
    // проверяет свой тест, снимая флаг (guest.spec.js)
    await page.addInitScript(() => {
      try {
        localStorage.setItem('pithy_install_dismissed', '1')
        localStorage.setItem('pithy_memory_intro_v1', '1')
      } catch { /* приватный режим */ }
    })

    const bugs = []
    page.on('console', m => {
      if (m.type() !== 'error') return
      // Проверяем и текст, и URL источника: «Failed to load resource» от шрифта
      // глушим по URL, но такой же от ассета приложения (реальный 404) — ловим.
      const url = m.location()?.url ?? ''
      // Текст и адрес проверяем и порознь, и вместе: «Failed to load resource: 401 ()» + адрес auth/v1 — норма гостя
      // (правило /401.*auth\/v1/ видит «401» только в тексте, а «auth/v1» — только в адресе). Адрес пишем в строку бага
      if (ignored(m.text()) || ignored(url) || ignored(`${m.text()} ${url}`)) return
      bugs.push(`console: ${m.text()}${url ? ` @ ${url.split('?')[0]}` : ''}`)
    })
    page.on('pageerror', e => bugs.push(`pageerror: ${e.message}`))
    page.on('requestfailed', r => {
      // Причина сбоя (net::ERR_*) лежит в errorText, не в URL — проверяем обе части
      const msg = `${r.url()} ${r.failure()?.errorText ?? ''}`
      if (!ignored(msg)) bugs.push(`requestfailed: ${msg}`)
    })
    page.on('response', r => {
      const status = r.status()
      const url = r.url()
      if (status >= 500 && !ignored(url)) bugs.push(`http ${status}: ${url}`)
      // 401/403 вне auth/v1: консоль браузера пишет «Failed to load resource: 401 ()» БЕЗ адреса — по строке не понять, какой
      // запрос отвергла база (RLS/права). Кладём адрес (без query) отдельной строкой; гостевой auth/v1 — норма (см. IGNORE)
      if ((status === 401 || status === 403) && !/\/auth\/v1\//.test(url) && !ignored(url)) {
        bugs.push(`http ${status}: ${url.split('?')[0]}`)
      }
    })
    await use(page)
    expect(bugs, 'Ошибки консоли/сети во время теста').toEqual([])
  },
})

export { expect }
