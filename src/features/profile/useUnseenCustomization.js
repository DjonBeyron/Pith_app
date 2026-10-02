import { useState, useEffect } from 'react'
import { fetchMyAchievements } from '../../shared/api/ratingApi.js'
import { readSeen, hasUnseenCosmetic } from './customizationSeen.js'

// Есть ли у пользователя открытая и непросмотренная кастомизация (для блеска блока в профиле). Спрашиваем при показе
// вкладки и после возврата с экрана «Кастомизация профиля» (recheck) — он помечает всё просмотренным
export function useUnseenCustomization(userId, visible, recheck) {
  const [unseen, setUnseen] = useState(false)
  useEffect(() => {
    if (!userId || !visible) return undefined
    let alive = true
    fetchMyAchievements().then(a => { if (alive) setUnseen(hasUnseenCosmetic(a, readSeen(userId))) })
    return () => { alive = false }
  }, [userId, visible, recheck])
  return unseen
}
