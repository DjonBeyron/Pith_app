import { supabase } from './supabase.js'

export async function registerUser({ email, password, name }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
    },
  })
  if (error) return { data, error }
  // При включённом подтверждении email signUp НЕ создаёт сессию — пользователь
  // оставался гостем (терялись XP и «Мои уроки»). Если сессии нет — сразу
  // входим паролем; не вышло (нужно подтверждение) — вернём как есть.
  if (!data?.session) {
    const signin = await supabase.auth.signInWithPassword({ email, password })
    if (!signin.error) return { data: signin.data, error: null }
  }
  return { data, error }
}

export async function loginUser({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

export async function logoutUser() {
  const { error } = await supabase.auth.signOut()
  return { error }
}

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser()
  return { user, error }
}
