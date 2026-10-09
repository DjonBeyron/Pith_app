import { stepAsk, heardLine, confLine, plainVerdict, flashVerdict, detailLines, soundsLine } from './seriesCards.js'
import { rulesText } from './contextSeries.js'
import { phraseFor } from './controlSeries.js'

// Карточка одного шага серии «длина контекста»: что нужно сказать (в режиме «контроль» — правильную фразу), что услышали (крупно), вывод простыми словами,
// мелькала ли ошибочная форма по ходу речи, уверенность мелко;
// технические подробности (правила, где литерально, другие варианты, текст по ходу речи) — в сворачиваемом «Подробнее».
export default function SeriesStepCard({ i, cfg, row, on, busy, onPick, mode = 'errors' }) {
  const verdict = plainVerdict(row, cfg)
  const flash = flashVerdict(row)
  const phrase = phraseFor(cfg, i, mode)
  const more = detailLines(row, rulesText(row?.verdicts))
  return (
    <div className={`apStepCard${on ? ' apStepOn' : ''}`} data-testid={`step-card-${i + 1}`}>
      <div className="apStepHead">
        <button className={`aspChip${on ? ' aspChipOn' : ''}`} disabled={busy} onClick={() => onPick(i)}>Шаг {i + 1}</button>
        <span className="apStepTitle">— {stepAsk(phrase, cfg.word, mode)}</span>
      </div>
      <div className={`apHeard${row ? '' : ' apHeardNone'}`}>{heardLine(row)}</div>
      {verdict.text && <div className={`apVerdict apV-${verdict.tone}`}>{verdict.text}</div>}
      {flash && <div className={`apVerdict apV-${flash.tone}`} data-testid={`step-flash-${i + 1}`}>{flash.text}</div>}
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
