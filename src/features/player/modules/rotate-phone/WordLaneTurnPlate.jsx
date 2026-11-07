import { useEffect, useRef, useState } from 'react'
import { Mic, Pointer } from 'lucide-react'
import { playPlate } from './wordLanePlateSound.js'
import { plateLite, startPlateExit } from './wordLanePlateExit.js'

// Плашка по центру экрана игры «Повтори за диктором»: «Теперь твоя очередь» и названия раундов («Раунд 1 · Повторяй»). Выходит так же, как окна приложения (pop-spring.css, popSheetWobble): вырастает из нуля
// от середины, чуть перелетает и встаёт (кривая cubic-bezier(0.34, 1.25, 0.64, 1)), — и со звуком: при монтировании играет короткий мягкий «блюп» (wordLanePlateSound.js, 130 мс). Стоит всё время стадии, потом
// директор её снимает, но плашку держит useWordLaneLeavingPlates.js ещё на время ухода: она получает leaving и улетает вверх, как взлетает пилюля (wordLanePlateExit.js — та же кривая). Плашку монтирует WordLaneGame
// с key = номер появления, поэтому на каждый шаг — новый экземпляр: звук и появление идут ровно один раз. На слабом устройстве (lite) и при reduced-motion колебаний, блеска и полёта нет — только проявление
// и затухание (word-lane-plate.css); звук остаётся. Узор и блеск от центра, центровка — word-lane-plate.css. text может быть «название\nзадание» (раунды гонки): вторая строка — мелким подзаголовком (.wlTurnTask).
// soft — «Гонка с Питом» (v3.3.117): плашка не улетает вверх, а мягко уходит scale 0,9 + opacity за 200 мс (CSS race-plate.css), появление — колебание popSheetWobble.
// look — вид плашки круга «Фраз» (raceStagesPhrases.ROUND_PLATES): tone ('lane' — цвет ленты, 'accent' — акцентный, data-tone, race-phrase-rounds.css) и icon ('tap' — палец, 'mic' — микрофон) перед подзадачей.
const ICONS = { tap: Pointer, mic: Mic }
export default function WordLaneTurnPlate({ text, leaving = false, soft = false, look = null }) {
  const [lite] = useState(plateLite) // lite — слабое устройство или reduced-motion: решается один раз при появлении
  const ref = useRef(null)
  useEffect(() => { playPlate() }, [])
  useEffect(() => { if (leaving && !lite && !soft) startPlateExit(ref.current) }, [leaving, lite, soft])
  const Icon = ICONS[look?.icon] ?? null
  const [title, task] = text.split('\n') // «название\nзадание»: задание (необязательное, «Гонка с Питом») — строкой под заголовком
  return (
    <div ref={ref} className={`wlTurn${lite ? ' wlTurn--lite' : ''}${leaving ? ' wlTurn--leave' : ''}`} data-tone={look?.tone} data-testid="wl-turn">
      {title}
      {task && <div className="wlTurnTask" data-testid="wl-turn-task">{Icon && <Icon className="wlTurnIcon" data-icon={look.icon} aria-hidden="true" data-testid="wl-turn-icon" />}{task}</div>}
    </div>
  )
}
