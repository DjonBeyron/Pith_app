import { stepAsk, heardLine, confLine, plainVerdict, detailLines, soundsLine } from './seriesCards.js'
import { wrongPhrase, rulesText } from './contextSeries.js'

// Карточка одного шага серии «длина контекста»: что нужно сказать, что услышали (крупно), вывод простыми словами, уверенность мелко;
// технические подробности (правила, где литерально, другие варианты, текст по ходу речи) — в сворачиваемом «Подробнее».
export default function SeriesStepCard({ i, cfg, row, on, busy, onPick }) {
  const verdict = plainVerdict(row, cfg)
  const phrase = wrongPhrase(cfg.refs[i], cfg.word, cfg.wrong)
  const more = detailLines(row, rulesText(row?.verdicts))
  return (
    <div className={`apStepCard${on ? ' apStepOn' : ''}`} data-testid={`step-card-${i + 1}`}>
      <div className="apStepHead">
        <button className={`aspChip${on ? ' aspChipOn' : ''}`} disabled={busy} onClick={() => onPick(i)}>Шаг {i + 1}</button>
        <span className="apStepTitle">— {stepAsk(phrase, cfg.word)}</span>
      </div>
      <div className={`apHeard${row ? '' : ' apHeardNone'}`}>{heardLine(row)}</div>
      {verdict.text && <div className={`apVerdict apV-${verdict.tone}`}>{verdict.text}</div>}
      {confLine(row) && <div className="aspHint">{confLine(row)}</div>}
      {soundsLine(row) && <div className="aspHint" data-testid="step-sounds">{soundsLine(row)}</div>}
      {more.length > 0 && (
        <details className="apMore">
          <summary>Подробнее</summary>
          <ul className="apDetList">{more.map(t => <li key={t}>{t}</li>)}</ul>
        </details>
      )}
    </div>
  )
}
