import { useEffect, useRef } from 'react'
import { useAuth } from '../../shared/lib/useAuth.js'
import { touchDailyLogin } from '../../shared/api/streakApi.js'
import { refreshProfile } from '../../shared/api/profileCache.js'

// Один раз за сессию приложения (не при каждом ре-рендере) отмечает вход
// и продлевает/спасает/сбрасывает серию на сервере; профиль в кэше
// обновляется, чтобы бейджи (рейтинг/профиль) сразу увидели свежий
// current_streak без отдельного похода за данными.
export function useDailyLoginTouch() {
  const { user } = useAuth()
  const done = useRef(false)

  useEffect(() => {
    if (!user || done.current) return
    done.current = true
    ;(async () => {
      const res = await touchDailyLogin()
      if (res?.ok) await refreshProfile()
    })()
  }, [user])
}
