import { summaryRows } from './game2Score.js'

// Итог сессии «Мини-игры 2.0» (стенд): плашка в стиле плашек игры (.wlTurn, word-lane-plate.css; рамка и строки — как у итога репетиции, rehearsal.css): сколько слов поймано в «Ловлю», залито в «Тени»,
// «По памяти» и «Скорости». Памяти и XP у стенда нет. «Ещё раз» — сессия сначала, «Готово» — выход. text — фраза над результатами.
export default function Game2Summary({ text, score, onAgain, onDone }) {
  return (
    <div className="wlTurn rhScreen rhSumPlate g2Sum" data-testid="g2-summary">
      <div className="wlRevealLabel">Получилось</div>
      <div className="wlRevealPhrase" data-testid="g2-summary-phrase">{text}</div>
      <dl className="rhStats g2Stats">
        {summaryRows(score).map(r => <div key={r.id}><dt>{r.label}</dt><dd data-testid={`g2-summary-${r.id}`}>{r.text}</dd></div>)}
      </dl>
      <div className="rhBtns rhBtns--row">
        <button type="button" className="wlNext" onClick={onAgain} data-testid="g2-again">Ещё раз</button>
        <button type="button" className="wlNext rhGhost" onClick={onDone} data-testid="g2-done">Готово</button>
      </div>
    </div>
  )
}
