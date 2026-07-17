import { useState, useEffect, useRef } from 'react'
import RewardsPopup from './RewardsPopup.jsx'
import ProPaywall from '../pro/ProPaywall.jsx'
import { getCachedProfile, subscribeProfile } from '../../shared/api/profileCache.js'

const SHOWN_KEY = 'pithy_streak_toast_shown_v1'
const APPEAR_DELAY_MS = 1600 // даём доиграть анимациям графа (reveal/озеленение)
const HIDE_PLAIN_MS = 4000  // без кнопки — исчезает сама
const HIDE_CLAIM_MS = 8000  // с кнопкой «Забрать» — висит дольше

function today() {
  return new Date().toISOString().slice(0, 10)
}

// Плашка «🔥 Серия X дней» в схеме уроков: раз в день, при первом заходе
// в схему; waiting=true — идёт анимация графа (прилёт XP / легенда), плашка
// ждёт её окончания. Если есть незабранные награды — кнопка «Забрать»
// открывает существующее окно «Ежедневные награды» (RewardsPopup), его «←»
// возвращает обратно в схему. Заменила авто-открытие полноэкранного окна
// после урока (бывший StreakRewardsGlobalPopup).
export default function StreakDailyToast({ waiting = false }) {
  const [visible, setVisible] = useState(false)
  const [rewardsOpen, setRewardsOpen] = useState(false)
  const [wantPro, setWantPro] = useState(false)
  const [profile, setProfile] = useState(() => getCachedProfile())
  const hideTimerRef = useRef(null)

  useEffect(() => subscribeProfile(setProfile), [])

  const streak    = profile?.current_streak ?? 0
  const claimable = (profile?.last_claimed_streak_day ?? 0) + 1 <= streak

  useEffect(() => {
    if (waiting || visible || rewardsOpen) return
    if (localStorage.getItem(SHOWN_KEY) === today()) return
    if (!profile || streak < 1) return
    const t = setTimeout(() => {
      localStorage.setItem(SHOWN_KEY, today())
      setVisible(true)
      hideTimerRef.current = setTimeout(
        () => setVisible(false),
        claimable ? HIDE_CLAIM_MS : HIDE_PLAIN_MS
      )
    }, APPEAR_DELAY_MS)
    return () => clearTimeout(t)
  }, [waiting, profile]) // eslint-disable-line react-hooks/exhaustive-deps

  function openRewards() {
    clearTimeout(hideTimerRef.current)
    setVisible(false)
    setRewardsOpen(true)
  }

  function dismiss() {
    clearTimeout(hideTimerRef.current)
    setVisible(false)
  }

  return (
    <>
      {visible && (
        <div className="streakToast" onClick={claimable ? openRewards : dismiss}>
          <span className="streakToastIcon">🔥</span>
          <span className="streakToastBody">
            <span className="streakToastTitle">
              Серия {streak} {streak === 1 ? 'день' : streak < 5 ? 'дня' : 'дней'}
            </span>
            {claimable && <span className="streakToastSub">Есть награда за сегодня</span>}
          </span>
          {claimable && (
            <button className="streakToastBtn" onClick={e => { e.stopPropagation(); openRewards() }}>
              Забрать
            </button>
          )}
          <button className="streakToastClose" onClick={e => { e.stopPropagation(); dismiss() }}>✕</button>
        </div>
      )}
      {rewardsOpen && profile && (
        <RewardsPopup
          profile={profile}
          onClose={() => setRewardsOpen(false)}
          onWantPro={() => { setRewardsOpen(false); setWantPro(true) }}
        />
      )}
      {wantPro && <ProPaywall onClose={() => setWantPro(false)} />}
    </>
  )
}
