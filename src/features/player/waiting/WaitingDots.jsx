import { useEffect, useState } from 'react'

// Индикатор «учитель печатает» — рисуется на время фиксированной паузы
// TYPING_DELAY_MS перед следующим сообщением (см. useGraphPlayer.js,
// scheduleReveal). Раньше вид зависел от типа следующего сообщения
// (точки/волна/красная точка записи) — по просьбе оставили один вид (точки)
// для любого типа: три разных значка путали больше, чем объясняли.
// Строка .playerWaitingRow лежит ВНЕ потока ленты (position:absolute, см.
// styles/player/feed.css) — её появление и исчезновение не двигают переписку.
// Место под неё лента держит за собой постоянно (--wait-slot в layout.css).
//
// Появление/исчезновение — через scale (пузырь мягко «надувается»/«сдувается»),
// а не мгновенный unmount: скрытие откладывается на EXIT_MS, чтобы доиграла
// обратная CSS-анимация (playerWaitingRowOut, см. feed.css) — то же число
// зашито в её длительность, держи оба места синхронно.
const EXIT_MS = 150

export default function WaitingDots({ visible }) {
  // 'shown' | 'closing' | 'hidden'. visible пришёл другим, чем в прошлый
  // рендер — подстраиваем состояние прямо тут (паттерн из доков React,
  // как в PlayerTopBar.jsx), а не через setState в эффекте
  const [state, setState] = useState(() => (visible ? 'shown' : 'hidden'))
  const [prevVisible, setPrevVisible] = useState(visible)
  if (visible !== prevVisible) {
    setPrevVisible(visible)
    if (visible) setState('shown')
    else if (state !== 'hidden') setState('closing')
  }

  // 'closing' — реальный внешний таймер: ждём конца обратной CSS-анимации
  // (playerWaitingRowOut, см. feed.css), потом уже размонтируем
  useEffect(() => {
    if (state !== 'closing') return
    const id = setTimeout(() => setState('hidden'), EXIT_MS)
    return () => clearTimeout(id)
  }, [state])

  if (state === 'hidden') return null

  return (
    <div className={state === 'closing' ? 'playerWaitingRow playerWaitingRowOut' : 'playerWaitingRow'}>
      <div className="playerWaitingBubble">
        <span className="playerWaitingDots"><i /><i /><i /></span>
      </div>
    </div>
  )
}
