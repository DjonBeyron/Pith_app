import { accNote } from './raceAccuracyNote.js'

// Полоса точности слова в списке итога «Встряхни память» (RaceSummary.jsx; расчёт — raceAccuracy.js, расшифровка — raceAccuracyNote.js, стили — race-accuracy.css): дорожка с заливкой по проценту,
// цвет — ступень «Моей памяти» по уровню точности (raceAcc--0 … raceAcc--4: < 40 красноватый, дальше --lvl1…--lvl4), справа число процентов, под полосой расшифровка одной строкой мелким. Без анимаций.
export default function RaceAccuracyBar({ acc }) {
  if (!acc) return null
  const note = accNote(acc)
  return (
    <div className={`raceAcc raceAcc--${acc.level}`} data-testid="race-acc" data-level={acc.level}>
      <div className="raceAccRow">
        <span className="raceAccTrack" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={acc.pct} aria-label="Точность"><span className="raceAccFill" style={{ width: `${acc.pct}%` }} /></span>
        <b className="raceAccPct" data-testid="race-acc-pct">{acc.pct} %</b>
      </div>
      {note && <span className="raceAccNote" data-testid="race-acc-note">{note}</span>}
    </div>
  )
}
