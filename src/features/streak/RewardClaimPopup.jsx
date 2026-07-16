import { useEffect, useState } from 'react'
import { getCurrentLevel } from '../../shared/lib/xpLevels.js'
import XpTransfer from '../../shared/ui/XpTransfer.jsx'

// Праздничное окно после «Забрать всё» в стрике — построено на тех же
// компонентах, что и итоги урока (LessonSummary): тикающий счётчик XP,
// частицы летящие в бар, доезжающий бар и плашка нового уровня, которая
// появляется после того, как бар доехал (см. XpTransfer.onDone).
export default function RewardClaimPopup({ xp, tickets, days, xpBefore, onClose }) {
  const totalXp   = xpBefore + xp
  const prevLevel = getCurrentLevel(xpBefore)
  const newLevel  = getCurrentLevel(totalXp)
  const levelUp   = newLevel.level > prevLevel.level

  const [done, setDone] = useState(false)
  const [showTickets, setShowTickets] = useState(false)

  useEffect(() => {
    if (!done || !(tickets > 0)) return
    const id = setTimeout(() => setShowTickets(true), 350)
    return () => clearTimeout(id)
  }, [done, tickets])

  return (
    <div className="rcOverlay" onClick={onClose}>
      <div className="rcCard" onClick={e => e.stopPropagation()}>
        <div className="rcIcon">🎁</div>
        <h3 className="rcTitle">Награда получена!</h3>
        {days >= 2 && <p className="rcSub">за {days} дн. серии</p>}

        <XpTransfer
          baseXp={xpBefore}
          earnedXp={xp}
          label="Награда за стрик"
          onDone={() => setDone(true)}
        />

        {tickets > 0 && (
          <div className={`rcTickets${showTickets ? ' rcTicketsVisible' : ''}`}>
            +{tickets} 🎟
          </div>
        )}

        {levelUp && (
          <div className={`rcLevelUpBlock${done ? ' rcLevelUpBlockVisible' : ''}`}>
            <div className="rcLevelUpLabel">🏆 Новый уровень!</div>
            <div className="rcLevelUpNum">Уровень {newLevel.level}</div>
            <div className="rcLevelUpName">{newLevel.label}</div>
          </div>
        )}

        <button className="rcCloseBtn" onClick={onClose}>Закрыть</button>
      </div>
    </div>
  )
}
