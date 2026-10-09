import { useState, useRef, useEffect, useCallback } from 'react'

// «Поп» иконки худа при нажатии: возвращает [идёт ли анимация, запустить].
// Класс feedHudBtnPop (feed-hud.css) висит только на время анимации — will-change не держим постоянно.
export function useTapPop(ms = 300) {
  const [popping, setPopping] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  const pop = useCallback(() => {
    setPopping(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setPopping(false), ms)
  }, [ms])
  return [popping, pop]
}
