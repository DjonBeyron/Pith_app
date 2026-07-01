import { LEVELS, getCurrentLevel, getNextLevel } from '../../shared/lib/xpLevels.js'

const XP_TO_NEXT = 100

// Stub data — replace with real API later
const STUB = {
  name: 'Пользователь',
  xp: 0,
  streak: 3,
  lessonsCompleted: 0,
}

export default function ProfileTab() {
  const { name, xp, streak, lessonsCompleted } = STUB
  const current = getCurrentLevel(xp)
  const next = getNextLevel(xp)

  const xpInLevel = next ? xp - current.xpNeeded : xp - current.xpNeeded
  const xpNeededForNext = next ? next.xpNeeded - current.xpNeeded : XP_TO_NEXT
  const progress = next ? Math.min(xpInLevel / xpNeededForNext, 1) : 1
  const pct = Math.round(progress * 100)

  return (
    <div className="profilePanel">
      <div className="profileHeader">
        <div className="profileAvatar">{name[0]}</div>
        <div className="profileName">{name}</div>
      </div>

      <div className="profileXpCard">
        <div className="profileLevelRow">
          <span className="profileLevelBadge">Ур. {current.level}</span>
          <span className="profileLevelLabel">{current.label}</span>
          {next && (
            <span className="profileLevelNext">→ {next.label} (Ур. {next.level})</span>
          )}
        </div>

        <div className="profileProgressWrap">
          <div className="profileProgressBar">
            <div className="profileProgressFill" style={{ width: `${pct}%` }} />
          </div>
          <div className="profileProgressMeta">
            <span>{xp} XP</span>
            {next && <span>{next.xpNeeded} XP</span>}
          </div>
        </div>

        <div className="profileXpHint">
          {next
            ? `До следующего уровня: ${next.xpNeeded - xp} XP`
            : 'Максимальный уровень достигнут'}
        </div>
      </div>

      <div className="profileStats">
        <div className="profileStatCard">
          <div className="profileStatValue">{xp}</div>
          <div className="profileStatLabel">Всего XP</div>
        </div>
        <div className="profileStatCard">
          <div className="profileStatValue">{streak}</div>
          <div className="profileStatLabel">Дней подряд</div>
        </div>
        <div className="profileStatCard">
          <div className="profileStatValue">{lessonsCompleted}</div>
          <div className="profileStatLabel">Уроков пройдено</div>
        </div>
      </div>

      <div className="profileLevelMap">
        <div className="profileLevelMapTitle">Все уровни</div>
        {LEVELS.map((lvl, i) => {
          const isReached = xp >= lvl.xpNeeded
          const isCurrent = current.level === lvl.level
          return (
            <div
              key={lvl.level}
              className={`profileLevelItem${isCurrent ? ' profileLevelItemActive' : ''}${isReached ? ' profileLevelItemReached' : ''}`}
            >
              <div className="profileLevelDot" />
              <div className="profileLevelInfo">
                <span className="profileLevelName">Ур. {lvl.level} — {lvl.label}</span>
                <span className="profileLevelXp">{lvl.xpNeeded} XP</span>
              </div>
              {isCurrent && <span className="profileLevelCurrent">← сейчас</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
