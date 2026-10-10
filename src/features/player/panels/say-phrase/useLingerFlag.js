import { useState, useEffect } from 'react'

// Флаг «включён, и ещё ms мс после выключения»: пока on — true; когда on стал false, остаётся true ещё ms мс и гаснет. Нужен, чтобы CSS-слой с бесконечной анимацией (циклические волны,
// say-phrase-waves.css) не обрывался в момент конца записи, а плавно гас по opacity. Смена в рендере (паттерн из доков React), setState в таймере; таймер чистится при размонтировании и новом on.
export function useLingerFlag(on, ms) {
  const [prev, setPrev] = useState(on)
  const [tail, setTail] = useState(false)
  if (on !== prev) { setPrev(on); setTail(!on) }
  useEffect(() => {
    if (!tail) return undefined
    const t = setTimeout(() => setTail(false), ms)
    return () => clearTimeout(t)
  }, [tail, ms])
  return on || tail
}
