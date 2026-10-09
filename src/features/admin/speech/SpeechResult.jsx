import { useMemo } from 'react'
import { matchBest } from './speechMatch.js'

// Сравнение итога с эталоном: слова эталона зелёные (услышаны) / красные тусклые (пропущены), лишние — серым,
// процент и вердикт. Берём лучшую из alternatives (maxAlternatives).
export default function SpeechResult({ reference, alternatives }) {
  const m = useMemo(() => matchBest(reference, alternatives.map(a => a.text)), [reference, alternatives])
  const pct = Math.round(m.ratio * 100)
  return (
    <div className="aspMatch">
      <div className="aspWords" aria-label="Сравнение с эталоном">
        {m.items.map((it, i) => (
          <span key={i} className={it.ok ? 'aspW aspWOk' : 'aspW aspWMiss'}>{it.word}</span>
        ))}
      </div>
      {m.extra.length > 0 && (
        <div className="aspExtra">Лишнее: {m.extra.map((w, i) => <span key={i} className="aspW aspWExtra">{w}</span>)}</div>
      )}
      <div className={`aspVerdict ${m.passed ? 'aspVerdictOk' : 'aspVerdictNo'}`}>
        {pct}% слов · {m.passed ? 'засчитано' : 'нет'}
      </div>
      {alternatives.length > 1 && m.index > 0 && (
        <div className="aspHint">Лучший вариант — не первый, а №{m.index + 1}</div>
      )}
    </div>
  )
}
