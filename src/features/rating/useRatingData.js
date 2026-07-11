import { useState, useEffect, useCallback } from 'react'
import {
  fetchLeaderboard, fetchMyRank, fetchMyAchievements,
  saveCosmetics, claimLevelAchievement,
} from '../../shared/api/ratingApi.js'
import { getProfile } from '../../shared/api/profileApi.js'
import { subscribeProfile } from '../../shared/api/profileCache.js'
import { LEVELS } from '../../shared/lib/xpLevels.js'
import { useAuth } from '../../shared/lib/useAuth.js'

const LEVEL10_XP = LEVELS.find(l => l.level === 10)?.xpNeeded ?? 8000

// Данные вкладки «Рейтинг»: топ по XP, своё место, достижения и косметика.
export function useRatingData(active = true) {
  const [rows,         setRows]         = useState([])
  const [myRank,       setMyRank]       = useState(null)
  const [achievements, setAchievements] = useState([])
  const [cosmetics,    setCosmetics]    = useState({})
  const [profile,      setProfile]      = useState(null)
  const [loading,      setLoading]      = useState(true)
  const { user } = useAuth()

  const reload = useCallback(async () => {
    const [lb, rank, achLoaded, prof] = await Promise.all([
      fetchLeaderboard(100), fetchMyRank(), fetchMyAchievements(), getProfile(),
    ])
    setRows(lb)
    setMyRank(rank)
    setProfile(prof)
    setCosmetics(prof?.cosmetics ?? {})
    // «10-й уровень» выдаётся лениво: увидели нужный XP — попросили сервер
    let ach = achLoaded
    if (prof && prof.xp >= LEVEL10_XP && !ach.some(a => a.kind === 'level10')) {
      if (await claimLevelAchievement()) ach = [...ach, { kind: 'level10', meta: {} }]
    }
    setAchievements(ach)
    setLoading(false)
  }, [])

  useEffect(() => { if (active) reload() }, [active, reload])

  // Аватар/ник/косметика меняются в Профиле (другая вкладка, этот компонент
  // не размонтируется) — без этого обновление было видно только после
  // перезагрузки приложения. Патчим свою строку в списке точечно, без
  // повторного похода за всем топом.
  useEffect(() => {
    return subscribeProfile(p => {
      if (!p) return
      setProfile(p)
      setCosmetics(p.cosmetics ?? {})
      setRows(rs => rs.map(r => (user?.id && r.user_id === user.id)
        ? { ...r, avatar_seed: p.avatar_seed, nickname: p.nickname, cosmetics: p.cosmetics }
        : r))
    })
  }, [user?.id])

  // Надеть/снять: сервер вернёт то, что реально открыто достижениями
  async function equip(next) {
    const applied = await saveCosmetics(next)
    if (applied) setCosmetics(applied)
  }

  return { rows, myRank, achievements, cosmetics, profile, loading, equip, myId: user?.id ?? null }
}
