import { useState, useEffect, useCallback, useRef } from 'react'
import {
  fetchLeaderboard, fetchMyRank, fetchMyAchievements,
  saveCosmetics, claimLevelAchievement,
} from '../../shared/api/ratingApi.js'
import { getProfile } from '../../shared/api/profileApi.js'
import { subscribeProfile } from '../../shared/api/profileCache.js'
import { useAuth } from '../../shared/lib/useAuth.js'

// Порог достижения «level10» — захардкожен и здесь, и в claim_level_achievement
// (supabase_schema.sql), НЕ привязан к порогу уровня №10 из xpLevels.js: там
// теперь 101 уровень с другой шкалой, а это конкретное достижение как было
// про «дошёл до 8000 XP», так и осталось — имя «level10» уже не про номер
// уровня, а просто исторический kind в БД
const LEVEL10_XP = 8000

// Данные вкладки «Рейтинг»: топ по XP, своё место, достижения и косметика.
export function useRatingData(active = true, visible = true) {
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

  // reload ставит setLoading синхронно в начале загрузки — осознанно
  useEffect(() => { if (active) reload() }, [active, reload]) // eslint-disable-line react-hooks/set-state-in-effect

  // Баг: сбой сети во время самого захода в приложение — leaderboard/профиль
  // тихо приходят пустыми (ratingApi сам глушит ошибку сети и отдаёт []/null,
  // reload() из-за этого никогда не падает) и вкладка так и остаётся пустой
  // до перезагрузки приложения. Повторяем попытку тем же способом, что и
  // лента (см. useFeedModules): по возврату на вкладку (visible false→true)
  // и по восстановлению сети/возврату из фона (visibilitychange)
  const prevVisible = useRef(visible)
  useEffect(() => {
    if (active && visible && !prevVisible.current) reload()
    prevVisible.current = visible
  }, [active, visible, reload])

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible' && active && visible) reload() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [active, visible, reload])

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
