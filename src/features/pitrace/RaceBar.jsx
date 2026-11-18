import { useState } from 'react'
import { barOf, barLeft, BAR_ACTS } from './raceBar.js'

// Постоянный тонкий бар сверху «Гонки с Питом» (CONCEPT_RACE.md, «Бар живёт весь разгон»; модель — raceBar.js, стили — race-bar.css). Зарядка (слова летят в бар) — заставка RaceChargeRun.jsx; когда она кончилась и пошли пилюли, бар остаётся
// на том же месте (6 px, между «назад» и «пауза») и РАСХОДУЕТСЯ: с каждой сыгранной пилюлей СПРАВА НАЛЕВО исчезает по сегменту (v3.3.117; первым гаснет самый правый) (цвет сегмента — ступень слова). Слова кончились — бар пуст. Бар прячется (плавно), когда идёт не ступень ученика
// «Разгона» / «Слушай и лови» (плашка, заставка, другие этапы), и держит последние сегменты на время исчезновения. Только transform / opacity, один узел на сегмент (до 14), без filter. На паузе (stage = ступень, f.stage 'paused') бар остаётся на месте.
export default function RaceBar({ stage, race, mia = null }) {
  const bar = barOf({ stage, race, mia })
  const [kept, setKept] = useState(bar)
  if (bar && (kept?.key !== bar.key || kept.spent !== bar.spent || kept.segs.length !== bar.segs.length)) setKept(bar) // последнее показанное состояние: на время плавного ухода бара сегменты не пропадают
  const shown = bar ?? kept
  const hold = !bar && !!kept && stage?.type === 'announce' && BAR_ACTS.includes(stage.act) // между кругами и этапами «Разгона» / «Слушай и лови» пустой бар остаётся на месте (потом заряжается снова); исчезает только на этапах, где он не нужен (владелец 2026-11-16)
  return (
    <div className="raceBar" data-on={bar || hold ? '' : undefined} data-empty={(bar && barLeft(bar) === 0) || hold ? '' : undefined} aria-hidden="true" data-testid="race-bar">
      <div className="raceBarTrack">
        {shown?.segs.map(s => <i key={`${shown.key}:${s.i}`} className="raceBarSeg" data-spent={s.i >= shown.segs.length - shown.spent ? '' : undefined} style={{ left: `${s.from}%`, width: `${s.to - s.from}%`, backgroundColor: s.color }} data-testid="race-bar-seg" />)}
      </div>
    </div>
  )
}
