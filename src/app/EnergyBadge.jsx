import { useState, useEffect, useRef } from 'react'
import { getCachedProfile, refreshProfile, subscribeProfile } from '../shared/api/profileCache.js'
import { useAuth } from '../shared/lib/useAuth.js'
import { calcEnergy, ENERGY_CAP, ENERGY_TICK_MS } from '../shared/lib/energyCalc.js'
import { energyColor } from '../shared/lib/energyColors.js'
import EnergyCells from '../shared/ui/EnergyCells.jsx'
import { isHudPopupOpen, toggleHudPopup, subscribeHudPopup, useHudOutsideDismiss } from './hudPopupState.js'

function fmtLeft(ms) {
  if (ms <= 0) return 'уже доступна'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `через ${h}:${m}:${sec}` : `через ${m}:${sec}`
}

// Значок энергии в верхней панели (hudBar в ShellV2; видимостью управляет
// оболочка). Тап — мини-окно: ряд ячеек энергии (следующая — прогресс-бар
// до пополнения) + живой таймер; описание механики спрятано за кнопкой «?».
// Тап вне окна закрывает.
export default function EnergyBadge() {
  const { user } = useAuth()
  const [profile, setProfile] = useState(getCachedProfile)
  // Открытое окошко общее на все три бейджа hudBar — клик по другому
  // закрывает это, а не открывает поверх (см. hudPopupState.js)
  const [open, setOpen] = useState(() => isHudPopupOpen('energy'))
  const [now, setNow] = useState(Date.now)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeProfile(setProfile)
    if (!getCachedProfile()) refreshProfile()
    return unsubscribe
  }, [])

  useEffect(() => subscribeHudPopup(id => {
    const isOpen = id === 'energy'
    setOpen(isOpen)
    // Окно закрыли (в т.ч. открыли другой бейдж) — в следующий раз открывается снова свёрнутым
    if (!isOpen) setShowHelp(false)
  }), [])

  // Открыто — тикаем каждую секунду (таймер), закрыто — раз в полминуты (значок)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), open ? 1000 : 30000)
    return () => clearInterval(t)
  }, [open])

  const wrapRef = useRef(null)
  useHudOutsideDismiss(wrapRef, open)

  if (!user || !profile) return null
  const unlimited = profile.has_subscription || profile.is_admin
  const { value, nextAt } = calcEnergy(profile, now)
  const color = unlimited ? null : energyColor(value)
  const fillProgress = !unlimited && nextAt ? 1 - (nextAt - now) / ENERGY_TICK_MS : 0

  return (
    <div className="energyWrap" ref={wrapRef}>
      <button className="energyBadge" onClick={() => toggleHudPopup('energy')}>
        <svg viewBox="0 0 24 24" fill="currentColor" style={color ? { color } : undefined}>
          <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
        </svg>
        <span style={color ? { color } : undefined}>{unlimited ? '∞' : value}</span>
      </button>

      {open && (
        <>
          {/* Закрытие — только тапом ВНЕ окна (useHudOutsideDismiss глушит
              этот тап, чтобы он не долетел до видео ленты), само окно
              кликабельно безопасно */}
          <div className="energyPop">
            <div className="energyPopHead">
              <EnergyCells
                value={unlimited ? ENERGY_CAP : value}
                unlimited={unlimited}
                fillingNext={!unlimited && value < ENERGY_CAP}
                fillProgress={fillProgress}
              />
              <button className="energyPopHelpBtn" onClick={() => setShowHelp(s => !s)}>?</button>
            </div>

            <div className="energyPopNext">
              {unlimited
                ? 'У тебя безлимит'
                : nextAt
                  ? `Следующая +1 ${fmtLeft(nextAt - now)}`
                  : 'Энергия полная'}
            </div>

            {showHelp && (
              <div className="energyPopHelpBlock">
                <div>⚡ 1 новый урок = 1 энергия</div>
                <div>🔄 Повторять пройденное — бесплатно</div>
                <div>⏱ +1 каждые 4 часа (максимум {ENERGY_CAP})</div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
