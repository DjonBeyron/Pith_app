import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../shared/lib/useAuth.js'
import { touchDailyLogin } from '../../shared/api/streakApi.js'
import { refreshProfile } from '../../shared/api/profileCache.js'

const RESET_INFO_KEY = 'pithy_streak_reset_info'
// Ответ сервера, пришедший позже этого срока, уже не показываем: сплэш давно
// улетел, человек смотрит видео — выдёргивать его фуллскрином поздно. Кроме
// срыва серии: про потерю надо сказать в любом случае.
const STALE_MS = 4000

// Локальная дата устройства (YYYY-MM-DD). sv-SE даёт ISO-формат; в отличие от
// toISOString() считает по местному календарю, а не по UTC — иначе с полуночи
// до утра «сегодня» уезжало бы во вчера (МСК = UTC+3).
function localDay() {
  return new Date().toLocaleDateString('sv-SE')
}

// Что показать в полноэкранном окне серии:
//   'grown' — обычное утро, серия жива;
//   'saved' — пропуск простила заморозка/PRO;
//   'reset' — серия сорвалась (награды за неё сервер начислил сам);
//   null    — не показываем (не первый заход в сутки; новичок без серии;
//             ноль после уже показанного срыва).
function decide(res) {
  if (!res?.ok || !res.first_today) return null
  if (res.reset) return 'reset'
  if (res.saved_by) return 'saved'
  return (res.streak ?? 0) >= 1 ? 'grown' : null
}

// Единственный вход в ежедневный стрик на клиенте: отмечает визит на сервере
// и решает, показывать ли окно. Про «первый заход в сутки» спрашиваем СЕРВЕР
// (res.first_today), а не localStorage: очистка кэша, второй браузер или
// переустановка PWA иначе показали бы окно повторно.
//
// PWA сутками не перезагружается (на iPhone его сворачивают, а не закрывают),
// поэтому одного вызова при монтировании мало: при возврате из фона со сменой
// локальной даты визит отмечаем заново — иначе новый день не засчитается.
export function useStreakGate() {
  const { user } = useAuth()
  const [gate, setGate] = useState(null) // { state, res } | null
  const dayRef = useRef(null)            // локальная дата последнего touch
  const busyRef = useRef(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function touch() {
      if (busyRef.current) return
      busyRef.current = true
      const startedAt = Date.now()
      const res = await touchDailyLogin()
      busyRef.current = false
      if (cancelled || !res?.ok) return
      dayRef.current = localDay()
      await refreshProfile()
      if (cancelled) return

      // Серия сорвалась и сервер сам начислил награды за незабранные дни —
      // страховка на случай, если окно не покажется: плашку в RewardsPopup
      // никто не отменял. Показанное окно этот ключ удаляет само.
      if (res.reset && (res.auto_claimed?.xp > 0 || res.auto_claimed?.tickets > 0)) {
        try {
          localStorage.setItem(RESET_INFO_KEY, JSON.stringify({
            lost: res.lost_streak ?? 0,
            xp: res.auto_claimed.xp,
            tickets: res.auto_claimed.tickets,
          }))
        } catch { /* ignore */ }
      }

      const state = decide(res)
      if (!state) return
      if (state !== 'reset' && Date.now() - startedAt > STALE_MS) return
      setGate({ state, res })
    }

    touch()

    function onVisible() {
      if (document.visibilityState !== 'visible') return
      if (dayRef.current && dayRef.current === localDay()) return
      touch()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible) }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return { gate, closeGate: () => setGate(null) }
}
