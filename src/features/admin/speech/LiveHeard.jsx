import { liveLine } from './seriesCards.js'

// Живая строка рядом с кнопкой «Сказать» в блоках серий: во время записи «Слышу: «…»» (текущий промежуточный текст), после итога «Услышали: «…»».
// show=false (шаг серии не совпадает с последней попыткой) — ничего не рисует
export default function LiveHeard({ view, show = true }) {
  const line = show ? liveLine(view) : null
  if (!line) return null
  return <div className={`apLive apLive-${line.tone}`} data-testid="series-live" aria-live="polite">{line.text}</div>
}
