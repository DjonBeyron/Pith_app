import { useState, useEffect } from 'react'
import RewardsPopup from './RewardsPopup.jsx'
import { subscribeLessonCompleted } from './streakPopupBus.js'
import { getCachedProfile } from '../../shared/api/profileCache.js'

const SHOWN_KEY = 'pithy_streak_popup_shown_v1'

function today() {
  return new Date().toISOString().slice(0, 10)
}

// Раз в день, после первого пройденного урока за этот день — показываем
// окно наград поверх любой вкладки. Сигнал шлёт LessonPlayer.finishSummary
// через streakPopupBus (компонент живёт в другом дереве — см. ShellV2).
export default function StreakRewardsGlobalPopup({ onWantPro }) {
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    return subscribeLessonCompleted(() => {
      if (localStorage.getItem(SHOWN_KEY) === today()) return
      const p = getCachedProfile()
      if (!p || (p.current_streak ?? 0) < 1) return
      localStorage.setItem(SHOWN_KEY, today())
      setProfile(p)
    })
  }, [])

  if (!profile) return null
  return (
    <RewardsPopup
      profile={profile}
      onClose={() => setProfile(null)}
      onWantPro={() => { setProfile(null); onWantPro?.() }}
    />
  )
}
