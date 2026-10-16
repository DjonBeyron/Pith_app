import { startTransition, useEffect, useState } from 'react'

// «Включить после первого кадра»: on=true доходит до потребителя через requestAnimationFrame + startTransition (запасной
// setTimeout на случай, когда rAF стоит — фоновая вкладка), on=false — сразу. Нужен слайду-сцене: запуск режиссёра на активации
// слайда — самое тяжёлое место свайпа (на 4–6× CPU до +175 мс одной задачей), и он не должен идти раньше, чем отрисованы HUD и
// панель действий нового слайда (они рендерятся в FeedSlide независимо от сцены и уже на экране).
export function useAfterPaint(on) {
  const [ready, setReady] = useState(!!on) // слайд смонтирован уже активным (первый кадр ленты) — без отсрочки
  useEffect(() => {
    if (!on) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReady(false)
      return undefined
    }
    let done = false
    const go = () => { if (!done) { done = true; startTransition(() => setReady(true)) } }
    const raf = requestAnimationFrame(() => { clearTimeout(t); go() })
    const t = setTimeout(go, 120)
    return () => { done = true; cancelAnimationFrame(raf); clearTimeout(t) }
  }, [on])
  return on && ready
}
