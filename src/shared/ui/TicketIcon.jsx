import { TICKET_PATH } from './icons.js'

// Единый значок золотого билета — эталон в TicketBadge.jsx (HUD ленты).
// Заливка всегда золотая (не currentColor): раньше в разных карточках
// билет попадал в разноцветный текст (зелёный/серый/белый), из-за чего
// сам билет выглядел то золотым, то нет — размер задаётся снаружи через
// className (обычные компоненты со своим CSS) или style (редкие места вроде
// ExamIntroDialog, которые вообще без CSS-классов, только инлайн-стили)
export default function TicketIcon({ className, style }) {
  return (
    <svg viewBox="0 0 24 24" fill="#ffd257" className={className} style={style} aria-hidden="true">
      <path d={TICKET_PATH} />
    </svg>
  )
}
