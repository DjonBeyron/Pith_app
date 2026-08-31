import { Gift } from 'lucide-react'
import BurstConfetti from '../../shared/ui/BurstConfetti.jsx'
import StreakCountUp from './StreakCountUp.jsx'
import TicketIcon from '../../shared/ui/TicketIcon.jsx'

const SG_CONFETTI = ['#c9b6ff', '#9b7bff', '#efe9ff', '#7c56e9', '#ffd98a']

// Первый день в жизни аккаунта: показывается один раз, сразу после анимации
// графа (см. firstDaySignal.js). Обычное утреннее окно серии в этот момент
// молчит — человеку ещё нечего «продолжать», зато самое время объяснить, что
// он только что начал и что будет завтра.
export default function StreakStartOverlay({ onClose }) {
  return (
    <div className="sgOverlay">
      <div className="sgScroll">
        <div className="sgInner">
          <p className="sgEyebrow">Первый урок пройден</p>
          <h1 className="sgTitle">Твой путь <span className="sgAccent">начался!</span></h1>

          <div className="sgCard">
            <StreakCountUp value={1} className="sgCount" />
            <div className="sgUnit"><span>день подряд</span></div>
          </div>

          <div className="sgGuard">
            <Gift className="sgGuardIcon" size={16} />
            <span className="sgGuardBody">
              <span className="sgGuardText">
                Занимайся каждый день — серия растёт, а за дни дают XP и билеты
                <TicketIcon className="sgGainedIcon" />
              </span>
              <span className="sgGuardNote">Завтрашний подарок ждёт тебя после урока</span>
            </span>
          </div>

          <button className="sgBtn" onClick={onClose}>Отлично</button>
        </div>
      </div>
      <BurstConfetti count={26} size={5} colors={SG_CONFETTI} />
    </div>
  )
}
