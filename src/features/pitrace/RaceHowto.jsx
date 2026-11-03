import { HOWTO_TITLE, HOWTO_STEPS } from './raceHowto.js'

// Сворачиваемый раздел «Как тестировать» в блоке стенда «Гонка с Питом» (открыт по умолчанию): шесть шагов проверки. Стили — те же, что у «Как играть» «Мини-игры 2.0» (admin-game2-howto.css).
export default function RaceHowto() {
  return (
    <details className="g2Howto" open data-testid="race-howto">
      <summary className="g2HowtoSum">{HOWTO_TITLE}</summary>
      <ol className="g2HowtoSteps">
        {HOWTO_STEPS.map((s, i) => <li key={i} data-testid={`race-howto-${i + 1}`}>{s}</li>)}
      </ol>
    </details>
  )
}
