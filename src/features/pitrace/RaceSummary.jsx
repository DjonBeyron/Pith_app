import { useEffect, useRef, useState } from 'react'
import { plateLite } from '../player/modules/rotate-phone/wordLanePlateExit.js'
import { startExit, exitMs } from '../rehearsal/rehearsalExit.js'
import { climbTitle } from './raceSim.js'
import RaceMetrics from './RaceMetrics.jsx'
import RaceAccuracyBar from './RaceAccuracyBar.jsx'
import { STAGES_ROUND } from './raceOnly.js'

// Итог гонки (CONCEPT_RACE.md, «Финиш») — плашка в стиле итога репетиции (RehearsalSummary.jsx: узор .wlTurn, блеск от центра, полёт при выходе rehearsalExit.js): разгон N/M, слух N/3, вершина — медаль, спуск ✓ / ✗, XP,
// над ними метрики (RaceMetrics.jsx, raceMetrics.js): точность по этапам, среднее время ответа, самое медленное слово, ловушки; под счётом «Самые слабые слова» — чипы слов обоих этапов от слабых к сильным (raceWeak.js, не больше 8), цвет по слабости, перевод мелко;
// в режиме «Пинг-понг + финал» (plan.round === 'stages') строк «Вершина» и «Спуск» нет; вопрос «Ещё заезд?» и кнопки «Ещё заезд» (следующий план, run + 1) и «Нет». result — итог raceSim.reportRace или null, пока не посчитан; onAgain — null, если следующего плана нет (один раунд, шлифовка).
// onShown — итог показан (один раз): карточка игры прогревает озвучку следующего плана. (Не путать с features/race/RaceSummary.jsx — итогом супер-урока недельной гонки: это другая функция.)
// Экран итога на всю сцену (v3.3.118): заголовок «Встряхни память: итог», счёт проходов, метрики двумя строками, список слов от слабых к сильным (строка: слово, перевод, пометка, цвет по слабости — стиль «Моей памяти»; у каждого слова — полоса точности RaceAccuracyBar.jsx, raceAccuracy.js), кнопки внизу.
const mark = d => (d === 'ok' ? '✓' : d === 'miss' ? '✗' : '—')

export default function RaceSummary({ plan, result, onAgain = null, onShown = null, onDone }) {
  const ref = useRef(null)
  const timer = useRef(0)
  const [lite] = useState(plateLite)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => { onShown?.() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(timer.current), [])
  const leave = () => { // «Нет» / «Готово»: окно улетает, игра опускается и растворяется, потом — завершение
    if (leaving) return
    setLeaving(true)
    startExit(ref.current, lite, true) // v3.3.117: окно итога уходит мягко (scale 0,9 + opacity), без полёта вверх
    timer.current = setTimeout(() => onDone?.(), exitMs(lite))
  }
  const r = result
  const twoStages = plan.round === STAGES_ROUND
  return (
    <div ref={ref} className={`wlTurn rhScreen raceFinal raceSum${r?.gold ? ' raceSum--gold' : ''}${lite ? ' wlTurn--lite' : ''}${leaving && lite ? ' wlTurn--leave' : ''}`} data-testid="race-summary" data-leaving={leaving || undefined}>
      <div className="raceFinalHead"><div className="wlRevealLabel" data-testid="race-summary-title">Встряхни память: итог{r?.gold ? ' · золото' : ''}</div>
      <div className="raceFinalPhrase" data-testid="race-summary-phrase">{plan.chunks.join(' ')}</div></div>
      <dl className="rhStats">
        <div className="raceFinalDup"><dt>Скажи слово</dt><dd data-testid="race-summary-sprint">{r ? `${r.sprint.hit}/${r.sprint.total}` : '…'}</dd></div>
        <div className="raceFinalDup"><dt>Назови перевод</dt><dd data-testid="race-summary-catch">{r ? `${r.catchOk}/${r.catchTotal}` : '…'}</dd></div>
        {!twoStages && <div><dt>Вершина</dt><dd data-testid="race-summary-climb" data-medal={r?.medal}>{r ? climbTitle(r) : '…'}</dd></div>}
        {!twoStages && <div><dt>Спуск</dt><dd data-testid="race-summary-descent">{r ? mark(r.descent) : '…'}</dd></div>}
        <div><dt>XP</dt><dd data-testid="race-summary-xp">{r ? `+${r.xp}${r.capped ? ' (потолок дня)' : ''}` : '…'}</dd></div>
      </dl>
      <RaceMetrics metrics={r?.metrics} />
      {r?.weak?.length > 0 && (
        <section className="raceWeak" data-testid="race-weak">
          <h3 className="raceWeakTitle">Слова: от слабых к сильным</h3>
          <ul className="raceWeakList">{r.weak.map(w => <li key={w.text} className="raceWeakChip" data-tone={w.tone} data-note={w.note} data-testid="race-weak-chip"><span className="raceWeakText"><span className="raceWeakWord">{w.text}</span>{w.translation && <span className="raceWeakCap">{w.translation}</span>}</span><span className="raceWeakNote" data-testid="race-weak-note">{w.note}</span><RaceAccuracyBar acc={w.acc} /></li>)}</ul>
        </section>
      )}
      <div className="rhBtns rhBtns--row raceFinalBtns">
        {onAgain && <button type="button" className="wlNext" onClick={onAgain} disabled={leaving} data-testid="race-again">Ещё раз</button>}
        <button type="button" className={onAgain ? 'wlNext rhGhost' : 'wlNext'} onClick={leave} disabled={leaving} data-testid="race-done">{onAgain ? 'Нет' : 'Готово'}</button>
      </div>
    </div>
  )
}
