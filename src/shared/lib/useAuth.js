import { useEffect, useState } from 'react'
import { supabase } from '../api/supabase.js'
import { dbg } from './debug.js'
import { isNewbieSim } from './newbieSim.js'

// real — настоящий вход, даже в режиме «новенький» (newbieSim.js): он нужен только useIsAdmin, чтобы админка
// оставалась на месте. Все остальные видят в этом режиме гостя (user = null)
export function useAuth({ real = false } = {}) {
  const mask = !real && isNewbieSim()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // getSession — ЛОКАЛЬНОЕ чтение сессии из storage (мгновенно, без сети).
    // Раньше тут был getUser() — сетевой запрос: на медленном старте он
    // отваливался и UI показывал гостя при живой сессии.
    supabase.auth.getSession().then(({ data: { session } }) => {
      dbg('[AUTH] restore:', session ? `user ${session.user.email}` : 'нет сессии')
      setUser(mask ? null : session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      dbg('[AUTH] event:', event, session ? session.user.email : '—')
      setUser(mask ? null : session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [mask])

  return { user, loading }
}
