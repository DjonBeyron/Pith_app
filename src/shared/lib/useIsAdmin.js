import { useEffect, useState } from 'react'
import { getProfile } from '../api/profileApi.js'
import { useAuth } from './useAuth.js'

// Кто такой «админ»: залогиненный Supabase-пользователь с is_admin=true в user_profiles.
// Реальная защита — на уровне RLS в БД (политики *_write_admin); этот хук нужен только чтобы
// показать/скрыть админский UI. Права выставляются в Supabase один раз вручную:
//   update public.user_profiles set is_admin = true where id = '<uuid аккаунта>';
export function useIsAdmin() {
  const { user, loading: authLoading } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (authLoading) return
    let alive = true
    ;(async () => {
      if (!user) {
        if (alive) { setIsAdmin(false); setChecking(false) }
        return
      }
      const p = await getProfile()
      if (alive) { setIsAdmin(!!p?.is_admin); setChecking(false) }
    })()
    return () => { alive = false }
  }, [user, authLoading])

  return { user, isAdmin, loading: authLoading || checking }
}
