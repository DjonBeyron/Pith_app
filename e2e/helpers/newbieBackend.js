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
export const curricula = Array.from({ length: MODULES }, (_, i) => ({
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
export const cardNodes = [
  { id: 'nb1', seq: 1, x: 0, y: 0, size: 'max', type: 'text', typeData: { text: { content: 'I want to ___ it.' } },
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

// Сессия вошедшего: ключ localStorage supabase-js (sb-<первая часть хоста>-auth-token) и сам объект. JWT «понарошку» — подпись
// клиент не проверяет, а заглушка токен не читает; срок — через час, чтобы автообновление не стучалось в /auth/v1/token
export const SESSION_KEY = `sb-${NEWBIE_HOST.split('.')[0]}-auth-token`
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
export function fakeSession(user = {}) {
  const u = { id: 'nb-user-1', aud: 'authenticated', role: 'authenticated', email: 'newbie@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z', ...user }
  const exp = Math.floor(Date.now() / 1000) + 3600
  const access_token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: u.id, role: 'authenticated', exp })}.stub`
  return { access_token, refresh_token: 'nb-refresh', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: u }
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const jsonBody = req => { try { return JSON.parse(req.postData() ?? 'null') } catch { return null } }

// Подключить заглушку к странице. Возвращает журнал обращений (метод + путь) — для отладки сценария; у массива есть поле
// `log` — те же обращения с телом запроса ({ method, path, query, body }) и функции rpcCalls/restCalls ниже.
// opts.session — сессия вошедшего (fakeSession()): отдаётся на /auth/v1/*; сам вход приложение берёт из localStorage (SESSION_KEY)
// opts.rpc — ответы RPC: { имя: значение | (тело) => значение } (по умолчанию пустой ответ [])
// opts.tables — строки таблиц поверх встроенных: { таблица: строки | (запрос) => строки }
export async function stubNewbieBackend(page, opts = {}) {
  const calls = []
  calls.log = []
  await page.route(new RegExp(`^https://${NEWBIE_HOST.replaceAll('.', '\\.')}/`), async route => {
    const req = route.request()
    const url = new URL(req.url())
    const method = req.method()
    const body = method === 'GET' ? null : jsonBody(req)
    calls.push(`${method} ${url.pathname}`)
    calls.log.push({ method, path: url.pathname, query: decodeURIComponent(url.search), body })
    if (url.pathname.startsWith('/media/')) { // видео и постер ленты — из e2e/feed-media/media (стенд «лента рекомендаций»)
      const name = url.pathname.slice('/media/'.length)
      await route.fulfill({ status: 200, contentType: name.endsWith('.webm') ? 'video/webm' : 'image/jpeg', body: readFileSync(MEDIA_DIR + name), headers: { 'access-control-allow-origin': '*' } })
      return
    }
    let payload = []
    if (url.pathname === '/auth/v1/user' && opts.session) payload = opts.session.user
    else if (url.pathname === '/auth/v1/token' && opts.session) payload = opts.session
    else if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const r = opts.rpc?.[url.pathname.slice('/rest/v1/rpc/'.length)]
      payload = typeof r === 'function' ? r(body) : r ?? []
    } else {
      const table = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname)?.[1]
      const extra = table ? opts.tables?.[table] : null
      if (method === 'GET' && table) payload = typeof extra === 'function' ? extra(calls.log.at(-1).query) : extra ?? restRows(table, calls.log.at(-1).query)
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload), headers: CORS })
  })
  return calls
}

// Вызовы RPC по имени (с телами) и записи в таблицу (POST/PATCH/DELETE) — для проверок «что приложение отправило»
export const rpcCalls = (calls, name) => calls.log.filter(c => c.method === 'POST' && c.path === `/rest/v1/rpc/${name}`)
export const writesTo = (calls, table) => calls.log.filter(c => c.path === `/rest/v1/${table}` && c.method !== 'GET' && c.method !== 'OPTIONS')
