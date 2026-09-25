import { supabase } from '../../api/supabase.js'
import { APP_VERSION } from '../version.js'
import { dbg } from '../debug.js'
import { createTracker } from './tracker.js'

// Журнал продуктовой аналитики: track(name, props) из любого места
// приложения. События копятся в очереди (tracker.js) и уходят пачкой в RPC
// log_events (миграция 20260924130000_app_events.sql) — раз в 10 секунд,
// сразу при 20 накопленных и при сворачивании/закрытии (fetch keepalive).
// В dev-сборке ничего не отправляется — только строка в debug-логе.
//
// Словарь событий (имя → props) — PROJECT.md → «Аналитика»:
//   app_open { standalone, tg, resume? }   push_open
//   feed_view { module_id, ms }            feed_learn { module_id }
//   lesson_start { lesson_id, resumed }    lesson_finish { lesson_id, ms }
//   lesson_abandon { lesson_id, pct, ms }  signup
//   paywall_view { kind }                  paywall_click { kind, period }
//   review_start { words, cards }          review_answer { word, result, attempt, ms }
//   review_finish { words, cards, errors, ms, xp }   review_abandon { answered, total, ms }
//   (повторение — features/review/reviewTracker.js)

const URL_ = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const SEND = !import.meta.env.DEV && !!URL_ && !!KEY
const ANON_KEY = 'pithy_anon_id'
const FLUSH_DELAY = 10000
const FLUSH_AT = 20

function newId() {
  try { return crypto.randomUUID() } catch {
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12)
  }
}

function safeStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null }
}

// id устройства: общий для гостя и того же человека после входа
const anonId = (() => {
  const ls = safeStorage()
  try {
    const saved = ls?.getItem(ANON_KEY)
    if (saved) return saved
    const id = newId()
    ls?.setItem(ANON_KEY, id)
    return id
  } catch { return newId() }
})()

// Токен сессии держим под рукой: при закрытии страницы ждать getSession()
// некогда. Без входа — анонимный ключ (гость)
let token = null

async function send(batch, { keepalive }) {
  if (!SEND) {
    dbg('[analytics]', batch.map(e => e.name).join(', '))
    return true
  }
  const res = await fetch(`${URL_}/rest/v1/rpc/log_events`, {
    method: 'POST',
    keepalive,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${token ?? KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_anon_id: anonId, p_app_version: APP_VERSION, p_events: batch }),
  })
  return res.ok
}

const tracker = createTracker({ send, storage: safeStorage(), newId })
let timer = null

export function track(name, props = null) {
  const size = tracker.push(name, props)
  if (size >= FLUSH_AT) { flushNow(); return }
  if (!timer) timer = setTimeout(flushNow, FLUSH_DELAY)
}

function flushNow() {
  clearTimeout(timer)
  timer = null
  tracker.flush()
}

// Один раз при запуске (main.jsx): подписка на токен, отправка при
// сворачивании, событие открытия и открытия из пуша.
export function initAnalytics() {
  supabase.auth.getSession().then(({ data }) => { token = data?.session?.access_token ?? null })
  supabase.auth.onAuthStateChange((_e, session) => { token = session?.access_token ?? null })

  const standalone = (() => {
    try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true } catch { return false }
  })()
  const tg = !!window.Telegram?.WebApp?.initData

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      clearTimeout(timer)
      timer = null
      tracker.flush({ keepalive: true })
    } else if (tracker.touchSession()) {
      // PWA сутками не перезагружается: возврат после долгой паузы — тоже «открытие»
      track('app_open', { standalone, tg, resume: true })
    }
  })
  window.addEventListener('pagehide', () => tracker.flush({ keepalive: true }))

  track('app_open', { standalone, tg })

  // Тап по пушу: сервис-воркер открывает приложение с ?from=push
  // (public/push-sw.js). Метку считаем и убираем из адреса
  const params = new URLSearchParams(location.search)
  if (params.get('from') === 'push') {
    track('push_open')
    params.delete('from')
    const q = params.toString()
    history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + location.hash)
  }

  // Хвост прошлого запуска (без сети/не успел уйти при закрытии)
  flushNow()
}
