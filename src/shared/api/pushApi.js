import { supabase } from './supabase.js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Вызов edge-функции push-send (только админ): рассылка Web Push.
// onlyMine=true — тестовый режим, только на подписки самого админа.
export async function sendPush({ title, body, url = '/', onlyMine = true }) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${SUPABASE_URL}/functions/v1/push-send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token ?? SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ title, body, url, onlyMine }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`push-send: ${res.status} | ${text}`)
  }
  return res.json() // { total, sent, failed, removed }
}

// Пуш САМОМУ СЕБЕ по триггеру (level_up): функция push-trigger проверяет
// личность по JWT и шлёт только на подписки этого пользователя. Тихий
// fire-and-forget — сбой пуша не должен мешать прохождению урока.
export async function sendSelfTrigger(kind, data = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await fetch(`${SUPABASE_URL}/functions/v1/push-trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ kind, ...data }),
    })
  } catch { /* не критично */ }
}
