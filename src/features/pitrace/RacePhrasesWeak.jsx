// Блок «Слабые фразы» итога «Встряхни память» (RaceSummary.jsx, под списком слов; данные — raceStatePhrases.phraseSummary): по строке на фразу, с которой было не так — текст фразы, смысл мелко,
// «спутал с …» / «не успел» / «в последний момент» / «круг 1 ✓» круга 1, метка круга 2 (✓ — сказана или узнана, «нечисто» — слово пропущено, ✗ — нет) и прохода 2 «Скажи» «подряд» (✓ — без остановок,
// «с паузами», «нечисто», ✗). Слабая — если хоть что-то не чисто (raceStatePhrases.phraseSummary.weak). Стили — race-phrases-weak.css. Без анимаций.
const r1Note = r => (!r ? '' : r.confusedText ? `спутал с «${r.confusedText}»` : !r.ok ? 'не успел' : r.late ? 'в последний момент' : 'круг 1 ✓')
const r2Mark = r => (!r ? '' : !r.ok ? '✗' : r.clean ? '✓' : 'нечисто')
const p2Mark = r => (!r ? '' : !r.ok ? '✗' : !r.smooth ? 'с паузами' : r.clean ? '✓' : 'нечисто')

export default function RacePhrasesWeak({ phrases }) {
  const weak = (phrases ?? []).filter(p => p.weak)
  if (!weak.length) return null
  return (
    <section className="racePhW" data-testid="race-phrases-weak">
      <h3 className="raceWeakTitle">Слабые фразы</h3>
      <ul className="racePhWList">
        {weak.map(p => (
          <li key={p.key} className="racePhWRow" data-testid="race-phrase-weak">
            <span className="racePhWText"><span className="racePhWPhrase">{p.text}</span>{p.ru && <span className="raceWeakCap">{p.ru}</span>}</span>
            {p.r1 && <span className="racePhWNote" data-ok={p.r1.ok && !p.r1.late ? '' : undefined} data-testid="race-phrase-note">{r1Note(p.r1)}</span>}
            {p.r2 && <span className="racePhWR2" data-ok={p.r2.ok ? '' : undefined} data-testid="race-phrase-r2">круг 2 {r2Mark(p.r2)}</span>}
            {p.p2 && <span className="racePhWR2" data-ok={p.p2.ok && p.p2.clean ? '' : undefined} data-testid="race-phrase-p2">подряд {p2Mark(p.p2)}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}
