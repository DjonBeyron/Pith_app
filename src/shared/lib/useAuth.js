import { useEffect, useState } from 'react'
import { supabase } from '../api/supabase.js'
import { dbg } from './debug.js'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // getSession — ЛОКАЛЬНОЕ чтение сессии из storage (мгновенно, без сети).
    // Раньше тут был getUser() — сетевой запрос: на медленном старте он
    // отваливался и UI показывал гостя при живой сессии.
    supabase.auth.getSession().then(({ data: { session } }) => {
      dbg('[AUTH] restore:', session ? `user ${session.user.email}` : 'нет сессии')
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      dbg('[AUTH] event:', event, session ? session.user.email : '—')
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  return { user, loading }
}
