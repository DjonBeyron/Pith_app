import { useEffect, useRef } from 'react'

const ANIM_MS = 1100

// Число серии, которое «докручивается» до своего значения, как стрелка
// спидометра: быстрый разгон и мягкое торможение в конце. Считаем в rAF и
// пишем прямо в DOM (как XpTransfer.jsx) — React на каждый кадр не дёргаем.
//
// Крутим от нуля, а не от прошлого значения: за ночь серия не менялась (её
// растит урок, а не заход), поэтому анимировать нечего — это чистая подача
// самого числа, под залп конфетти.
//
// run=false — окно ещё под стартовым сплэшем: держим ноль и ждём. Иначе
// анимация отыграет за логотипом, и пользователь увидит уже готовое число.
export default function StreakCountUp({ value = 0, className = '', delayMs = 0, run = true }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!run) { el.textContent = '0'; return }
    const calm = typeof matchMedia === 'function'
      && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (calm || value <= 1) { el.textContent = value; return }

    el.textContent = '0'
    let raf = 0
    let start = 0
    const tick = now => {
      if (!start) start = now
      const t = Math.min(Math.max(now - start - delayMs, 0) / ANIM_MS, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      el.textContent = Math.round(value * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, delayMs, run])

  return <div className={className} ref={ref}>{run ? value : 0}</div>
}
