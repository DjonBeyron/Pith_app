// Итог репетиции (акт 6): фраза, перевод, темп и заметка Пита (пока «—»: их даст зеркало), XP (симуляция, rehearsalSim.js), «Ещё минутку?» — следующая фраза, «Готово» — выйти.
// result — итог симуляции { xp, capped, words, phraseDone } или null, пока не посчитан; onAgain — null, если следующего плана нет.
export default function RehearsalSummary({ plan, result, onAgain = null, onDone }) {
  return (
    <div className="wlReveal rhScreen rhSummary" data-testid="rh-summary">
      <div className="wlRevealLabel">Фраза твоя</div>
      <div className="wlRevealPhrase" data-testid="rh-summary-phrase">{plan.chunks.join(' ')}</div>
      <div className="rhSumTr" data-testid="rh-summary-translation">{plan.translation || '—'}</div>
      <dl className="rhStats">
        <div><dt>Темп</dt><dd data-testid="rh-summary-tempo">—</dd></div>
        <div><dt>Заметка Пита</dt><dd data-testid="rh-summary-note">—</dd></div>
        <div><dt>XP</dt><dd data-testid="rh-summary-xp">{result ? `+${result.xp}${result.capped ? ' (потолок дня)' : ''}` : '…'}</dd></div>
      </dl>
      <div className="rhBtns">
        {onAgain && <button type="button" className="wlNext" onClick={onAgain} data-testid="rh-again">Ещё минутку?</button>}
        <button type="button" className={onAgain ? 'wlNext rhGhost' : 'wlNext'} onClick={onDone} data-testid="rh-done">Готово</button>
      </div>
    </div>
  )
}
