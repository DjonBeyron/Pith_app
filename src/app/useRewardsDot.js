import { useEffect, useState } from 'react'
import { getCachedProfile, refreshProfile, subscribeProfile } from '../shared/api/profileCache.js'
import { hasUnclaimedStreak } from '../features/streak/streakClaim.js'

// Есть ли неполученная ежедневная награда — для значка «Профиль» в нижней панели (ShellNav.jsx): серия дошла дальше
// последнего полученного дня. Профиль берём из общего кэша, как верхние бейджи (LevelBadge, TicketBadge): после «Забрать»
// окно наград обновляет кэш — значок гаснет сам. Гостю награды не положены — точки нет.
export function useRewardsDot(isLoggedIn) {
  const [profile, setProfile] = useState(getCachedProfile)
  useEffect(() => {
    if (!isLoggedIn) return undefined
    const unsubscribe = subscribeProfile(setProfile)
    if (!getCachedProfile()) refreshProfile()
    return unsubscribe
  }, [isLoggedIn])
  return isLoggedIn && hasUnclaimedStreak(profile)
}
