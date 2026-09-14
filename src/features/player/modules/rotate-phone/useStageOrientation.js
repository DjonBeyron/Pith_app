import { useState, useEffect } from 'react'
import { motionAllowed } from '../../../../shared/lib/motionPermission.js'

// Как рисовать сцену тренажёра — два режима (решение в PROJECT.md):
//   screen — экран реально альбомный (matchMedia): рисуем как есть;
//   tilted — замок поворота: вьюпорт остался портретным, а телефон лежит
//            боком — сцену поворачиваем на ±90°, знак по gamma датчика.
// Следим и во время игры: снял замок посреди тренажёра — переключаемся на
// лету, сцена не перезапускается (позиции слов считаются от времени).
//
// Знак: gamma > 0 (спека: «наклон вправо») — правый край телефона ушёл
// вниз, значит «вверх» для ученика — это ЛЕВАЯ сторона портретного экрана,
// и сцену крутим против часовой (−90°: её верх ложится влево). Проверить на
// живом устройстве — если картинка вверх ногами, поменять знак здесь.
export function useStageOrientation(rotation) {
  const [screenLandscape, setScreenLandscape] = useState(
    () => window.matchMedia('(orientation: landscape)').matches,
  )
  const [sign, setSign] = useState(() => (rotation?.gamma > 0 ? -1 : 1))

  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)')
    const onChange = () => setScreenLandscape(mq.matches)
    mq.addEventListener?.('change', onChange)
    mq.addListener?.(onChange)
    return () => { mq.removeEventListener?.('change', onChange); mq.removeListener?.(onChange) }
  }, [])

  // Перевернул телефон другим боком — сцена следует; порог широкий, чтобы
  // не дёргалась от дрожи руки около нуля
  useEffect(() => {
    if (!motionAllowed()) return
    const onTilt = e => {
      if (e.gamma == null || Math.abs(e.gamma) < 35) return
      setSign(e.gamma > 0 ? -1 : 1)
    }
    window.addEventListener('deviceorientation', onTilt)
    return () => window.removeEventListener('deviceorientation', onTilt)
  }, [])

  // На десктопе поворота не было — окно и так альбомное, рисуем как есть
  const tilted = !screenLandscape && rotation?.source === 'tilt'
  return { mode: tilted ? 'tilted' : 'screen', sign }
}
