import { useState, useEffect, useRef } from 'react'
import { Layers, Zap } from 'lucide-react'
import { getCachedProfile, refreshProfile, subscribeProfile } from '../shared/api/profileCache.js'
import { useAuth } from '../shared/lib/useAuth.js'
import { getCurrentLevel, getNextLevel } from '../shared/lib/xpLevels.js'
import { isHudPopupOpen, toggleHudPopup, subscribeHudPopup, useHudOutsideDismiss } from './hudPopupState.js'

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

  const wrapRef = useRef(null)
  useHudOutsideDismiss(wrapRef, open)

  if (!user || !profile) return null
  const xp = profile.xp ?? 0
  const level = getCurrentLevel(xp)
  const next = getNextLevel(xp)

  return (
    <div className="levelWrap" ref={wrapRef}>
      <button className="levelBadge" onClick={() => toggleHudPopup('level')}>
        <Layers />
        <span>{level.level}</span>
      </button>

      {open && (
        <>
          <div className="energyPop levelPop">
            <b>Уровень {level.level} — {level.label}</b>
            <div className="energyPopHelpRow"><Zap size={13} /> Всего: {xp} XP</div>
            <div className="energyPopNext">
              {next ? `До «${next.label}» осталось ${next.xpNeeded - xp} XP` : 'Максимальный уровень!'}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
