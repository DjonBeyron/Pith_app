import { test } from '@playwright/test'
import { manual } from './helpers/newbieEvidence.js'

// Пункты плана, которые автоматически проверить НЕЛЬЗЯ. Это не skip: каждый «тест» фиксирует причину в приложении `итог`
// ({ item, manual: true, why }), и scripts/newbie-coverage-report.mjs показывает пункт в отчёте как «только руками» с этой причиной
// (владелец видит, что именно остаётся проверить на телефоне, и по какому пункту CHECK_NEW_USER.md). Браузер здесь не нужен.
// Остальные «только руками» живут рядом с похожими автоматическими сценариями: E.round — в newbie-coverage-say.spec.js, B7.real — в newbie-coverage-guest.spec.js.
test.describe.configure({ mode: 'parallel' })

// eslint-disable-next-line no-empty-pattern -- Playwright требует деструктуризацию первого аргумента; браузер этому тесту не нужен
test('[B5.fill] «Дополни реплику» — нет озвученных реплик с таймингами слов', async ({}, testInfo) => {
  await manual(testInfo, 'B5.fill', 'Игра «Дополни реплику» предлагается только при озвученной реплике с таймингами слов (нода audio или сцена); у заглушки сети (e2e/helpers/newbieBackend.js) такого материала нет, а в боевых колодах озвученных реплик пока мало — игра молчит и это ожидаемо (CHECK_NEW_USER.md п. 4). Логика покрыта юнит-тестами (fillTasks, fillAudioPlan, fillGame, pickConfusers)')
})

// eslint-disable-next-line no-empty-pattern -- Playwright требует деструктуризацию первого аргумента; браузер этому тесту не нужен
test('[B5.picture] «Картинка» — нет карточек photo_choice с картинками', async ({}, testInfo) => {
  await manual(testInfo, 'B5.picture', 'Игра «Картинка» предлагается только при карточках photo_choice с картинками; в колодах их пока почти нет (PLAN_NEW_USER.md, B5 — нужна авторская работа), игра молчит. Логика покрыта юнит-тестами (pictureTasks). Проверить руками, когда появятся карточки')
})

// eslint-disable-next-line no-empty-pattern -- Playwright требует деструктуризацию первого аргумента; браузер этому тесту не нужен
test('[C2.iphone-real] уведомления на настоящем iPhone — PWA с экрана «Домой», разрешение и реальный пуш', async ({}, testInfo) => {
  await manual(testInfo, 'C2.iphone-real', 'Ветка «На iPhone уведомления приходят только приложению на экране «Домой»» проверена в Chromium с подменой iPhone (newbie-persona-iphone.spec.js), но реальный Safari, установка на экран «Домой», запрос разрешения и доставка пуша на устройстве автоматически недоступны (WebKit в проект не ставится, Push API только у установленной PWA). CHECK_NEW_USER.md п. 6, четвёртый пункт')
})

// eslint-disable-next-line no-empty-pattern -- Playwright требует деструктуризацию первого аргумента; браузер этому тесту не нужен
test('[A3.real] пуш приходит в выбранное время — серверная часть (cron, push-trigger, SQL пояса)', async ({}, testInfo) => {
  await manual(testInfo, 'A3.real', 'Автоматически проверено, что приложение отправляет set_remind_time с верным временем; сам пуш рождается на сервере: функция push-trigger, будильник pithy-push-remind раз в 10 минут, пересчёт next_remind_at по поясу. Требует боевой базы и реального устройства: CHECK_NEW_USER.md п. 10 (в т. ч. supabase/checks/remind_time.sql в SQL Editor)')
})

// eslint-disable-next-line no-empty-pattern -- Playwright требует деструктуризацию первого аргумента; браузер этому тесту не нужен
test('[A1.admin] доля контрольной группы и таблица «по группам» в админке «Аналитика»', async ({}, testInfo) => {
  await manual(testInfo, 'A1.admin', 'Админ-экран «Аналитика» (доля группы 0–50 %, число людей в группе, пометка «мало данных — выводов нет») доступен только под админ-входом против боевой/локальной базы (проекты admin/rls в playwright.config.js требуют .env.test). Поведение самих групп проверено автоматически (newbie-persona-control.spec.js). CHECK_NEW_USER.md п. 9')
})
