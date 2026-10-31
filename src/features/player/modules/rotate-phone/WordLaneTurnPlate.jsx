import { useEffect, useMemo } from 'react'
import { isWeakDevice } from '../../../../shared/lib/deviceTier.js'
import { playPlate } from './wordLanePlateSound.js'

// Плашка по центру экрана игры «Повтори за диктором»: «Теперь твоя очередь» и названия раундов («Раунд 1 · Повторяй»). Выходит так же, как окна приложения (pop-spring.css, popSheetWobble): вырастает из нуля
// от середины, чуть перелетает и встаёт (кривая cubic-bezier(0.34, 1.25, 0.64, 1)), — и со звуком: при монтировании играет короткий мягкий «блюп» (wordLanePlateSound.js, 130 мс). Уходит мягко (затухание в конце — в CSS,
// word-lane-plate.css; длина показа — переменная --wl-turn-ms из стадии сценария). Плашку монтирует WordLaneGame с key = номер шага сценария, поэтому на каждый шаг — новый экземпляр: звук и анимация идут ровно один раз.
// На слабом устройстве (lite) и при reduced-motion колебания и блеска нет — только проявление; звук остаётся. Узор и блеск от центра, центровка — word-lane-plate.css.
export default function WordLaneTurnPlate({ text, ms }) {
  const lite = useMemo(() => isWeakDevice(), [])
  useEffect(() => { playPlate() }, [])
  return <div className={`wlTurn${lite ? ' wlTurn--lite' : ''}`} style={{ '--wl-turn-ms': `${ms}ms` }} data-testid="wl-turn">{text}</div>
}
