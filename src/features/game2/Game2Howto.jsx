import { HOWTO_TITLE, HOWTO_INTRO, HOWTO_STEPS, HOWTO_SHADOW_TITLE, HOWTO_SHADOW_INTRO, HOWTO_SHADOW_HEAD, HOWTO_SHADOW_ROWS, HOWTO_SHADOW_NOTE, HOWTO_HITS, HOWTO_DUE, HOWTO_VOICE, HOWTO_PHONES, HOWTO_DEBUG } from './game2Howto.js'

// Сворачиваемый раздел «Как играть» в блоке стенда (открыт по умолчанию): шаги по режимам, что считается попаданием, слово «к повтору», что озвучить заранее, наушники. Текст — game2Howto.js (он же в CONCEPT_GAME2.md).
export default function Game2Howto() {
  return (
    <details className="g2Howto" open data-testid="g2-howto">
      <summary className="g2HowtoSum">{HOWTO_TITLE}</summary>
      <p className="g2HowtoP">{HOWTO_INTRO}</p>
      <ol className="g2HowtoSteps">
        {HOWTO_STEPS.map(s => <li key={s.id} data-testid={`g2-howto-${s.id}`}><b>{s.title}.</b> {s.text}</li>)}
      </ol>
      <div className="g2HowtoP" data-testid="g2-howto-shadow">
        <b>{HOWTO_SHADOW_TITLE}.</b> {HOWTO_SHADOW_INTRO}
        <table className="g2HowtoTable">
          <thead><tr>{HOWTO_SHADOW_HEAD.map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{HOWTO_SHADOW_ROWS.map(r => <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
        </table>
        {HOWTO_SHADOW_NOTE}
      </div>
      <p className="g2HowtoP" data-testid="g2-howto-hits">{HOWTO_HITS}</p>
      <p className="g2HowtoP" data-testid="g2-howto-due">{HOWTO_DUE}</p>
      <p className="g2HowtoP" data-testid="g2-howto-voice">{HOWTO_VOICE}</p>
      <p className="g2HowtoP" data-testid="g2-howto-phones">{HOWTO_PHONES}</p>
      <p className="g2HowtoP">{HOWTO_DEBUG}</p>
    </details>
  )
}
