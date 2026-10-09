import { liveLine } from './seriesCards.js'
import { GIVE_UP_TEXT } from './restartCards.js'

// Живая строка рядом с кнопкой «Сказать» в блоках серий: во время записи «Слышу: «…»» (текущий промежуточный текст), после итога «Услышали: «…»».
// show=false (шаг серии не совпадает с последней попыткой) — ничего не рисует. view.deafGiveUp — «Микрофон не слышит: закрой приложение и открой снова»
export default function LiveHeard({ view, show = true }) {
  const line = show ? liveLine(view) : null
  const giveUp = show && view?.deafGiveUp && view.status === 'error' // после двух пересозданий микрофон всё ещё глухой: только проба, модуль молчит
  if (!line && !giveUp) return null
  return (<>
    {line && <div className={`apLive apLive-${line.tone}`} data-testid="series-live" aria-live="polite">{line.text}</div>}
    {giveUp && <div className="apLive apLive-deaf" data-testid="deaf-giveup" role="alert">{GIVE_UP_TEXT}</div>}
  </>)
}
