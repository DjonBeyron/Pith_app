import { useState, useEffect } from 'react'
import { getCachedProfile, refreshProfile, subscribeProfile } from '../shared/api/profileCache.js'
import { useAuth } from '../shared/lib/useAuth.js'
import { getCurrentLevel, getNextLevel } from '../shared/lib/xpLevels.js'
import { isHudPopupOpen, toggleHudPopup, closeHudPopup, subscribeHudPopup } from './hudPopupState.js'

// Значок уровня персонажа в верхней панели (слева от билетов и энергии).
// Тап — мини-окно: название уровня и сколько XP до следующего.
export default function LevelBadge() {
  const { user } = useAuth()
  const [profile, setProfile] = useState(getCachedProfile)
  const [open, setOpen] = useState(() => isHudPopupOpen('level'))

  useEffect(() => {
    const unsubscribe = subscribeProfile(setProfile)
    if (!getCachedProfile()) refreshProfile()
    return unsubscribe
  }, [])

  useEffect(() => subscribeHudPopup(id => setOpen(id === 'level')), [])

  if (!user || !profile) return null
  const xp = profile.xp ?? 0
  const level = getCurrentLevel(xp)
  const next = getNextLevel(xp)

  return (
    <div className="levelWrap">
      <button className="levelBadge" onClick={() => toggleHudPopup('level')}>
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 3 7l9 5 9-5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinejoin="round" /></svg>
        <span>{level.level}</span>
      </button>

      {open && (
        <>
          <div className="energyPopBackdrop" onClick={closeHudPopup} />
          <div className="energyPop levelPop" onClick={closeHudPopup}>
            <b>Уровень {level.level} — {level.label}</b>
            <div>⚡ Всего: {xp} XP</div>
            <div className="energyPopNext">
              {next ? `До «${next.label}» осталось ${next.xpNeeded - xp} XP` : 'Максимальный уровень!'}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
