import { useState, useEffect } from 'react'
import ProPaywall from '../pro/ProPaywall.jsx'

function fmtLeft(ms) {
  if (ms <= 0) return 'уже доступна'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `через ${h}:${mm}:${ss}` : `через ${mm}:${ss}`
}

// Экран «Энергия закончилась» (по макету energy.html): таймер до следующей
// единицы, кнопка подписки Pro (открывает ProPaywall), напоминание о
// бесплатных повторах. Показывается поверх схемы модуля при отказе start_lesson.
export default function EnergyPaywall({ nextAt, onClose }) {
  const [left, setLeft] = useState(() => new Date(nextAt) - Date.now())
  const [showPro, setShowPro] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setLeft(new Date(nextAt) - Date.now()), 1000)
    return () => clearInterval(t)
  }, [nextAt])

  return (
    <div className="epOverlay" onClick={onClose}>
      <div className="epCard" onClick={e => e.stopPropagation()}>
        <div className="epBoltRing">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" /></svg>
        </div>
        <h1>Энергия закончилась</h1>
        <div className="epSub">Новый урок можно начать, когда<br />восстановится энергия</div>
        <div className="epTimer">+1 энергия {fmtLeft(left)}</div>
        <button className="epBtnPrimary" onClick={() => setShowPro(true)}>
          Подписка Pro — безлимит энергии
        </button>
        <button className="epBtnGhost" onClick={onClose}>
          Повторять пройденное — бесплатно
        </button>
        <button className="epFree" onClick={onClose}>Вернуться</button>
      </div>

      {showPro && (
        <ProPaywall heading="Энергия закончилась?" onClose={() => setShowPro(false)} />
      )}
    </div>
  )
}
