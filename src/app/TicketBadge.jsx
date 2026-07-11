import { useState, useEffect } from 'react'
import { getCachedProfile, refreshProfile, subscribeProfile } from '../shared/api/profileCache.js'
import { useAuth } from '../shared/lib/useAuth.js'
import { isHudPopupOpen, toggleHudPopup, closeHudPopup, subscribeHudPopup } from './hudPopupState.js'

// Значок золотых билетов в верхней панели (рядом с энергией). Тап — мини-окно:
// что такое билет, как заработать и на что тратится.
export default function TicketBadge() {
  const { user } = useAuth()
  const [profile, setProfile] = useState(getCachedProfile)
  const [open, setOpen] = useState(() => isHudPopupOpen('ticket'))

  useEffect(() => {
    const unsubscribe = subscribeProfile(setProfile)
    if (!getCachedProfile()) refreshProfile()
    return unsubscribe
  }, [])

  useEffect(() => subscribeHudPopup(id => setOpen(id === 'ticket')), [])

  if (!user || !profile) return null
  const count = Math.max(0, profile.tickets ?? 0)

  return (
    <div className="ticketWrap">
      <button className="ticketBadge" onClick={() => toggleHudPopup('ticket')}>
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 6a2 2 0 0 0-2 2v2.5a1.5 1.5 0 0 1 0 3V16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2.5a1.5 1.5 0 0 1 0-3V8a2 2 0 0 0-2-2H4zm10 2v1.5h-1.5V8H14zm0 3v2h-1.5v-2H14zm0 3.5V16h-1.5v-1.5H14z" />
        </svg>
        <span>{count}</span>
      </button>

      {open && (
        <>
          <div className="energyPopBackdrop" onClick={closeHudPopup} />
          <div className="energyPop ticketPop" onClick={closeHudPopup}>
            <b>Золотой билет</b>
            <div>🎟 Доступ к супергонке = 1 билет (списывается при открытии)</div>
            <div>🎓 Получить: пройди Финал модуля, раскрыв не больше 3 переводов</div>
            <div>💎 С одного модуля билет дают только один раз</div>
            <div className="energyPopNext">У тебя: {count}</div>
          </div>
        </>
      )}
    </div>
  )
}
