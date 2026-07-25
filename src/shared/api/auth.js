import { supabase } from './supabase.js'

// captchaToken — токен Turnstile (см. shared/lib/useCaptcha.js). Если капча в
// Supabase не включена, параметр просто не используется.
export async function registerUser({ email, password, name, captchaToken }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
      ...(captchaToken ? { captchaToken } : {}),
    },
  })
  if (error) return { data, error }
  // При включённом подтверждении email signUp НЕ создаёт сессию — пользователь
  // оставался гостем (терялись XP и «Мои уроки»). Если сессии нет — сразу
  // входим паролем; не вышло (нужно подтверждение) — вернём как есть.
  // Токен капчи одноразовый и уже потрачен на signUp — второй раз не шлём:
  // при включённой капче этот вход не пройдёт, и это нормально (тот же
  // результат, что и с обязательным подтверждением почты).
  if (!data?.session) {
    const signin = await supabase.auth.signInWithPassword({ email, password })
    if (!signin.error) return { data: signin.data, error: null }
  }
  return { data, error }
}

export async function loginUser({ email, password, captchaToken }) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
    ...(captchaToken ? { options: { captchaToken } } : {}),
  })
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
