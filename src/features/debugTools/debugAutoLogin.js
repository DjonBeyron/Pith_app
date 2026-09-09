// Тестовый стенд без ручного входа: адрес с ?debug=1 (только npm run dev)
// логинится настоящим Supabase-аккаунтом из .env.local автоматически, без
// заполнения формы. Это НЕ обход авторизации/RLS — сессия настоящая, поэтому
// админка/канвас работают без единой правки в их коде (см. is_admin у этого
// аккаунта в БД). Капча не обходится: если в Supabase Attack Protection уже
// включена, здесь она просто не пройдёт — тогда войди один раз обычной формой.
import { loginUser } from '../../shared/api/auth.js'
import { supabase } from '../../shared/api/supabase.js'

export async function tryDebugAutoLogin() {
  if (!import.meta.env.DEV) return
  if (new URLSearchParams(location.search).get('debug') !== '1') return

  const email = import.meta.env.VITE_DEBUG_EMAIL
  const password = import.meta.env.VITE_DEBUG_PASSWORD
  if (!email || !password) {
    console.warn('[debug] ?debug=1 задан, но VITE_DEBUG_EMAIL/VITE_DEBUG_PASSWORD пусты в .env.local')
    return
  }

  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    console.info('[debug] сессия уже есть (' + session.user.email + ') — авто-вход пропущен')
    return
  }

  const { error } = await loginUser({ email, password })
  if (error) console.warn('[debug] авто-вход не прошёл:', error.message)
  else console.info('[debug] авто-вход выполнен:', email)
}
