import { useEffect, useState } from 'react'
import { LEVELS, getCurrentLevel, getNextLevel } from '../../shared/lib/xpLevels.js'
import { getLocalXp } from '../../shared/lib/localProfile.js'
import { getProfile } from '../../shared/api/profileApi.js'

export default function ProfileTab() {
  const [xp,      setXp]      = useState(getLocalXp())
  const [name,    setName]    = useState('Пользователь')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getProfile().then(profile => {
      if (profile) {
        setXp(profile.xp)
      } else {
        setXp(getLocalXp())
      }
      setLoading(false)
    })
  }, [])

  const current         = getCurrentLevel(xp)
  const next            = getNextLevel(xp)
  const xpInLevel       = xp - current.xpNeeded
  const xpNeededForNext = next ? next.xpNeeded - current.xpNeeded : 100
  const pct = next ? Math.min(Math.round((xpInLevel / xpNeededForNext) * 100), 100) : 100

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
          {next && <span className="profileLevelNext">→ {next.label} (Ур. {next.level})</span>}
        </div>

        <div className="profileProgressWrap">
          <div className="profileProgressBar">
            <div className="profileProgressFill" style={{ width: loading ? '0%' : `${pct}%` }} />
          </div>
          <div className="profileProgressMeta">
            <span>{xp} XP</span>
            {next && <span>{next.xpNeeded} XP</span>}
          </div>
        </div>

        <div className="profileXpHint">
          {loading ? 'Загрузка...' : next
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
          <div className="profileStatValue">—</div>
          <div className="profileStatLabel">Дней подряд</div>
        </div>
        <div className="profileStatCard">
          <div className="profileStatValue">—</div>
          <div className="profileStatLabel">Уроков пройдено</div>
        </div>
      </div>

      <div className="profileLevelMap">
        <div className="profileLevelMapTitle">Все уровни</div>
        {LEVELS.map(lvl => {
          const isReached = xp >= lvl.xpNeeded
          const isCurrent = current.level === lvl.level
          return (
            <div key={lvl.level}
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
