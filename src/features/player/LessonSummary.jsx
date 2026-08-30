import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import { getCurrentLevel } from '../../shared/lib/xpLevels.js'
import { TicketBlock, StarsBlock } from './SummaryBadges.jsx'
import XpTransfer from '../../shared/ui/XpTransfer.jsx'
import Confetti from '../../shared/ui/Confetti.jsx'

// ── Main component ─────────────────────────────────────────────────────────
export default function LessonSummary({ earnedXp = 0, baseXp = 0, ticket = null, hintLimit = 3, stars = null, onClose }) {
  const totalXp   = baseXp + earnedXp
  const prevLevel = getCurrentLevel(baseXp)
  const newLevel  = getCurrentLevel(totalXp)
  const levelUp   = newLevel.level > prevLevel.level

  const [visible, setVisible] = useState(false)
  const [done,    setDone]    = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <>
      {levelUp && done && <Confetti />}
      <div className={`lessonSummaryOverlay${visible ? ' lessonSummaryOverlayVisible' : ''}`}>
        <div className="lessonSummaryCard">

          <div className="summaryTitle">Урок завершён</div>

          <XpTransfer baseXp={baseXp} earnedXp={earnedXp} onDone={() => setDone(true)} />

          <StarsBlock stars={stars} />
          <TicketBlock ticket={ticket} hintLimit={hintLimit} />

          {levelUp && (
            <div className={`summaryLevelUpBlock${done ? ' summaryLevelUpBlockVisible' : ''}`}>
              <div className="summaryLevelUpLabel"><Trophy size={16} className="summaryLevelUpIcon" /> Новый уровень!</div>
              <div className="summaryLevelUpNum">Уровень {newLevel.level}</div>
              <div className="summaryLevelUpName">{newLevel.label}</div>
            </div>
          )}

          <button className="summaryCloseBtn" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </>
  )
}
