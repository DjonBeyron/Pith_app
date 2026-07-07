import { useState, useEffect } from 'react'
import { getCachedProfile, refreshProfile, subscribeProfile } from '../shared/api/profileCache.js'
import { useAuth } from '../shared/lib/useAuth.js'

const FOUR_H = 4 * 3600 * 1000
const CAP = 5

// Реальный счётчик: сервер начисляет каплю лениво (при старте урока),
// поэтому эффективное значение и время следующей +1 считаем от
// energy_updated_at прямо на клиенте
function calcEnergy(profile, now) {
  const base = Math.max(0, profile.energy ?? 0)
  const t = profile.energy_updated_at ? new Date(profile.energy_updated_at).getTime() : null
  if (base >= CAP || !t) return { value: base, nextAt: null }
  const ticks = Math.floor((now - t) / FOUR_H)
  const value = Math.min(CAP, base + ticks)
  return { value, nextAt: value >= CAP ? null : t + (ticks + 1) * FOUR_H }
}

function fmtLeft(ms) {
  if (ms <= 0) return 'уже доступна'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `через ${h}:${m}:${sec}` : `через ${m}:${sec}`
}

// Значок энергии в правом верхнем углу (везде, кроме профиля). Тап — мини-окно:
// что такое энергия и живой таймер до следующей +1; тап вне окна закрывает.
export default function EnergyBadge({ hidden }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState(getCachedProfile)
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const unsubscribe = subscribeProfile(setProfile)
    if (!getCachedProfile()) refreshProfile()
    return unsubscribe
  }, [])

  // Открыто — тикаем каждую секунду (таймер), закрыто — раз в полминуты (значок)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), open ? 1000 : 30000)
    return () => clearInterval(t)
  }, [open])

  if (hidden || !user || !profile) return null
  const unlimited = profile.has_subscription || profile.is_admin
  const { value, nextAt } = calcEnergy(profile, now)

  return (
    <div className="energyWrap">
      <button className="energyBadge" onClick={() => setOpen(o => !o)}>
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" /></svg>
        <span>{unlimited ? '∞' : value}</span>
      </button>

      {open && (
        <>
          <div className="energyPopBackdrop" onClick={() => setOpen(false)} />
          <div className="energyPop">
            <b>Энергия</b>
            <div>−1 — старт нового урока</div>
            <div>Бесплатно: диагностика, экзамен и повторение пройденного</div>
            <div>+1 каждые 4 часа, максимум {CAP}</div>
            <div className="energyPopNext">
              {unlimited
                ? 'У тебя безлимит'
                : nextAt
                  ? `Следующая +1 ${fmtLeft(nextAt - now)}`
                  : 'Энергия полная'}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
