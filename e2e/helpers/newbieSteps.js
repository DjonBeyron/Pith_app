import { expect } from '../fixtures.js'
import { stubNewbieBackend } from './newbieBackend.js'
import { MEMORY_STORY } from '../../src/features/learn/memoryStoryText.js' // текст — заглушка владельца: сверяемся с файлом, не с копией

// Общие шаги сценариев нового пользователя (e2e/newbie-*.spec.js): подготовка страницы и «хвост» пути — от вкладки «Память»
// до подтверждения «Когда удобно учиться?». Гость с чистым localStorage — это и есть новичок: в режиме «Я новенький» админки
// (newbieSim.js) приложение ведёт себя так же, но он требует админ-вход и локальную базу, а сценарию нужны только заглушки сети.

// Страница нового пользователя: недостижимый Supabase с перехватом (newbieBackend.js) и чистое хранилище.
// Фикстура гасит попап установки и знакомство с «Памятью» — рассказ Пита этим сценарием проверяется, поэтому флаг снимаем.
// opts.group — группа Пита, закрепляемая за устройством: 'prompts' (по умолчанию) | 'control'; null — не закреплять (решит доля);
// opts.stub — настройки заглушки (сессия, RPC, таблицы — см. stubNewbieBackend); opts.keepIntro — не трогать флаг знакомства
export async function prepareNewbie(page, { group = 'prompts', stub = {}, keepIntro = false } = {}) {
  await page.addInitScript(({ group, keepIntro }) => {
    try {
      if (!keepIntro) localStorage.removeItem('pithy_memory_intro_v1')
      // Группа «с вопросами Пита» закреплена за устройством (promptGroup.js: «прилипает»); иначе 10% запусков попали бы в контрольную
      if (group) localStorage.setItem('pithy_prompt_group_v1', JSON.stringify({ group, share: 10, id: 'e2e-newbie' }))
      // Тихая фоновая загрузка модели распознавания речи (Vosk, ~39 МБ с GitHub Pages) к сценарию не относится, а внешняя сеть
      // в прогоне недопустима (сбой запроса «ловец багов» считает ошибкой) — используем админский стоп планировщика
      localStorage.setItem('pithy_vosk_bg_stop_v1', '1')
    } catch { /* приватный режим */ }
  }, { group, keepIntro })
  return stubNewbieBackend(page, stub)
}

export const learnTab = page => page.locator('[data-nav="learn"]')

// Первое слово сохранено: вкладка «Память» появилась и мерцает; тап — мерцание гаснет, Пит рассказывает, что здесь живёт;
// «Дальше» доводит рассказ до конца, кнопка в конце → «Когда удобно учиться?» → пресет 20:00 → «Готово…» → закрыть
export async function memoryTabToRemind(page) {
  await expect(learnTab(page)).toHaveClass(/shellV2NavBtn--blink/)
  await learnTab(page).click()
  await expect(learnTab(page)).not.toHaveClass(/shellV2NavBtn--blink/) // нажали — мерцание ушло навсегда
  expect(await page.evaluate(() => localStorage.getItem('pithy_memory_tab_seen_v1'))).toBe('1')

  const story = page.getByRole('dialog', { name: 'Пит рассказывает о Памяти' })
  await expect(story).toBeVisible()
  const now = story.locator('.memStoryLine--now')
  expect(MEMORY_STORY.lines).toContain(await now.innerText()) // субтитры идут и без озвучки (озвучки в заглушке нет)
  await story.getByRole('button', { name: 'Дальше' }).click() // пропустить: сразу последняя фраза и кнопка
  const cta = story.getByRole('button', { name: MEMORY_STORY.cta })
  await expect(cta).toBeVisible()
  await expect(now).toHaveText(MEMORY_STORY.lines.at(-1))
  await cta.click()
  await expect(story).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('pithy_memory_intro_v1'))).toBe('1') // рассказ больше не покажется

  const ask = page.getByRole('dialog', { name: 'Когда удобно учиться' })
  await expect(ask).toContainText('Когда тебе удобно учиться?')
  await ask.getByRole('button', { name: '20:00' }).click()
  await expect(ask.locator('.raConfirm')).toContainText('Готово')
  await expect(ask.locator('.raConfirm')).toContainText('20:00')
  // Гостю уведомлений слать не на что: выбор лежит на устройстве, в базу (RPC set_remind_time) не уходит
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('pithy_remind_v1')))).toMatchObject({ hh: 20, mm: 0, enabled: true })
  await ask.getByRole('button', { name: 'Готово' }).click()
  await expect(ask).toHaveCount(0)
}
