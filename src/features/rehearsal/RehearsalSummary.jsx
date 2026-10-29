// Итог репетиции (акт 6): фраза, перевод, темп дубля и заметка Пита (из зеркала), XP (симуляция, rehearsalSim.js), «Ещё минутку?» — следующая фраза, «Готово» — выйти.
// result — итог симуляции { xp, capped, words, phraseDone, tempo, note } или null, пока не посчитан; onAgain — null, если следующего плана нет.
// Темп (tempoLabel, rehearsalMirror.js): «×1.3» — речь длиннее, чем у Пита, на 30 %; разница меньше 10 % — «как у Пита»; записи нет — «—».
import { tempoLabel } from './rehearsalMirror.js'

export default function RehearsalSummary({ plan, result, onAgain = null, onDone }) {
  return (
    <div className="wlReveal rhScreen rhSummary" data-testid="rh-summary">
      <div className="wlRevealLabel">Фраза твоя</div>
      <div className="wlRevealPhrase" data-testid="rh-summary-phrase">{plan.chunks.join(' ')}</div>
      <div className="rhSumTr" data-testid="rh-summary-translation">{plan.translation || '—'}</div>
      <dl className="rhStats">
        <div><dt>Темп</dt><dd data-testid="rh-summary-tempo">{tempoLabel(result?.tempo)}</dd></div>
        <div className="rhStatNote"><dt>Заметка Пита</dt><dd data-testid="rh-summary-note">{result?.note?.text || '—'}</dd></div>
        <div><dt>XP</dt><dd data-testid="rh-summary-xp">{result ? `+${result.xp}${result.capped ? ' (потолок дня)' : ''}` : '…'}</dd></div>
      </dl>
      <div className="rhBtns">
        {onAgain && <button type="button" className="wlNext" onClick={onAgain} data-testid="rh-again">Ещё минутку?</button>}
        <button type="button" className={onAgain ? 'wlNext rhGhost' : 'wlNext'} onClick={onDone} data-testid="rh-done">Готово</button>
      </div>
    </div>
  )
}
