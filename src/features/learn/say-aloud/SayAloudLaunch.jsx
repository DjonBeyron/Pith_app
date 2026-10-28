import { useState, lazy, Suspense } from 'react'
import { Mic } from 'lucide-react'
import { pickRoundWords, pickRoundFromWords, canSayAloud, canSayAloudWords, MIN_TO_SHOW } from './sayAloudRound.js'

// Кнопка запуска мини-игры «Скажи вслух». Два места: вкладка «Память» (variant 'tab': вторичная кнопка под главным действием, в «Памяти пора отдыхать» — единственное) и окно слова
// (variant 'sheet', withWord — раунд со словом и другими). Видна, когда в памяти есть хотя бы MIN_TO_SHOW слов с переводом, годных для Vosk (sayAloudRound.canSayAloud).
// Тап открывает слой, микрофон здесь НЕ просим: сначала слой проверяет готовность Vosk (нет модели — «Нужно скачать»), и только по тапу «Начать» на готовой модели уходит запрос микрофона (SayAloudOverlay).
// Третье место — итог повторения (review/ReviewSayAloud.jsx): лестницы (view) там нет, слова приходят готовым списком pool [{ word, translation, due, step }], подпись — label, вариант 'summary'.
// Датчик движения не нужен: игра вертикальная. Слой (Пит, дорожки, Vosk) грузится отдельным куском только по тапу — вкладка «Память» его не тянет.
const SayAloudOverlay = lazy(() => import('./SayAloudOverlay.jsx'))

export default function SayAloudLaunch({ view, pool = null, withWord = null, variant = 'tab', label = 'Скажи вслух' }) {
  const [round, setRound] = useState(null) // null | { words }
  if (!(pool ? canSayAloudWords(pool) : canSayAloud(view, withWord))) return null

  function start() {
    const words = pool ? pickRoundFromWords(pool) : pickRoundWords(view, { min: MIN_TO_SHOW, withWord })
    if (words.length < MIN_TO_SHOW) return
    setRound({ words })
  }

  return (
    <>
      <button type="button" className={`sayLaunch sayLaunch--${variant}`} onClick={start} data-testid="say-aloud-launch">
        <Mic size={16} aria-hidden="true" />
        <span>{label}</span>
      </button>
      {round && (
        <Suspense fallback={null}>
          <SayAloudOverlay words={round.words} onClose={() => setRound(null)} />
        </Suspense>
      )}
    </>
  )
}
