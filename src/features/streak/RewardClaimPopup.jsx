import { useEffect, useState } from 'react'
import { getCurrentLevel, getNextLevel } from '../../shared/lib/xpLevels.js'

// Праздничное окно после «Забрать всё» в стрике (по мотивам итогов урока —
// LessonSummary, но компактнее: без конфетти и канваса частиц). XP-бар
// монтируется с шириной «до» и через короткий setTimeout едет к «после»
// (CSS transition width) — если новый XP пересекает порог уровня, бар
// просто доезжает до 100% и показывается подпись о новом уровне.
export default function RewardClaimPopup({ xp, tickets, days, xpBefore, onClose }) {
  const xpAfter = xpBefore + xp

  const startLevel = getCurrentLevel(xpBefore)
  const startNext  = getNextLevel(xpBefore)
  const newLevel   = getCurrentLevel(xpAfter)
  const levelUp    = newLevel.level > startLevel.level

  const rangeStart = startLevel.xpNeeded
  const rangeEnd   = startNext ? startNext.xpNeeded : rangeStart + Math.max(xp, 100)
  const rangeSize  = Math.max(rangeEnd - rangeStart, 1)
  const initPct    = Math.max(0, Math.min(((xpBefore - rangeStart) / rangeSize) * 100, 100))
  const finalPct   = levelUp ? 100 : Math.min(((xpAfter - rangeStart) / rangeSize) * 100, 100)

  const [barPct, setBarPct] = useState(initPct)
  const rightLevel = levelUp ? getNextLevel(xpAfter) : startNext

  useEffect(() => {
    const id = setTimeout(() => setBarPct(finalPct), 60)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="rcOverlay" onClick={onClose}>
      <div className="rcCard" onClick={e => e.stopPropagation()}>
        <div className="rcIcon">🎁</div>
        <h3 className="rcTitle">Награда получена!</h3>
        <div className="rcXp">+{xp} XP</div>
        {tickets > 0 && <div className="rcTickets">+{tickets} 🎟</div>}
        {days >= 2 && <p className="rcSub">за {days} дн. серии</p>}

        <div className="rcBarSection">
          <div className="rcBarLabels">
            <span>{startLevel.label} (Ур. {startLevel.level})</span>
            {rightLevel && <span>{rightLevel.label} (Ур. {rightLevel.level})</span>}
          </div>
          <div className="rcBar">
            <div
              className="rcBarFill"
              style={{
                width: `${barPct}%`,
                transition: barPct === initPct ? 'none' : 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
              }}
            />
          </div>
        </div>

        {levelUp && <div className="rcLevelUp">🎉 Новый уровень: {newLevel.label}!</div>}

        <button className="rcCloseBtn" onClick={onClose}>Отлично</button>
      </div>
    </div>
  )
}
