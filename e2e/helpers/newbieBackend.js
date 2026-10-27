import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Заглушка бэкенда для сценария нового пользователя (e2e/newbie-first-session.spec.js). Стенд «newbie» (playwright.config.js)
// поднимает свой dev-сервер с НЕДОСТИЖИМЫМ Supabase по адресу NEWBIE_HOST — ни боевая база, ни Docker не нужны. Все запросы к этому
// хосту перехватываются здесь и получают данные из памяти: 24 опубликованные фразы ленты и одно слово «keep» с колодой
// повторения (карточка: контекст + задание «Выбери слово»). Остальное (настройки, рейтинг, лайки, журнал) — пустые ответы 200:
// падение запроса фикстура-«ловец багов» (fixtures.js) считает ошибкой, поэтому abort() не годится.
export const NEWBIE_HOST = 'newbie-stub.supabase.co'
export const NEWBIE_PORT = 5399
export const WORD = 'keep'
export const MODULES = 24

const MEDIA_BASE = `https://${NEWBIE_HOST}/media`
const MEDIA_DIR = fileURLToPath(new URL('../feed-media/media/', import.meta.url))
const LESSON_IDS = ['nb-start', 'nb-keep', 'nb-final']

// Фразы ленты: у первой — три урока (Старт, слово keep, Финал), чтобы слово keep попало в колоды повторения
const curricula = Array.from({ length: MODULES }, (_, i) => ({
  id: `nb-m${i}`,
  title: `Newbie phrase number ${i + 1}`,
  title_translation: `Фраза новичка ${i + 1}`,
  word_translations: [],
  lesson_ids: i === 0 ? LESSON_IDS : [],
  video_url: `${MEDIA_BASE}/v1.webm?n=${i}`, // один крошечный ролик и постер из стенда feed-media под разными адресами
  poster_url: `${MEDIA_BASE}/p1.jpg?n=${i}`,
  published: true,
  preview_only: false,
  created_at: new Date(Date.now() - i * 60_000).toISOString(),
  difficulty: null,
}))

// Карточка колоды слова keep: реплика-контекст, через 0,8 с — задание «Выбери слово» (верный вариант — keep)
const cardNodes = [
  { id: 'nb1', seq: 1, x: 0, y: 0, size: 'max', type: 'text', typeData: { text: { text: 'I want to ___ it.' } },
    triggers: [{ id: 'nb1t', if: 'timer', ms: 800, then: 'nb2' }] },
  { id: 'nb2', seq: 2, x: 370, y: 0, size: 'max', type: 'word_choice',
    typeData: { word_choice: { options: [{ id: 'o1', text: 'keep', isCorrect: true }, { id: 'o2', text: 'kip' }, { id: 'o3', text: 'cap' }], responseCorrect: '', responseWrong: '' } },
    triggers: [{ id: 'nb2a', if: 'word_correct', then: null }, { id: 'nb2b', if: 'word_wrong', then: null }] },
]
const lessonRow = { id: 'nb-keep', title: WORD }

// Ответ на GET /rest/v1/<table>?<query>: по таблице и форме select
function restRows(table, query) {
  if (table === 'curricula') return curricula
  if (table !== 'lessons') return []
  if (/deck:/.test(query)) return [{ ...lessonRow, deck: 'nb-card' }] // listLessonDeckFlags: у слова есть колода
  if (/cards:/.test(query)) return [{ ...lessonRow, cards: [{ id: 'nb-card', nodes: cardNodes }], teacherMode: null, teacherName: null, teacherLogo: null, teacherLogoCrop: null }]
  return []
}

// Подключить заглушку к странице. Возвращает журнал обращений (метод + путь) — для отладки сценария
export async function stubNewbieBackend(page) {
  const calls = []
  await page.route(new RegExp(`^https://${NEWBIE_HOST.replaceAll('.', '\\.')}/`), async route => {
    const url = new URL(route.request().url())
    const method = route.request().method()
    calls.push(`${method} ${url.pathname}`)
    if (url.pathname.startsWith('/media/')) { // видео и постер ленты — из e2e/feed-media/media (стенд «лента рекомендаций»)
      const name = url.pathname.slice('/media/'.length)
      await route.fulfill({ status: 200, contentType: name.endsWith('.webm') ? 'video/webm' : 'image/jpeg', body: readFileSync(MEDIA_DIR + name), headers: { 'access-control-allow-origin': '*' } })
      return
    }
    const table = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname)?.[1]
    const body = method === 'GET' && table ? restRows(table, decodeURIComponent(url.search)) : []
    await route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(body),
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' },
    })
  })
  return calls
}
