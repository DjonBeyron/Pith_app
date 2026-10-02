import { useState, useEffect } from 'react'
import AchievementsPanel from './AchievementsPanel.jsx'
import {
  fetchMyAchievements, saveCosmetics, claimLevelAchievement,
} from '../../shared/api/ratingApi.js'
import { getProfile } from '../../shared/api/profileApi.js'
import { patchCachedProfile } from '../../shared/api/profileCache.js'
import { LEVELS } from '../../shared/lib/xpLevels.js'
import { useAuth } from '../../shared/lib/useAuth.js'
import { markSeen } from './customizationSeen.js'
import BackButton from '../../shared/ui/BackButton.jsx'

const LEVEL10_XP = LEVELS.find(l => l.level === 10)?.xpNeeded ?? 8000

// Экран «Кастомизация профиля»: достижения, примерка косметики
// (подложка/рамка/медаль) и предпросмотр своей строки в рейтинге.
// Выбор аватара — отдельный попап по тапу на аватар в самом профиле.
export default function CustomizationScreen({ onBack }) {
  const [achievements, setAchievements] = useState([])
  const [cosmetics,    setCosmetics]    = useState({})
  const [profile,      setProfile]      = useState(null)
  const [loading,      setLoading]      = useState(true)
  const { user } = useAuth()
  const uid = user?.id ?? null

  useEffect(() => {
    (async () => {
      const [achLoaded, prof] = await Promise.all([fetchMyAchievements(), getProfile()])
      setProfile(prof)
      setCosmetics(prof?.cosmetics ?? {})
      // «10-й уровень» выдаётся лениво: увидели нужный XP — попросили сервер
      let ach = achLoaded
      if (prof && prof.xp >= LEVEL10_XP && !ach.some(a => a.kind === 'level10')) {
        if (await claimLevelAchievement()) ach = [...ach, { kind: 'level10', meta: {} }]
      }
      setAchievements(ach)
      if (uid) markSeen(uid, ach) // увидел открытое — блок в профиле перестаёт блестеть
      setLoading(false)
    })()
  }, [uid])

  async function equip(next) {
    const applied = await saveCosmetics(next)
    if (applied) {
      setCosmetics(applied)
      patchCachedProfile({ cosmetics: applied }) // «Рейтинг» (уже смонтирован) обновит свой ряд заранее — без скачка при заходе
    }
  }

  return (
    <div className="pvSettingsScreen">
      <BackButton onClick={onBack} label="Профиль" className="pvBack" />
      {loading ? (
        <div className="pvEmpty">Загрузка...</div>
      ) : (
        <AchievementsPanel
          achievements={achievements}
          cosmetics={cosmetics}
          equip={equip}
          profile={profile}
          myId={user?.id ?? null}
        />
      )}
    </div>
  )
}
