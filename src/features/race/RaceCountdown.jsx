import { useState, useEffect } from 'react'

function fmt(ms) {
  if (ms <= 0) return '0:00:00'
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const hms = `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return d > 0 ? `${d} д ${hms}` : hms
}

// Тикающий таймер до даты (старт/конец гонки). onZero — когда время вышло.
export default function RaceCountdown({ to, onZero }) {
  const target = new Date(to).getTime()
  // Ленивый инициализатор: Date.now один раз при маунте, не в каждом рендере
  const [left, setLeft] = useState(() => target - Date.now())

  useEffect(() => {
    const t = setInterval(() => {
      const ms = target - Date.now()
      setLeft(ms)
      if (ms <= 0) { clearInterval(t); onZero?.() }
    }, 1000)
    return () => clearInterval(t)
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

  return <span className="raceTimer">{fmt(left)}</span>
}
