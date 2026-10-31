// Итог репетиции (акт 6) — окно «хочешь ещё» в стиле плашек игры (v3.3.87): тот же тёмный фон с узором и блеском от центра (.wlTurn, word-lane-plate.css), по центру экрана; внутри фраза, перевод, темп дубля, заметка Пита
// (из зеркала), XP (симуляция, rehearsalSim.js) и вопрос «Хочешь ещё?» с кнопками «Ещё одну» (следующая фраза) и «Нет». «Нет» (и «Готово», когда следующего плана нет) уводит игру красиво: окно улетает вверх
// по синусоиде, как пилюля, сцена опускается и растворяется (rehearsalExit.js, ~600 мс), и только потом вызывается onDone — завершение игры (под ней потом экран «Моя память»). lite — без полёта, затухание.
// result — итог симуляции { xp, capped, words, phraseDone, tempo, note } или null, пока не посчитан; onAgain — null, если следующего плана нет.
// Темп (tempoLabel, rehearsalMirror.js): «×1.3» — речь длиннее, чем у Пита, на 30 %; разница меньше 10 % — «как у Пита»; записи нет — «—».
import { useEffect, useRef, useState } from 'react'
import { tempoLabel } from './rehearsalMirror.js'
import { plateLite } from '../player/modules/rotate-phone/wordLanePlateExit.js'
import { startExit, exitMs } from './rehearsalExit.js'

// onShown — итог показан (один раз): карточка игры прогревает озвучку СЛЕДУЮЩЕГО плана, пока ты читаешь итог («Ещё одну» стартует без ожидания)
export default function RehearsalSummary({ plan, result, onAgain = null, onShown = null, onDone }) {
  const ref = useRef(null)
  const timer = useRef(0)
  const [lite] = useState(plateLite) // слабое устройство или reduced-motion: решается один раз при появлении
  const [leaving, setLeaving] = useState(false)
  useEffect(() => { onShown?.() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(timer.current), [])
  const leave = () => { // «Нет» / «Готово»: окно улетает, игра опускается и растворяется, потом — завершение
    if (leaving) return
    setLeaving(true)
    startExit(ref.current, lite)
    timer.current = setTimeout(() => onDone?.(), exitMs(lite))
  }
  return (
    <div ref={ref} className={`wlTurn rhScreen rhSumPlate${lite ? ' wlTurn--lite' : ''}${leaving && lite ? ' wlTurn--leave' : ''}`} data-testid="rh-summary" data-leaving={leaving || undefined}>
      <div className="wlRevealLabel">Получилось</div>
      <div className="wlRevealPhrase" data-testid="rh-summary-phrase">{plan.chunks.join(' ')}</div>
      <div className="rhSumTr" data-testid="rh-summary-translation">{plan.translation || '—'}</div>
      <dl className="rhStats">
        <div><dt>Темп</dt><dd data-testid="rh-summary-tempo">{tempoLabel(result?.tempo)}</dd></div>
        <div className="rhStatNote"><dt>Заметка Пита</dt><dd data-testid="rh-summary-note">{result?.note?.text || '—'}</dd></div>
        <div><dt>XP</dt><dd data-testid="rh-summary-xp">{result ? `+${result.xp}${result.capped ? ' (потолок дня)' : ''}` : '…'}</dd></div>
      </dl>
      {onAgain && <div className="rhSumAsk" data-testid="rh-summary-ask">Хочешь ещё?</div>}
      <div className="rhBtns rhBtns--row">
        {onAgain && <button type="button" className="wlNext" onClick={onAgain} disabled={leaving} data-testid="rh-again">Ещё одну</button>}
        <button type="button" className={onAgain ? 'wlNext rhGhost' : 'wlNext'} onClick={leave} disabled={leaving} data-testid="rh-done">{onAgain ? 'Нет' : 'Готово'}</button>
      </div>
    </div>
  )
}
