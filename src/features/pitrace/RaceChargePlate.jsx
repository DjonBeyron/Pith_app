import { useEffect } from 'react'
import { playPlate } from '../player/modules/rotate-phone/wordLanePlateSound.js'

// Плашка этапа на заставке (RaceCharge.jsx / RaceRoundCharge.jsx, CONCEPT_RACE.md «Плашка этапа»): название («Разгон») и под ним краткое задание в 3–5 слов (brief; нет — полное task). Минималистичная: рамка 1 px, описание мелким шрифтом.
// Морфа «бар → плашка» убран (v3.3.117): бар сам по себе, плашка сама по себе. Появляется колебанием popSheetWobble (pop-spring.css — как плашка в ленте рекомендаций), без полёта; уходит (out) мягким scale 0,9 + opacity за 200 мс. Лежит выше пилюль заставки
// и бара (z-index 4, race-charge.css): слова пролетают под плашкой. Тот же класс .wlTurn, что у плашек игры (узор, рамка, блеск). При появлении играет «блюп» плашек игры.
export default function RaceChargePlate({ title, task, brief = '', cap = '', out = false }) { // cap — подпись неозвученной стартовой фразы Пита (raceSilentLine.js)
  useEffect(() => { playPlate() }, [])
  const line = brief || task
  return (
    <div className="wlTurn raceChargePlate" data-out={out || undefined} data-testid="race-charge-plate">
      <span data-testid="race-charge-title">{title}</span>
      {line && <div className="wlTurnTask raceChargeBrief" data-testid="race-charge-task">{line}</div>}
      {cap && <div className="wlTurnCap" data-testid="race-charge-cap">{cap}</div>}
    </div>
  )
}
