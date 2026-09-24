import { ChevronsUp, ChevronsDown } from 'lucide-react'
import MgStars from './MgStars.jsx'

const PRIORITY = {
  high:   { label: 'Высокий приоритет', icon: ChevronsUp,   desc: 'Наиболее важен для вас' },
  medium: { label: 'Средний приоритет', icon: '≡',          desc: 'Полезен для развития' },
  low:    { label: 'Низкий приоритет',  icon: ChevronsDown, desc: 'Можно изучить позже' },
}

// Текстовая часть карточки урока в схеме модуля: название, награда XP,
// статус, приоритет. Статусы:
//   закрыт (до диагностики) — «Разблокировать урок», награду не показываем;
//   открыт, не начат        — «Урок ещё не начат»;
//   начат                   — тонкая полоска прогресса с процентом;
//   пройден                 — звёзды (или «Урок пройден», если их нет).
// Награда — компактный столбик справа: «+N XP» и под ним подпись «награда».
export default function MgLessonBody({ title, xp, done, locked, stars, pct, pKey, hideXp }) {
  const pInfo = pKey ? PRIORITY[pKey] : null
  const started = !done && !locked && pct != null

  let status
  if (done) status = stars > 0 ? <MgStars value={stars} /> : <span className="mgLessonSub">Урок пройден</span>
  else if (locked) status = <span className="mgLessonSub">Разблокировать урок</span>
  else if (started) status = (
    <div className="mgLessonProgress">
      <div className="mgLessonProgressBar">
        <div className="mgLessonProgressFill" style={{ width: `${Math.max(3, Math.min(100, pct))}%` }} />
      </div>
      <span className="mgLessonProgressPct">{Math.round(pct)}%</span>
    </div>
  )
  else status = <span className="mgLessonSub">Урок ещё не начат</span>

  return (
    <div className="mgLessonBody">
      <div className="mgLessonTop">
        <span className="mgNodeTitle">{title}</span>
        {/* у пройденного XP уже получен, у закрытого — пока не про него;
            при переименовании прячется — не наезжает на поле ввода */}
        {xp > 0 && !done && !locked && !hideXp && (
          <span className="mgLessonReward">
            <span className="mgLessonXp">+{xp} XP</span>
            <span className="mgLessonRewardLabel">награда</span>
          </span>
        )}
      </div>
      {status}
      {pInfo && (
        <div className={`mgLessonPriority mgLessonPriority--${pKey}`}>
          <span className="mgLessonPriorityIcon">
            {typeof pInfo.icon === 'string' ? pInfo.icon : <pInfo.icon size={14} />}
          </span>
          <div className="mgLessonPriorityText">
            <span className="mgLessonPriorityLabel">{pInfo.label}</span>
            <span className="mgLessonPriorityDesc">{pInfo.desc}</span>
          </div>
        </div>
      )}
    </div>
  )
}
