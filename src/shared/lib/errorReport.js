import { supabase } from '../api/supabase.js'
import { APP_VERSION } from './version.js'

// Отправка ошибок клиента в таблицу client_errors (Supabase, см. SQL-блок
// «Наблюдаемость»). Защита от шторма: одна и та же ошибка — не чаще раза в
// минуту, всего не более 20 за сессию. Любой сбой отправки глотается —
// репортер ошибок не имеет права ронять приложение сам.
const DEDUP_MS        = 60_000
const MAX_PER_SESSION = 20

const sentAt = new Map() // ключ (message) -> ts последней отправки
let sentCount = 0

export async function reportError({ message, stack = null, source = 'onerror' }) {
  try {
    if (!message || sentCount >= MAX_PER_SESSION) return
    const key = String(message).slice(0, 200)
    const now = Date.now()
    if (now - (sentAt.get(key) ?? 0) < DEDUP_MS) return
    sentAt.set(key, now)
    sentCount++
    const { data: { session } } = await supabase.auth.getSession()
    await supabase.from('client_errors').insert({
      user_id: session?.user?.id ?? null,
      message: String(message).slice(0, 500),
      stack: stack ? String(stack).slice(0, 4000) : null,
      source,
      ua: navigator.userAgent.slice(0, 200),
      app_version: APP_VERSION,
    })
  } catch { /* не роняем приложение из репортера */ }
}
