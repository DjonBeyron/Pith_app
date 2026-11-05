import { useEffect, useRef, useState } from 'react'
import { plateLite } from '../player/modules/rotate-phone/wordLanePlateExit.js'
import { startExit, exitMs } from '../rehearsal/rehearsalExit.js'
import { climbTitle } from './raceSim.js'
import RaceMetrics from './RaceMetrics.jsx'
import { STAGES_ROUND } from './raceOnly.js'

// Итог гонки (CONCEPT_RACE.md, «Финиш») — плашка в стиле итога репетиции (RehearsalSummary.jsx: узор .wlTurn, блеск от центра, полёт при выходе rehearsalExit.js): разгон N/M, слух N/3, вершина — медаль, спуск ✓ / ✗, XP,
// над ними метрики (RaceMetrics.jsx, raceMetrics.js): точность по этапам, среднее время ответа, самое медленное слово, ловушки; под счётом «Самые слабые слова» — чипы слов обоих этапов от слабых к сильным (raceWeak.js, не больше 8), цвет по слабости, перевод мелко;
// в режиме «два этапа + финал» (plan.round === 'stages') строк «Вершина» и «Спуск» нет; вопрос «Ещё заезд?» и кнопки «Ещё заезд» (следующий план, run + 1) и «Нет». result — итог raceSim.reportRace или null, пока не посчитан; onAgain — null, если следующего плана нет (один раунд, шлифовка).
// onShown — итог показан (один раз): карточка игры прогревает озвучку следующего плана. (Не путать с features/race/RaceSummary.jsx — итогом супер-урока недельной гонки: это другая функция.)
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
    startExit(ref.current, lite)
    timer.current = setTimeout(() => onDone?.(), exitMs(lite))
  }
  const r = result
  const twoStages = plan.round === STAGES_ROUND
  return (
    <div ref={ref} className={`wlTurn rhScreen rhSumPlate raceSum${r?.gold ? ' raceSum--gold' : ''}${lite ? ' wlTurn--lite' : ''}${leaving && lite ? ' wlTurn--leave' : ''}`} data-testid="race-summary" data-leaving={leaving || undefined}>
      <div className="wlRevealLabel">{r?.gold ? 'Золото' : 'Финиш'}</div>
      <div className="wlRevealPhrase" data-testid="race-summary-phrase">{plan.chunks.join(' ')}</div>
      <dl className="rhStats">
        <div><dt>Разгон</dt><dd data-testid="race-summary-sprint">{r ? `${r.sprint.hit}/${r.sprint.total}` : '…'}</dd></div>
        <div><dt>Слух</dt><dd data-testid="race-summary-catch">{r ? `${r.catchOk}/${r.catchTotal}` : '…'}</dd></div>
        {!twoStages && <div><dt>Вершина</dt><dd data-testid="race-summary-climb" data-medal={r?.medal}>{r ? climbTitle(r) : '…'}</dd></div>}
        {!twoStages && <div><dt>Спуск</dt><dd data-testid="race-summary-descent">{r ? mark(r.descent) : '…'}</dd></div>}
        <div><dt>XP</dt><dd data-testid="race-summary-xp">{r ? `+${r.xp}${r.capped ? ' (потолок дня)' : ''}` : '…'}</dd></div>
      </dl>
      <RaceMetrics metrics={r?.metrics} />
      {r?.weak?.length > 0 && (
        <section className="raceWeak" data-testid="race-weak">
          <h3 className="raceWeakTitle">Самые слабые слова</h3>
          <ul className="raceWeakList">{r.weak.map(w => <li key={w.text} className="raceWeakChip" data-tone={w.tone} data-testid="race-weak-chip"><span className="raceWeakWord">{w.text}</span>{w.translation && <span className="raceWeakCap">{w.translation}</span>}</li>)}</ul>
        </section>
      )}
      {onAgain && <div className="rhSumAsk" data-testid="race-summary-ask">Ещё заезд?</div>}
      <div className="rhBtns rhBtns--row">
        {onAgain && <button type="button" className="wlNext" onClick={onAgain} disabled={leaving} data-testid="race-again">Ещё заезд</button>}
        <button type="button" className={onAgain ? 'wlNext rhGhost' : 'wlNext'} onClick={leave} disabled={leaving} data-testid="race-done">{onAgain ? 'Нет' : 'Готово'}</button>
      </div>
    </div>
  )
}
