import { useEffect, useRef, useState } from 'react'
import { playPlate } from './wordLanePlateSound.js'
import { plateLite, startPlateExit } from './wordLanePlateExit.js'

// Плашка по центру экрана игры «Повтори за диктором»: «Теперь твоя очередь» и названия раундов («Раунд 1 · Повторяй»). Выходит так же, как окна приложения (pop-spring.css, popSheetWobble): вырастает из нуля
// от середины, чуть перелетает и встаёт (кривая cubic-bezier(0.34, 1.25, 0.64, 1)), — и со звуком: при монтировании играет короткий мягкий «блюп» (wordLanePlateSound.js, 130 мс). Стоит всё время стадии, потом
// директор её снимает, но плашку держит useWordLaneLeavingPlates.js ещё на время ухода: она получает leaving и улетает вверх, как взлетает пилюля (wordLanePlateExit.js — та же кривая). Плашку монтирует WordLaneGame
// с key = номер появления, поэтому на каждый шаг — новый экземпляр: звук и появление идут ровно один раз. На слабом устройстве (lite) и при reduced-motion колебаний, блеска и полёта нет — только проявление
// и затухание (word-lane-plate.css); звук остаётся. Узор и блеск от центра, центровка — word-lane-plate.css.
export default function WordLaneTurnPlate({ text, leaving = false }) {
  const [lite] = useState(plateLite) // lite — слабое устройство или reduced-motion: решается один раз при появлении
  const ref = useRef(null)
  useEffect(() => { playPlate() }, [])
  useEffect(() => { if (leaving && !lite) startPlateExit(ref.current) }, [leaving, lite])
  return <div ref={ref} className={`wlTurn${lite ? ' wlTurn--lite' : ''}${leaving ? ' wlTurn--leave' : ''}`} data-testid="wl-turn">{text}</div>
}
