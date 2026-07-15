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
      // Серия сорвалась и сервер сам начислил награды за незабранные дни —
      // сохраняем инфо для плашки; показывает и удаляет ключ RewardsPopup.
      if (res?.reset && res?.auto_claimed && (res.auto_claimed.xp > 0 || res.auto_claimed.tickets > 0)) {
        try {
          localStorage.setItem('pithy_streak_reset_info', JSON.stringify({
            lost: res.lost_streak ?? 0,
            xp: res.auto_claimed.xp,
            tickets: res.auto_claimed.tickets,
          }))
        } catch { /* ignore */ }
      }
    })()
  }, [user])
}
