import { useState, useEffect, useRef } from 'react'
import { Gem, GraduationCap } from 'lucide-react'
import { getCachedProfile, refreshProfile, subscribeProfile } from '../shared/api/profileCache.js'
import { useAuth } from '../shared/lib/useAuth.js'
import { isHudPopupOpen, toggleHudPopup, subscribeHudPopup, useHudOutsideDismiss } from './hudPopupState.js'
import TicketIcon from '../shared/ui/TicketIcon.jsx'

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

  const wrapRef = useRef(null)
  useHudOutsideDismiss(wrapRef, open)

  if (!user || !profile) return null
  const count = Math.max(0, profile.tickets ?? 0)

  return (
    <div className="ticketWrap" ref={wrapRef}>
      <button className="ticketBadge" onClick={() => toggleHudPopup('ticket')}>
        <TicketIcon />
        <span>{count}</span>
      </button>

      {open && (
        <>
          <div className="energyPop ticketPop">
            <b>Золотой билет</b>
            <div className="energyPopHelpRow"><TicketIcon style={{ width: 13, height: 13 }} /> Доступ к супергонке = 1 билет (списывается при открытии)</div>
            <div className="energyPopHelpRow"><GraduationCap size={13} /> Получить: пройди Финал модуля, раскрыв не больше 3 переводов</div>
            <div className="energyPopHelpRow"><Gem size={13} /> С одного модуля билет дают только один раз</div>
            <div className="energyPopNext">У тебя: {count}</div>
          </div>
        </>
      )}
    </div>
  )
}
